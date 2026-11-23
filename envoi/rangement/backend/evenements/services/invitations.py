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

from . import courrier, texte_riche

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
    """Fabrique l'e-mail d'invitation (texte + HTML) : titre, thème, accroche, message, date, lieu, sessions, inscriptions, contact, phrase de fin.
    Les parties écrites par l'administrateur (titre, thème, accroche, message, contact, phrase de fin) gardent leur mise en forme."""
    lien = evenement.url_inscription
    jusque, moment = courrier.limite(evenement)
    places = " dans la limite des places disponibles" if evenement.places else ""
    sessions = [courrier.session(c) for c in evenement.creneaux]
    titre = escape(evenement.nom)                    # le titre du message : le nom de l'événement
    blocs = {nom: getattr(evenement, nom) for nom in ("sous_titre", "accroche", "description", "contact", "conclusion")}
    if not blocs["description"] and blocs["sous_titre"]:     # sans message écrit : une phrase d'invitation avec le thème
        blocs["description"] = escape(f"Nous avons le plaisir de vous inviter à cet événement consacré au thème : « {texte_riche.en_texte(blocs['sous_titre'])} ».")
    if not blocs["conclusion"] and courrier.phrase_fin():
        blocs["conclusion"] = escape(courrier.phrase_fin())
    if not blocs["contact"] and courrier.contact():
        blocs["contact"] = escape("Pour toute information complémentaire : " + courrier.contact())
    phrase = f"Les inscriptions sont ouvertes {jusque} {moment}{places}."

    # --- la version texte ---
    lignes = [texte_riche.en_texte(titre).upper()]
    for nom in ("sous_titre", "accroche", "description"):
        if blocs[nom]:
            lignes += ["", texte_riche.en_texte(blocs[nom])]
    lignes += ["", f"Date : {courrier.jour(evenement.date)}", f"Lieu : {evenement.lieu}"]
    if sessions:
        lignes += ["Sessions :"] + [f"  - {s}" for s in sessions]
    lignes += ["", "INSCRIPTIONS", phrase, f"Pour vous inscrire : {lien}"]
    if blocs["contact"]:
        lignes += ["", texte_riche.en_texte(blocs["contact"])]
    if blocs["conclusion"]:
        lignes += ["", texte_riche.en_texte(blocs["conclusion"])]
    lignes += ["", courrier.signature()]
    texte = "\n".join(lignes)

    # --- la version HTML ---
    def bloc(nom, style=""):
        return f'<div style="margin:0 0 14px;{style}">{blocs[nom]}</div>' if blocs[nom] else ""

    html = '<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1f2937;max-width:640px">'
    html += f'<div style="margin:0 0 12px;font-size:20px;font-weight:bold;color:#252566;text-align:center;text-transform:uppercase">{titre}</div>'
    html += bloc("sous_titre", "font-size:17px;font-weight:bold;text-align:center;")
    html += bloc("accroche", "font-weight:bold;")
    html += bloc("description")
    html += f'<div style="margin:0 0 14px">📅 <strong>Date :</strong> {escape(courrier.jour(evenement.date))}<br>📍 <strong>Lieu :</strong> {escape(str(evenement.lieu))}'
    if sessions:
        html += "<br>🕘 <strong>" + ("Deux sessions au choix" if len(sessions) == 2 else "Sessions") + " :</strong></div>"
        html += '<ul style="margin:0 0 14px">' + "".join(f"<li>{escape(s)}</li>" for s in sessions) + "</ul>"
    else:
        html += "</div>"
    html += ('<div style="margin:0 0 6px;font-weight:bold;color:#252566">INSCRIPTIONS</div>'
             f'<div style="margin:0 0 14px">{escape(phrase)}<br>👉 <a href="{escape(lien)}" style="color:#1d4ed8;text-decoration:underline">Cliquez ici pour vous inscrire</a></div>')
    html += bloc("contact") + bloc("conclusion")
    html += f'<div style="margin-top:18px;font-weight:bold">{escape(courrier.signature())}</div></div>'

    message = EmailMultiAlternatives(courrier.objet_invitation(evenement), texte, from_email=courrier.expediteur(), to=[adresse])
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
