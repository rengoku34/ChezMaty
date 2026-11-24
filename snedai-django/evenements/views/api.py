"""Interface JSON de l'application mobile (/api/v1).

Elle n'utilise ni cookie ni session : chaque requête porte un jeton « Authorization: Bearer … ».
Sans cookie, il n'y a pas de risque CSRF, d'où l'absence de contrôle CSRF ici.
"""
import functools
import hashlib
import json
import logging
import re
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.http import HttpResponse, JsonResponse
from django.utils import timezone

from ..models import ApiToken, Event, PendingSignup, User
from ..security import rate_limited
from ..services import queries
from ..services.attendance import confirm_attendance, scan_code
from ..services.calendar_links import calendar_links, event_times, next_event
from ..services.formatting import event_day, event_hours, event_range, event_date, timestamp
from ..services.mailer import get_mailer
from ..services.qr import qr_content
from ..services.validation import clean, signup_error
from ..services.verification import CODE_TTL, MAX_ATTEMPTS, RESEND_DELAY_SECONDS, code_matches, generate_code, hash_code

logger = logging.getLogger(__name__)
TOKEN_TTL_DAYS = 90
DUMMY_HASH = make_password('mot-de-passe-factice-1')
limited = rate_limited('login', api=True)


def fail(status, message, **extra):
    return JsonResponse({'ok': False, 'message': message, **extra}, status=status)


def unauthorized():
    return fail(401, 'Session expirée, reconnectez-vous.', code='unauthorized')


def sha256(value):
    return hashlib.sha256(value.encode()).hexdigest()


def body_of(request):
    try:
        data = json.loads(request.body or b'{}')
    except ValueError:
        return {}
    return data if isinstance(data, dict) else {}


def api(*methods, auth=False, agent=False):
    """Vue d'API : méthode HTTP vérifiée, corps JSON lu, jeton contrôlé, réponse toujours en JSON."""
    def decorator(view):
        @functools.wraps(view)
        def wrapper(request, *args, **kwargs):
            if request.method not in methods:
                return fail(405, 'Méthode non autorisée.')
            request.data = body_of(request) if request.method == 'POST' else {}
            if auth:
                match = re.fullmatch(r'Bearer ([A-Za-z0-9_-]{32,64})', request.headers.get('Authorization', ''))
                if not match:
                    return unauthorized()
                token = ApiToken.objects.select_related('user').filter(token_hash=sha256(match.group(1)), expires_at__gt=timezone.now()).first()
                if not token:
                    return unauthorized()
                # La validité du jeton est prolongée à chaque usage, au plus une fois par heure.
                if timezone.now() - token.last_used_at > timedelta(hours=1):
                    ApiToken.objects.filter(pk=token.pk).update(last_used_at=timezone.now(), expires_at=timezone.now() + timedelta(days=TOKEN_TTL_DAYS))
                request.user, request.token = token.user, token
                if agent and not request.user.can_scan:
                    return fail(403, 'Réservé aux agents de scan.')
            response = view(request, *args, **kwargs)
            response.headers['Cache-Control'] = 'no-store'
            return response
        return wrapper
    return decorator


def public_user(user):
    return {'id': user.id, 'nom': user.nom, 'prenom': user.prenom, 'email': user.email, 'filiale': user.filiale, 'role': user.role}


def issue_token(user, device):
    token = secrets.token_urlsafe(32)
    ApiToken.objects.create(user=user, token_hash=sha256(token), device=clean(device, 80), expires_at=timezone.now() + timedelta(days=TOKEN_TTL_DAYS))
    return token


def iso(date):
    return date.strftime('%Y-%m-%dT%H:%M:%S.000Z')


def serialize_event(event, participation):
    """Les textes (dates, horaires…) sont mis en forme par le serveur : l'application les affiche tels quels."""
    times = event_times(event)
    now = timezone.now()
    day = event_day(event.debut)
    return {
        'id': event.id, 'titre': event.titre, 'description': event.description, 'lieu': event.lieu or '',
        'termine': bool(event.termine_at),
        'photo': f'/api/v1/events/{event.id}/photo' if event.has_photo else None,
        'quand': event_range(event.debut, event.fin),
        'date': event_date(event.debut).split(' à ')[0],
        'heures': event_hours(event.debut, event.fin) if event.debut else '',
        'jour': day['jour'] if day else None, 'mois': day['mois'] if day else None,
        'debut': iso(times[0]) if times else None, 'fin': iso(times[1]) if times else None,
        'enCours': bool(times and times[0] <= now < times[1]),
        'participation': {'confirme': True, 'present': bool(participation.scanne_at), 'scanneLe': timestamp(participation.scanne_at) if participation.scanne_at else None} if participation else None,
    }


