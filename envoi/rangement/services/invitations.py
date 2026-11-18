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
from django.utils.html import escape

from . import courrier

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
    """Fabrique l'e-mail d'invitation : une lettre (texte + version HTML) avec le thème, les sessions, le lien et la signature."""
    lien = evenement.url_inscription
    date = courrier.jour(evenement.date)
    sessions = [courrier.creneau_lisible(c) for c in evenement.creneaux]
    description = (evenement.description or "").strip()
    jusque, moment = courrier.limite(evenement)
    contact = courrier.contact()
    signature = courrier.signature()

    # --- la version texte ---
    lignes = ["Chers tous,", "", f"Nous avons le plaisir de vous inviter à « {evenement.nom} »."]
    if description:
        lignes += ["", description]
    lignes += ["", f"Date : {date}", f"Lieu : {evenement.lieu}"]
    if sessions:
        lignes += ["", "Sessions :"] + [f"  - {s}" for s in sessions]
    lignes += ["", f"Les inscriptions s'effectuent via le lien ci-après, {jusque} {moment} :", lien,
               "", "NB : dès votre inscription, vous recevrez votre QR code par e-mail. Il sera à présenter à l'entrée."]
    if contact:
        lignes += ["", f"Pour toutes informations complémentaires, prière de contacter {contact}."]
    lignes += ["", "Cordialement,", signature]
    texte = "\n".join(lignes)

    # --- la version HTML ---
    html = '<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1f2937;max-width:620px">'
    html += "<p>Chers tous,</p>"
    html += f"<p>Nous avons le plaisir de vous inviter à <strong>{escape(evenement.nom)}</strong>.</p>"
    if description:
        html += f"<p>{escape(description).replace(chr(10), '<br>')}</p>"
    html += f"<p><strong>Date :</strong> {escape(date)}<br><strong>Lieu :</strong> {escape(evenement.lieu)}</p>"
    if sessions:
        html += "<p><strong>Sessions :</strong></p><ul style=\"margin-top:0\">" + "".join(f"<li>{escape(s)}</li>" for s in sessions) + "</ul>"
    html += (f"<p>Les inscriptions s'effectuent via le lien ci-après, {jusque} <strong>{escape(moment)}</strong> :</p>"
             f'<p><a href="{escape(lien)}" style="display:inline-block;background:#f08a46;color:#ffffff;padding:12px 24px;'
             'border-radius:6px;text-decoration:none;font-weight:bold">Je m\'inscris</a></p>'
             f'<p style="font-size:13px;color:#4b5563">Ou copiez ce lien : <a href="{escape(lien)}">{escape(lien)}</a></p>'
             "<p><strong>NB :</strong> dès votre inscription, vous recevrez votre QR code par e-mail. "
             "Il sera à présenter à l'entrée.</p>")
    if contact:
        html += f"<p>Pour toutes informations complémentaires, prière de contacter {escape(contact)}.</p>"
    html += f"<p>Cordialement,<br><strong>{escape(signature)}</strong></p></div>"

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
