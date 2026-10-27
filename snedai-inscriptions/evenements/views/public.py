"""
Les VUES PUBLIQUES : le lien d'inscription d'un événement, et la page du billet.
Aucune connexion n'est demandée : n'importe qui ayant le lien peut s'inscrire.
"""
import logging

from django.conf import settings
from django.http import Http404, HttpResponse
from django.shortcuts import redirect, render
from django.views.decorators.http import require_http_methods

from ..models import Event, Inscription
from ..security import rate_limited
from ..services import queries
from ..services.mailer import get_mailer
from ..services.qr import qr_data_url, qr_png
from ..services.validation import clean, inscription_error

logger = logging.getLogger(__name__)


def envoyer_billet(inscription):
    """Envoie le QR code par e-mail. Une panne d'envoi ne doit pas empêcher l'inscription : on renvoie True/False."""
    try:
        return bool(get_mailer().send_qr_code(inscription, qr_png(inscription.qr_token)))
    except Exception as erreur:
        logger.error('QR code non envoyé à %s : %s', inscription.email, erreur)
        return False


@require_http_methods(['GET', 'POST'])
@rate_limited('inscription')
def page_inscription(request, lien):
    """/e/<lien> : la page de l'événement avec le formulaire d'inscription."""
    event = Event.objects.filter(lien=lien).first()
    if not event:
        raise Http404

    contexte = {'title': event.titre, 'event': event, 'filiales': settings.FILIALES, 'values': {}, 'error': None}
    if request.method == 'GET':
        return render(request, 'public/inscription.html', contexte)

    valeurs = {
        'nom': clean(request.POST.get('nom')), 'prenom': clean(request.POST.get('prenom')),
        'filiale': clean(request.POST.get('filiale')), 'telephone': clean(request.POST.get('telephone'), 30),
        'email': clean(request.POST.get('email'), 200).lower(),
    }
    erreur = inscription_error(valeurs, settings.FILIALES)
    if erreur:
        return render(request, 'public/inscription.html', {**contexte, 'values': valeurs, 'error': erreur}, status=400)

    inscription, nouvelle = queries.inscrire(event, valeurs)
    # On donne l'événement à l'inscription : l'envoi de l'e-mail (tâche en arrière-plan) n'aura ainsi
    # AUCUNE requête à faire à la base de données.
    inscription.event = event
    if nouvelle:
        # L'e-mail part en arrière-plan : la personne n'attend pas l'envoi pour voir son billet.
        mailer = get_mailer()
        mailer.in_background(f'QR code non envoyé à {inscription.email}', envoyer_billet, inscription)
        return redirect(f'/billet/{inscription.qr_token}?nouveau=1')

    # Déjà inscrite avec cette adresse : on ne montre PAS le billet (n'importe qui connaît une adresse e-mail),
    # on le renvoie seulement à la boîte e-mail de cette adresse.
    get_mailer().in_background(f'QR code non renvoyé à {inscription.email}', envoyer_billet, inscription)
    return render(request, 'public/inscription.html', {
        **contexte, 'values': valeurs,
        'info': 'Cette adresse e-mail est déjà inscrite à cet événement. Nous venons de vous renvoyer votre QR code par e-mail.',
    })


def page_billet(request, jeton):
    """/billet/<code secret> : la page du billet avec le QR code. Seul le code secret (reçu par e-mail) y donne accès."""
    inscription = Inscription.objects.select_related('event').filter(qr_token=jeton).first()
    if not inscription:
        raise Http404
    return render(request, 'public/billet.html', {
        'title': 'Mon billet', 'inscription': inscription, 'event': inscription.event,
        'qr': qr_data_url(inscription.qr_token),
        'nouveau': request.GET.get('nouveau') == '1',
        'email_configure': get_mailer().configured,
    })


def telecharger_billet(request, jeton):
    """Télécharger le QR code en image PNG."""
    inscription = Inscription.objects.filter(qr_token=jeton).first()
    if not inscription:
        raise Http404
    reponse = HttpResponse(qr_png(inscription.qr_token), content_type='image/png')
    reponse.headers['Content-Disposition'] = 'attachment; filename="qrcode-snedai.png"'
    return reponse
