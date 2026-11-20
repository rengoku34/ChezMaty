"""Pages des employés : accueil (« la maison »), détail d'un événement, billet, agenda, PWA."""
import json
from pathlib import Path

from django.conf import settings
from django.contrib import messages
from django.http import Http404, HttpResponse, JsonResponse
from django.shortcuts import redirect, render
from django.views.decorators.http import require_POST

from ..models import Event
from ..security import agent_required, login_required, not_found
from ..services import queries
from ..services.attendance import confirm_attendance, scan_code
from ..services.calendar_links import build_ics, calendar_links, next_event
from ..services.qr import qr_data_url, qr_png


def load_event(view):
    def wrapper(request, event_id, *args, **kwargs):
        event = Event.objects.filter(pk=event_id).first()
        if not event:
            return not_found(request)
        return view(request, event, *args, **kwargs)
    wrapper.__name__ = view.__name__
    return wrapper


@login_required
def home(request):
    actifs = queries.attach_participations(queries.active_events(), request.user)
    termines = queries.attach_participations(queries.finished_events(), request.user)
    prochain = next_event(actifs)
    return render(request, 'home.html', {'title': 'Accueil', 'actifs': actifs, 'termines': termines, 'prochain': prochain})


@login_required
def event_photo(request, event_id):
    row = Event.objects.filter(pk=event_id, photo_type__isnull=False).values_list('photo_data', 'photo_type').first()
    if not row or not row[0]:
        raise Http404
    response = HttpResponse(bytes(row[0]), content_type=row[1])
    response.headers['Cache-Control'] = 'private, max-age=604800'
    return response


@login_required
@load_event
def event_detail(request, event):
    participation = queries.participations_for(request.user).get(event.id)
    return render(request, 'event.html', {
        'title': event.titre, 'event': event, 'participation': participation,
        'agenda': None if event.termine_at else calendar_links(event),
        'qr': qr_data_url(participation.qr_token) if participation and not participation.scanne_at and not event.termine_at else None,
    })


@require_POST
@login_required
@load_event
def participer(request, event):
    if event.termine_at:
        messages.error(request, 'Cet événement est terminé.')
        return redirect(f'/evenements/{event.id}')
    _, _, emailed = confirm_attendance(event, request.user)
    message = 'Votre présence est notée. Voici votre QR code à présenter à l’entrée.'
    if emailed:
        message += ' Il vous a aussi été envoyé par e-mail.'
    messages.success(request, message)
    return redirect(f'/evenements/{event.id}')


@require_POST
@login_required
@load_event
def annuler(request, event):
    if not event.termine_at:
        queries.cancel_participation(event, request.user)
    messages.info(request, 'Votre participation a été annulée.')
    return redirect(f'/evenements/{event.id}')


@login_required
@load_event
def agenda_ics(request, event):
    ics = build_ics(event)
    if not ics:
        raise Http404
    response = HttpResponse(ics, content_type='text/calendar; charset=utf-8')
    response.headers['Content-Disposition'] = f'attachment; filename="evenement-{event.id}.ics"'
    return response


@login_required
@load_event
def qr_image(request, event):
    participation = queries.participations_for(request.user).get(event.id)
    if not participation:
        raise Http404
    response = HttpResponse(qr_png(participation.qr_token), content_type='image/png')
    response.headers['Content-Disposition'] = f'attachment; filename="qrcode-evenement-{event.id}.png"'
    return response


# ---------- Page de l'agent d'accueil : il scanne le QR code (douchette ou caméra) pour confirmer la venue
@agent_required
def scan_page(request):
    if request.method == 'POST':
        try:
            code = json.loads(request.body or b'{}').get('code')
        except (ValueError, AttributeError):
            code = None
        status, body = scan_code(code, request.user)
        return JsonResponse(body, status=status)
    return render(request, 'scan.html', {'title': 'Scanner les QR codes'})


# ---------- Application installable (téléphone, ordinateur) : manifeste, service worker, lien Android
def manifest(request):
    data = {
        'id': '/', 'name': 'Événements SNEDAI', 'short_name': 'SNEDAI',
        'description': 'Événements internes SNEDAI : confirmez votre présence et retrouvez votre QR code d’entrée.',
        'lang': 'fr', 'start_url': '/', 'scope': '/', 'display': 'standalone', 'categories': ['business', 'productivity'],
        'prefer_related_applications': False, 'background_color': '#eef0f5', 'theme_color': '#26246a',
        'icons': [
            {'src': '/static/img/icon-192.png', 'sizes': '192x192', 'type': 'image/png'},
            {'src': '/static/img/icon-512.png', 'sizes': '512x512', 'type': 'image/png'},
            {'src': '/static/img/icon-maskable-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'},
        ],
    }
    return JsonResponse(data, content_type='application/manifest+json', json_dumps_params={'ensure_ascii': False})


def assetlinks(request):
    if not settings.ANDROID_PACKAGE_NAME or not settings.ANDROID_CERT_SHA256:
        raise Http404
    return JsonResponse([{
        'relation': ['delegate_permission/common.handle_all_urls'],
        'target': {'namespace': 'android_app', 'package_name': settings.ANDROID_PACKAGE_NAME, 'sha256_cert_fingerprints': settings.ANDROID_CERT_SHA256},
    }], safe=False)


def service_worker(request):
    response = HttpResponse((Path(settings.BASE_DIR) / 'static/sw.js').read_text(encoding='utf-8'), content_type='text/javascript; charset=utf-8')
    response.headers['Cache-Control'] = 'no-cache'
    return response