def event_detail(event, participation):
    links = None if event.termine_at else calendar_links(event)
    return {
        'ok': True, 'event': serialize_event(event, participation),
        # QR code à afficher : seulement tant que la présence n'est pas validée et que l'événement est en cours.
        'billet': {'qr': qr_content(participation.qr_token)} if participation and not participation.scanne_at and not event.termine_at else None,
        'agenda': {'google': links['google'], 'outlook': links['outlook']} if links else None,
    }


def load_event(view):
    @functools.wraps(view)
    def wrapper(request, event_id, *args, **kwargs):
        event = Event.objects.filter(pk=event_id).first()
        if not event:
            return fail(404, 'Cet événement n’existe pas.')
        return view(request, event, *args, **kwargs)
    return wrapper


# ---------- Public
@api('GET')
def config(request):
    return JsonResponse({'ok': True, 'filiales': settings.FILIALES, 'inscriptionParEmail': get_mailer().configured})


# ---------- Connexion
@api('POST')
@limited
def login(request):
    email = clean(request.data.get('email'), 200).lower()
    password = str(request.data.get('password') or '')
    user = User.objects.by_email(email) if email else None
    valid = check_password(password, user.password if user else DUMMY_HASH)
    if not user or not valid:
        return fail(401, 'Adresse e-mail ou mot de passe incorrect.')
    ApiToken.objects.filter(expires_at__lt=timezone.now()).delete()
    return JsonResponse({'ok': True, 'token': issue_token(user, request.data.get('appareil')), 'user': public_user(user)})


@api('POST', auth=True)
def logout(request):
    request.token.delete()
    return JsonResponse({'ok': True})


@api('GET', auth=True)
def me(request):
    return JsonResponse({'ok': True, 'user': public_user(request.user)})


