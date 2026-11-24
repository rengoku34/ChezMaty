"""
L'invitation par e-mail : le lien d'inscription d'un événement est envoyé à la liste de diffusion de l'entreprise.
Les adresses déjà inscrites à l'événement sont ignorées (on ne dérange pas deux fois la même personne).
"""
import logging
import threading

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.mail import EmailMultiAlternatives, get_connection
from django.core.validators import validate_email
from django.utils import formats
from django.utils.html import escape

logger = logging.getLogger(__name__)


def adresses_diffusion():
    """Les adresses de la liste de diffusion de l'entreprise (ADRESSES_DIFFUSION dans les réglages), nettoyées et sans doublon."""
    adresses = []
    for adresse in getattr(settings, "ADRESSES_DIFFUSION", []):
        adresse = adresse.strip().lower()
        try:
            validate_email(adresse)
        except ValidationError:
            continue
        if adresse not in adresses:
            adresses.append(adresse)
    return adresses


def construire_invitation(evenement, adresse):
    """Fabrique l'e-mail d'invitation (texte + version HTML avec un bouton « Je m'inscris »)."""
    date = formats.date_format(evenement.date, "l j F Y")
    lien = evenement.url_inscription
    texte = (
        f"Bonjour,\n\nVous êtes invité(e) à « {evenement.nom} ».\n"
        f"Date : {date}\nLieu : {evenement.lieu}\n\n"
        f"Pour vous inscrire, ouvrez ce lien : {lien}\n"
    )
    html = (
        '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1f2937">'
        '<div style="background:#26246a;color:#fff;padding:16px 20px;border-bottom:4px solid #f08a46;font-size:18px;'
        'font-weight:bold">Événements SNEDAI</div>'
        '<div style="border:1px solid #e5e7eb;border-top:0;padding:20px">'
        "<p>Bonjour,</p>"
        f"<p>Vous êtes invité(e) à <strong>{escape(evenement.nom)}</strong>.</p>"
        f"<p><strong>Date :</strong> {escape(date)}<br><strong>Lieu :</strong> {escape(evenement.lieu)}</p>"
        f'<p><a href="{escape(lien)}" style="display:inline-block;background:#f08a46;color:#fff;padding:12px 22px;'
        'border-radius:6px;text-decoration:none;font-weight:bold">Je m\'inscris</a></p>'
        "</div></div>"
    )
    message = EmailMultiAlternatives(f"Invitation : {evenement.nom}", texte, to=[adresse])
    message.attach_alternative(html, "text/html")
    return message


def _envoyer_tous(messages):
    """Envoie tous les messages avec UNE seule connexion au serveur d'e-mail (plus rapide pour une centaine d'adresses).
    Une panne ne doit jamais faire planter le site : on l'écrit seulement dans le journal."""
    try:
        with get_connection() as connexion:
            connexion.send_messages(messages)
    except Exception as erreur:
        logger.error("Invitations non envoyées (%s messages) : %s", len(messages), erreur)


def envoyer_invitations(evenement, adresses):
    """Envoie l'invitation à chaque adresse pas encore inscrite. Renvoie le bilan."""
    deja = {e.lower() for e in evenement.inscriptions.values_list("email", flat=True)}
    a_envoyer = [a for a in adresses if a not in deja]
    messages = [construire_invitation(evenement, a) for a in a_envoyer]      # fabriqués ici (accès à la base)
    if messages:
        if settings.ENVOI_EN_ARRIERE_PLAN:
            threading.Thread(target=_envoyer_tous, args=(messages,), daemon=True).start()
        else:
            _envoyer_tous(messages)
    return {"envoyes": len(a_envoyer), "deja_inscrits": len(adresses) - len(a_envoyer)}
