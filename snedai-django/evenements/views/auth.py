"""Inscription, connexion (e-mail + mot de passe, ou Google) et déconnexion."""
import logging
import math
import secrets
import time
from urllib.parse import urlencode

import requests
from django.conf import settings
from django.contrib import messages
from django.contrib.auth import login, logout
from django.contrib.auth.hashers import check_password, make_password
from django.db import IntegrityError
from django.http import HttpResponse
from django.shortcuts import redirect, render
from django.views.decorators.http import require_http_methods, require_POST

from ..models import User
from ..security import rate_limited
from ..services.mailer import get_mailer
from ..services.validation import clean, signup_error
from ..services.verification import CODE_TTL, MAX_ATTEMPTS, RESEND_DELAY_SECONDS, code_matches, generate_code, hash_code

logger = logging.getLogger(__name__)
BACKEND = 'django.contrib.auth.backends.ModelBackend'
# Comparaison factice : le temps de réponse ne révèle pas si l'adresse existe.
DUMMY_HASH = make_password('mot-de-passe-factice-1')


def render_form(request, onglet='connexion', status=200, error=None, values=None):
    return render(request, 'auth.html', {
        'title': 'Créer mon compte' if onglet == 'inscription' else 'Se connecter',
        'onglet': onglet, 'error': error, 'values': values or {}, 'filiales': settings.FILIALES,
        'google_enabled': settings.GOOGLE_ENABLED, 'email_signup_enabled': get_mailer().configured,
    }, status=status)


def finish_login(request, user):
    return_to = request.session.get('return_to')
    login(request, user, backend=BACKEND)
    request.session.pop('return_to', None)
    safe = return_to and return_to.startswith('/') and not return_to.startswith('//')
    return redirect(return_to if safe else '/')


@require_http_methods(['GET', 'POST'])
@rate_limited('login')
def connexion(request):
    if request.method == 'GET':
        if request.user.is_authenticated:
            return redirect('/')
        return render_form(request, 'inscription' if request.GET.get('onglet') == 'inscription' else 'connexion')

    # Reconnexion rapide avec l'adresse e-mail et le mot de passe choisis à l'inscription.
    email = clean(request.POST.get('email'), 200).lower()
    password = str(request.POST.get('password') or '')
    user = User.objects.by_email(email) if email else None
    valid = check_password(password, user.password if user else DUMMY_HASH)
    if not user or not valid:
        return render_form(request, status=401, error='Adresse e-mail ou mot de passe incorrect.')
    return finish_login(request, user)


def legal_context(title):
    return {'title': title, 'admin_contact': get_mailer().sender or (settings.ADMIN_EMAILS[0] if settings.ADMIN_EMAILS else '')}


def confidentialite(request):
    return render(request, 'legal/confidentialite.html', legal_context('Politique de confidentialité'))


def conditions(request):
    return render(request, 'legal/conditions.html', legal_context('Conditions d’utilisation'))


def _send_code(pending):
    """Code de confirmation : 6 chiffres, valable 15 minutes, 5 essais au maximum ; seule son empreinte est gardée."""
    code = generate_code()
    pending.update(code_hash=hash_code(code), expires=time.time() + CODE_TTL.total_seconds(), sent_at=time.time(), attempts=0)
    get_mailer().send_verification_code(pending['email'], pending['prenom'], code)


def render_code(request, pending, status=200, error=None, info=None):
    return render(request, 'verify_code.html', {'title': 'Confirmer mon adresse e-mail', 'email': pending['email'], 'error': error, 'info': info}, status=status)