# ---------- Inscription : étape 1, envoi du code par e-mail
@api('POST')
@limited
def signup(request):
    data = request.data
    values = {key: clean(data.get(key), 200 if key == 'email' else 100) for key in ('nom', 'prenom', 'filiale', 'email')}
    values['email'] = values['email'].lower()
    password = str(data.get('password') or '')
    error = signup_error(values, password, str(data.get('confirmation') or ''), settings.FILIALES)
    if error:
        return fail(400, error)
    if User.objects.by_email(values['email']):
        return fail(409, 'Un compte existe déjà avec cette adresse. Connectez-vous.')
    mailer = get_mailer()
    if not mailer.configured:
        return fail(503, 'La confirmation par e-mail n’est pas disponible pour le moment.')

    signup_id, code = secrets.token_urlsafe(18), generate_code()
    PendingSignup.objects.filter(email__iexact=values['email']).delete()
    PendingSignup.objects.filter(expires_at__lt=timezone.now()).delete()
    PendingSignup.objects.create(id=signup_id, **values, password_hash=make_password(password), code_hash=hash_code(code), expires_at=timezone.now() + CODE_TTL)
    try:
        mailer.send_verification_code(values['email'], values['prenom'], code)
    except Exception as error:
        logger.error('Code non envoyé à %s : %s', values['email'], error)
        PendingSignup.objects.filter(pk=signup_id).delete()
        return fail(502, 'Le code n’a pas pu être envoyé : le service d’e-mail est momentanément indisponible. Réessayez dans quelques minutes.')
    return JsonResponse({'ok': True, 'signupId': signup_id, 'email': values['email'], 'expiresInMinutes': int(CODE_TTL.total_seconds() // 60), 'resendInSeconds': RESEND_DELAY_SECONDS}, status=201)


# ---------- Inscription : étape 2, saisie du code
@api('POST')
@limited
def signup_verify(request):
    pending = PendingSignup.objects.filter(pk=clean(request.data.get('signupId'), 64)).first()
    if not pending:
        return fail(404, 'Inscription introuvable ou expirée. Recommencez.', code='signup_expired')
    if pending.expires_at < timezone.now():
        return fail(400, 'Ce code a expiré. Demandez-en un nouveau.', code='code_expired')
    if pending.attempts >= MAX_ATTEMPTS:
        return fail(429, 'Trop d’essais. Demandez un nouveau code.', code='too_many_attempts')
    if not code_matches(request.data.get('code'), pending.code_hash):
        PendingSignup.objects.filter(pk=pending.pk).update(attempts=pending.attempts + 1)
        left = MAX_ATTEMPTS - (pending.attempts + 1)
        return fail(400, f'Code incorrect. Il vous reste {left} essai(s).' if left > 0 else 'Trop d’essais. Demandez un nouveau code.', restants=max(left, 0))
    if User.objects.by_email(pending.email):
        pending.delete()
        return fail(409, 'Un compte existe déjà avec cette adresse. Connectez-vous.')
    user = User(nom=pending.nom, prenom=pending.prenom, filiale=pending.filiale, email=pending.email, password=pending.password_hash)
    user.save()
    pending.delete()
    mailer = get_mailer()
    mailer.in_background(f'Bienvenue non envoyé à {user.email}', mailer.send_welcome, user)
    return JsonResponse({'ok': True, 'token': issue_token(user, request.data.get('appareil')), 'user': public_user(user)}, status=201)


@api('POST')
@limited
def signup_resend(request):
    pending = PendingSignup.objects.filter(pk=clean(request.data.get('signupId'), 64)).first()
    if not pending:
        return fail(404, 'Inscription introuvable ou expirée. Recommencez.', code='signup_expired')
    wait = int((pending.sent_at + timedelta(seconds=RESEND_DELAY_SECONDS) - timezone.now()).total_seconds()) + 1
    if wait > 0:
        return fail(429, f'Patientez encore {wait} s avant de demander un nouveau code.', retryInSeconds=wait)
    code = generate_code()
    PendingSignup.objects.filter(pk=pending.pk).update(code_hash=hash_code(code), expires_at=timezone.now() + CODE_TTL, sent_at=timezone.now(), attempts=0)
    try:
        get_mailer().send_verification_code(pending.email, pending.prenom, code)
    except Exception as error:
        logger.error('Code non renvoyé à %s : %s', pending.email, error)
        return fail(502, 'Le code n’a pas pu être envoyé. Réessayez plus tard.')
    return JsonResponse({'ok': True, 'resendInSeconds': RESEND_DELAY_SECONDS})


# ---------- Événements
@api('GET', auth=True)
def events(request):
    actifs, termines = queries.active_events(), queries.finished_events()
    mine = queries.participations_for(request.user)
    prochain = next_event(actifs)
    return JsonResponse({
        'ok': True,
        'actifs': [serialize_event(e, mine.get(e.id)) for e in actifs],
        'termines': [serialize_event(e, mine.get(e.id)) for e in termines],
        'prochainId': prochain['event'].id if prochain else None,
    })


@api('GET', auth=True)
def event_photo(request, event_id):
    row = Event.objects.filter(pk=event_id, photo_type__isnull=False).values_list('photo_data', 'photo_type').first()
    if not row or not row[0]:
        return HttpResponse(status=404)
    response = HttpResponse(bytes(row[0]), content_type=row[1])
    response.headers['Cache-Control'] = 'private, max-age=86400'
    return response


@api('GET', auth=True)
@load_event
def event_get(request, event):
    return JsonResponse(event_detail(event, queries.participations_for(request.user).get(event.id)))


@api('POST', auth=True)
@load_event
def participer(request, event):
    if event.termine_at:
        return fail(409, 'Cet événement est terminé.')
    participation, _, emailed = confirm_attendance(event, request.user)
    return JsonResponse({**event_detail(event, participation), 'emailed': emailed})


@api('POST', auth=True)
@load_event
def annuler(request, event):
    if event.termine_at:
        return fail(409, 'Cet événement est terminé.')
    queries.cancel_participation(event, request.user)
    return JsonResponse(event_detail(event, queries.participations_for(request.user).get(event.id)))


# ---------- Scan (agents et administrateur)
@api('POST', auth=True, agent=True)
def scan(request):
    status, body = scan_code(request.data.get('code'), request.user)
    return JsonResponse(body, status=status)
