"""Pages réservées à l'administrateur : publier, voir les listes, exporter, terminer un événement, gérer les comptes."""
import logging
import re
import unicodedata

from django.contrib import messages
from django.http import HttpResponse
from django.shortcuts import redirect, render
from django.utils import timezone
from django.views.decorators.http import require_http_methods, require_POST

from ..models import Event, User
from ..security import admin_required, not_found
from ..services import queries
from ..services.excel import LIST_NAMES, build_event_workbook
from ..services.mailer import get_mailer
from ..services.report import build_event_report
from ..services.stats import event_rates, filiale_rows
from ..services.validation import clean
from .site import load_event

logger = logging.getLogger(__name__)
IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
MAX_PHOTO_MB = 3
DATETIME = re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$')


def read_event_form(request):
    """Lit et vérifie les champs du formulaire d'événement (création ou modification)."""
    values = {
        'titre': clean(request.POST.get('titre'), 150), 'description': clean(request.POST.get('description'), 5000),
        'lieu': clean(request.POST.get('lieu'), 200), 'debut': clean(request.POST.get('debut'), 16), 'fin': clean(request.POST.get('fin'), 16),
    }
    photo = request.FILES.get('photo')
    error = None
    if photo and photo.content_type not in IMAGE_TYPES:
        error = 'Photo invalide : utilisez un fichier JPG, PNG, WEBP ou GIF.'
    elif photo and photo.size > MAX_PHOTO_MB * 1024 * 1024:
        error = f'La photo ne doit pas dépasser {MAX_PHOTO_MB} Mo.'
    elif not values['titre'] or not values['description']:
        error = 'Le sujet et la description sont obligatoires.'
    elif (values['debut'] and not DATETIME.match(values['debut'])) or (values['fin'] and not DATETIME.match(values['fin'])):
        error = 'Horaires invalides.'
    elif values['fin'] and not values['debut']:
        error = 'Indiquez l’heure de début avant l’heure de fin.'
    elif values['debut'] and values['fin'] and values['fin'] < values['debut']:
        error = 'La fin doit être après le début.'
    return values, photo, error


def render_event_form(request, event, values, error=None, status=200):
    return render(request, 'admin_site/new_event.html', {'title': 'Modifier l’événement' if event else 'Publier un événement', 'event': event, 'values': values, 'error': error, 'back_href': f'/admin/tableau-de-bord?evenement={event.id}' if event else '/admin/tableau-de-bord'}, status=status)


@admin_required
def event_new(request):
    return render_event_form(request, None, {})


@require_POST
@admin_required
def event_create(request):
    values, photo, error = read_event_form(request)
    if error:
        return render_event_form(request, None, values, error, 400)
    event = Event(**values)
    if photo:
        event.photo_data, event.photo_type = photo.read(), photo.content_type
    event.save()

    users = list(User.objects.all())
    mailer = get_mailer()
    # Envoi des e-mails en arrière-plan pour ne pas bloquer la page.
    mailer.in_background(f'Annonce de l’événement {event.id}', lambda: logger.info('Événement %s annoncé : %s/%s e-mails envoyés.', event.id, mailer.announce_event(event, users, event.range_text), len(users)))
    messages.success(request, f'Événement publié. Les {len(users)} inscrit(s) sont prévenus par e-mail.' if mailer.configured else 'Événement publié. (Les e-mails ne partent pas : aucun service d’envoi configuré.)')
    return redirect(f'/admin/tableau-de-bord?evenement={event.id}')


@require_http_methods(['GET', 'POST'])
@admin_required
@load_event
def event_edit(request, event):
    """Modification : les inscrits ne sont pas prévenus à nouveau et leurs QR codes restent valables."""
    if request.method == 'GET':
        return render_event_form(request, event, event)
    values, photo, error = read_event_form(request)
    if error:
        return render_event_form(request, event, values, error, 400)
    for key, value in values.items():
        setattr(event, key, value)
    if photo:
        event.photo_data, event.photo_type = photo.read(), photo.content_type
    elif request.POST.get('supprimer_photo') == '1':
        event.photo_data, event.photo_type = None, None
    event.save()
    messages.success(request, 'Événement modifié.')
    return redirect(f'/admin/tableau-de-bord?evenement={event.id}')


