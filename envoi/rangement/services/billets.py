"""
L'e-mail du billet : après l'inscription, la personne reçoit son QR code en pièce jointe.
On utilise le système d'e-mails de Django (django.core.mail) : où part réellement le message dépend
des réglages (AgentMail, serveur SMTP, ou simple affichage dans le terminal).
"""
import logging
import threading

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.utils.html import escape

from . import courrier
from .qr import qr_png

logger = logging.getLogger(__name__)


def construire_email(inscription):
    """Fabrique le message (texte + version HTML + QR code en pièce jointe). Ne l'envoie pas encore."""
    evenement = inscription.evenement
    date = courrier.jour(evenement.date)
    creneau = courrier.creneau_lisible(inscription.creneau) if inscription.creneau else ""
    contact = courrier.contact()
    signature = courrier.signature()
    sujet = f"Votre QR code pour : {evenement.nom}"

    lignes = [f"Bonjour {inscription.prenom},", "", f"Votre inscription à « {evenement.nom} » est enregistrée.", "",
              f"Date : {date}", f"Lieu : {evenement.lieu}"]
    if creneau:
        lignes.append(f"Votre créneau : {creneau}")
    lignes += ["", "Votre QR code est joint à ce message. Présentez-le à l'entrée le jour de l'événement : il sera scanné pour confirmer votre venue.",
               f"Pour le générer à nouveau, ouvrez ce lien : {inscription.url_billet}"]
    if contact:
        lignes += ["", f"Pour toutes informations complémentaires, prière de contacter {contact}."]
    lignes += ["", "Cordialement,", signature]
    texte = "\n".join(lignes)

    html = '<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1f2937;max-width:620px">'
    html += f"<p>Bonjour {escape(inscription.prenom)},</p>"
    html += f"<p>Votre inscription à <strong>{escape(evenement.nom)}</strong> est enregistrée.</p>"
    html += f"<p><strong>Date :</strong> {escape(date)}<br><strong>Lieu :</strong> {escape(evenement.lieu)}"
    if creneau:
        html += f"<br><strong>Votre créneau :</strong> {escape(creneau)}"
    html += ("</p><p>Votre <strong>QR code est joint</strong> à ce message. Présentez-le à l'entrée le jour de l'événement : "
             "il sera scanné pour confirmer votre venue.</p>"
             f'<p><a href="{escape(inscription.url_billet)}" style="display:inline-block;background:#f08a46;color:#ffffff;'
             'padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">Afficher mon QR code</a></p>')
    if contact:
        html += f"<p>Pour toutes informations complémentaires, prière de contacter {escape(contact)}.</p>"
    html += f"<p>Cordialement,<br><strong>{escape(signature)}</strong></p></div>"

    message = EmailMultiAlternatives(sujet, texte, to=[inscription.email])
    message.attach_alternative(html, "text/html")
    message.attach("qrcode.png", qr_png(inscription.qr_token), "image/png")
    return message


def _envoyer(message):
    """Envoie le message ; une panne d'envoi ne doit jamais empêcher l'inscription : on l'écrit seulement dans le journal."""
    try:
        message.send()
    except Exception as erreur:
        logger.error("QR code non envoyé à %s : %s", ", ".join(message.to), erreur)


def envoyer_billet(inscription):
    """Envoie le billet par e-mail. En production, l'envoi se fait en arrière-plan : la personne n'attend pas."""
    message = construire_email(inscription)       # fabriqué ici (accès à la base), envoyé ensuite sans y toucher
    if settings.ENVOI_EN_ARRIERE_PLAN:
        threading.Thread(target=_envoyer, args=(message,), daemon=True).start()
    else:
        _envoyer(message)