@require_POST
@rate_limited('login')
def inscription(request):
    """Nom, prénom, filiale, e-mail et mot de passe du site. L'adresse est ensuite confirmée par un code envoyé
    par e-mail, ou par Google (au choix de la personne)."""
    values = {key: clean(request.POST.get(key), 200 if key == 'email' else 100) for key in ('nom', 'prenom', 'filiale', 'email')}
    values['email'] = values['email'].lower()
    methode = 'google' if request.POST.get('methode') == 'google' else 'email'
    password = str(request.POST.get('password') or '')
    mailer = get_mailer()

    error = signup_error(values, password, str(request.POST.get('password_confirmation') or ''), settings.FILIALES)
    if not error and User.objects.by_email(values['email']):
        error = 'Un compte existe déjà avec cette adresse. Connectez-vous.'
    elif not error and methode == 'google' and not settings.GOOGLE_ENABLED:
        error = 'La connexion Google n’est pas encore configurée sur le serveur.'
    elif methode == 'email' and not mailer.configured:
        error = 'La confirmation par e-mail n’est pas encore disponible. Utilisez « Continuer avec Google ».'
    if error:
        return render_form(request, 'inscription', 400, error, values)

    password_hash = make_password(password)
    if methode == 'google':
        request.session['pending_signup'] = {**values, 'password_hash': password_hash}
        return redirect('/auth/google')

    pending = {**values, 'password_hash': password_hash}
    try:
        _send_code(pending)
    except Exception as error:
        logger.error('Code non envoyé à %s : %s', values['email'], error)
        fallback = ' Vous pouvez aussi continuer avec Google.' if settings.GOOGLE_ENABLED else ''
        return render_form(request, 'inscription', 502, f'Le code n’a pas pu être envoyé : le service d’e-mail est momentanément indisponible. Réessayez dans quelques minutes ou prévenez l’administrateur.{fallback}', values)
    request.session['email_signup'] = pending
    return redirect('/inscription/code')


@require_http_methods(['GET', 'POST'])
@rate_limited('login')
def inscription_code(request):
    pending = request.session.get('email_signup')
    if not pending:
        return redirect('/connexion?onglet=inscription')
    if request.method == 'GET':
        return render_code(request, pending)

    if time.time() > pending['expires']:
        return render_code(request, pending, 400, 'Ce code a expiré. Demandez-en un nouveau.')
    if pending['attempts'] >= MAX_ATTEMPTS:
        return render_code(request, pending, 429, 'Trop d’essais. Demandez un nouveau code.')
    if not code_matches(request.POST.get('code'), pending['code_hash']):
        pending['attempts'] += 1
        request.session['email_signup'] = pending
        left = MAX_ATTEMPTS - pending['attempts']
        return render_code(request, pending, 400, f'Code incorrect. Il vous reste {left} essai(s).' if left > 0 else 'Trop d’essais. Demandez un nouveau code.')
    if User.objects.by_email(pending['email']):
        request.session.pop('email_signup', None)
        return render_form(request, status=400, error='Un compte existe déjà avec cette adresse. Connectez-vous.')

    try:
        user = User(nom=pending['nom'], prenom=pending['prenom'], filiale=pending['filiale'], email=pending['email'], password=pending['password_hash'])
        user.save()
    except IntegrityError:
        request.session.pop('email_signup', None)
        return render_form(request, status=400, error='Un compte existe déjà avec cette adresse. Connectez-vous.')
    request.session.pop('email_signup', None)
    messages.success(request, f'Bienvenue {user.prenom}, votre adresse est confirmée et votre compte est créé !')
    get_mailer().in_background(f'Bienvenue non envoyé à {user.email}', get_mailer().send_welcome, user)
    return finish_login(request, user)


@require_POST
@rate_limited('login')
def inscription_renvoyer(request):
    pending = request.session.get('email_signup')
    if not pending:
        return redirect('/connexion?onglet=inscription')
    wait = math.ceil(pending['sent_at'] + RESEND_DELAY_SECONDS - time.time())
    if wait > 0:
        return render_code(request, pending, 429, f'Patientez encore {wait} s avant de demander un nouveau code.')
    try:
        _send_code(pending)
    except Exception as error:
        logger.error('Code non renvoyé à %s : %s', pending['email'], error)
        return render_code(request, pending, 502, 'Le code n’a pas pu être envoyé. Réessayez plus tard.')
    request.session['email_signup'] = pending
    return render_code(request, pending, info='Un nouveau code vient de vous être envoyé.')


# ---------- Google (flux OAuth « code d'autorisation »)
def google_redirect_uri():
    return f'{settings.APP_URL}/auth/google/callback'