@admin_required
def dashboard(request):
    """Tableau de bord d'un événement, choisi dans la liste déroulante (historique)."""
    events = queries.all_events()
    try:
        wanted = int(request.GET.get('evenement', ''))
    except ValueError:
        wanted = None
    event = next((e for e in events if e.id == wanted), events[0] if events else None)
    users = list(User.objects.all())
    confirmes = queries.confirmed(event) if event else []
    presents = queries.present(event) if event else []
    return render(request, 'admin_site/dashboard.html', {
        'title': 'Tableau de bord', 'events': events, 'event': event,
        'inscrits': len(users), 'confirmes_count': len(confirmes), 'presents_count': len(presents),
        'rows_inscrits': [{'nom': u.nom, 'prenom': u.prenom, 'email': u.email, 'filiale': u.filiale, 'date': u.created_at} for u in users],
        'rows_confirmes': [{'nom': p.user.nom, 'prenom': p.user.prenom, 'email': p.user.email, 'filiale': p.user.filiale, 'date': p.confirme_at} for p in confirmes],
        'rows_presents': [{'nom': p.user.nom, 'prenom': p.user.prenom, 'email': p.user.email, 'filiale': p.user.filiale, 'date': p.scanne_at} for p in presents],
        'rates': event_rates(len(users), len(confirmes), len(presents)),
        'filiales': filiale_rows(queries.stats_by_filiale(event)) if event else [],
    })


@admin_required
@load_event
def report_pdf(request, event):
    users, confirmes, presents = list(User.objects.all()), queries.confirmed(event), queries.present(event)
    pdf = build_event_report(event, users, confirmes, presents, filiale_rows(queries.stats_by_filiale(event)), event_rates(len(users), len(confirmes), len(presents)))
    response = HttpResponse(pdf, content_type='application/pdf')
    response.headers['Content-Disposition'] = f'attachment; filename="rapport-snedai-{event.id}.pdf"'
    return response


@admin_required
@load_event
def export_xlsx(request, event):
    """?liste=inscrits|confirmes|presents : une seule liste ; sinon le classeur complet."""
    only = request.GET.get('liste') if request.GET.get('liste') in LIST_NAMES else None
    data = build_event_workbook(event, list(User.objects.all()), queries.confirmed(event), queries.present(event), only)
    slug = re.sub(r'^-|-$', '', re.sub(r'[^\w]+', '-', unicodedata.normalize('NFD', event.titre)))[:50] or 'evenement'
    response = HttpResponse(data, content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    response.headers['Content-Disposition'] = f'attachment; filename="snedai-{event.id}-{slug}{"-" + only if only else ""}.xlsx"'
    return response


@require_POST
@admin_required
@load_event
def event_finish(request, event):
    if not event.termine_at:
        Event.objects.filter(pk=event.pk, termine_at__isnull=True).update(termine_at=timezone.now())
    messages.success(request, f'« {event.titre} » est marqué comme terminé.')
    return redirect(f'/admin/tableau-de-bord?evenement={event.id}')


@admin_required
def accounts(request):
    mailer = get_mailer()
    return render(request, 'admin_site/agents.html', {
        'title': 'Comptes', 'users': User.objects.all(),
        'mail': {'provider': mailer.provider, 'sender': mailer.sender, **mailer.state},
    })


@require_POST
@admin_required
def test_email(request):
    result = get_mailer().send_test(request.user.email)
    if result['ok']:
        messages.success(request, f'E-mail de test envoyé à {request.user.email} depuis {get_mailer().sender}. Regardez aussi dans les « Spams ».')
    else:
        messages.error(request, f'L’e-mail n’est pas parti. Erreur : {result["error"]}')
    return redirect('/admin/agents')


@require_POST
@admin_required
def account_delete(request, user_id):
    """Suppression d'un compte (utile après des tests). Le compte administrateur ne peut pas être supprimé."""
    user = User.objects.filter(pk=user_id).first()
    if not user:
        return redirect('/admin/agents')
    if user.is_admin:
        messages.error(request, 'Le compte administrateur ne peut pas être supprimé.')
        return redirect('/admin/agents')
    user.delete()  # supprime aussi ses réponses aux événements et ses jetons : la personne est déconnectée
    messages.success(request, f'Le compte de {user.prenom} {user.nom} a été supprimé.')
    return redirect('/admin/agents')


@require_POST
@admin_required
def account_agent(request, user_id):
    user = User.objects.filter(pk=user_id).first()
    if user:
        user.is_agent = request.POST.get('agent') == '1'
        user.save(update_fields=['is_agent'])
    return redirect('/admin/agents')