def google_start(request):
    if not settings.GOOGLE_ENABLED:
        return render_form(request, status=503, error='La connexion Google n’est pas encore configurée.')
    state = secrets.token_urlsafe(24)
    request.session['google_state'] = state
    params = {
        'client_id': settings.GOOGLE_CLIENT_ID, 'redirect_uri': google_redirect_uri(), 'response_type': 'code',
        'scope': 'openid profile email', 'state': state, 'prompt': 'select_account',
    }
    hint = (request.session.get('pending_signup') or {}).get('email')
    if hint:  # pendant une inscription, Google propose directement le compte de l'adresse saisie
        params['login_hint'] = hint
    return redirect('https://accounts.google.com/o/oauth2/v2/auth?' + urlencode(params))


def fetch_google_profile(code):
    token = requests.post('https://oauth2.googleapis.com/token', data={
        'code': code, 'client_id': settings.GOOGLE_CLIENT_ID, 'client_secret': settings.GOOGLE_CLIENT_SECRET,
        'redirect_uri': google_redirect_uri(), 'grant_type': 'authorization_code',
    }, timeout=15)
    token.raise_for_status()
    info = requests.get('https://openidconnect.googleapis.com/v1/userinfo', headers={'Authorization': f'Bearer {token.json()["access_token"]}'}, timeout=15)
    info.raise_for_status()
    data = info.json()
    return {'id': data.get('sub'), 'email': (data.get('email') or '').lower(), 'verified': data.get('email_verified', True)}


def handle_google_profile(pending, profile):
    """Création du compte si une inscription est en attente, sinon connexion d'un compte existant."""
    email = profile['email']
    if not email or profile['verified'] is False:
        return {'error': 'Google n’a pas fourni d’adresse e-mail vérifiée.'}

    if pending:
        # Google confirme que l'adresse saisie dans le formulaire appartient bien à la personne.
        if pending.get('email') and pending['email'] != email:
            return {'error': f'Le compte Google choisi ({email}) ne correspond pas à l’adresse saisie ({pending["email"]}). Recommencez en choisissant le bon compte Google.', 'signup': True}
        if User.objects.by_email(email) or User.objects.filter(google_id=profile['id']).exists():
            return {'error': 'Un compte existe déjà avec cette adresse Google. Connectez-vous.'}
        user = User(nom=pending['nom'], prenom=pending['prenom'], filiale=pending['filiale'], email=email, password=pending['password_hash'], google_id=profile['id'])
        user.save()
        return {'user': user, 'created': True}

    user = User.objects.filter(google_id=profile['id']).first()
    if not user:
        user = User.objects.by_email(email)
        if user and not user.google_id:
            user.google_id = profile['id']
            user.save(update_fields=['google_id'])
    if not user:
        return {'error': 'Aucun compte n’existe pour cette adresse. Créez d’abord votre compte.'}
    return {'user': user}


def google_callback(request):
    if not settings.GOOGLE_ENABLED:
        return redirect('/connexion')
    pending = request.session.pop('pending_signup', None)
    state = request.session.pop('google_state', None)
    code = request.GET.get('code')
    if not code or not state or not secrets.compare_digest(state, request.GET.get('state', '')):
        return render_form(request, status=400, error='Connexion Google annulée.')
    try:
        profile = fetch_google_profile(code)
    except Exception as error:
        logger.error('Connexion Google : %s', error)
        return render_form(request, status=502, error='Google n’a pas répondu. Réessayez dans un instant.')

    result = handle_google_profile(pending, profile)
    if 'user' not in result:
        onglet = 'inscription' if result.get('signup') or 'Créez' in result['error'] else 'connexion'
        return render_form(request, onglet, 400, result['error'])
    user = result['user']
    if result.get('created'):
        messages.success(request, f'Bienvenue {user.prenom}, votre compte est créé ! Un e-mail de bienvenue vous a été envoyé.')
        get_mailer().in_background(f'Bienvenue non envoyé à {user.email}', get_mailer().send_welcome, user)
    return finish_login(request, user)


@require_POST
def deconnexion(request):
    logout(request)
    response = redirect('/connexion')
    # Vide le cache du navigateur : le bouton « Retour » ne réaffiche plus les pages privées.
    response.headers['Clear-Site-Data'] = '"cache"'
    return response
