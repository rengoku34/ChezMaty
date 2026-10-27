"""
L'ENVOI DES E-MAILS.

Il faut un « service d'envoi » : AgentMail (gratuit, sans carte bancaire), sinon Brevo, sinon un serveur SMTP.
Le site parle à ces services par Internet (HTTPS) avec une clé secrète.

Un seul e-mail automatique : quand quelqu'un s'inscrit à un événement, il reçoit son QR code.
"""
import base64
import logging
import re
import smtplib
import threading
from email.message import EmailMessage
from email.utils import formataddr
from urllib.parse import quote

import requests
from django.conf import settings
from django.utils import timezone
from django.utils.html import escape

logger = logging.getLogger(__name__)
DELAI_MAX = 20     # secondes d'attente maximum d'une réponse du service d'envoi


def lire_expediteur(valeur):
    """« Nom <adresse> » ou simplement « adresse » -> {'name': ..., 'email': ...}."""
    trouve = re.match(r'^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$', valeur or '')
    if trouve:
        return {'name': trouve.group(1).strip(), 'email': trouve.group(2).strip()}
    return {'name': 'Événements SNEDAI', 'email': (valeur or '').strip()}


def _echec(service, reponse):
    raise RuntimeError(f'{service} {reponse.status_code} : {reponse.text}')


# ---------------------------------------------------------------------------
# Les trois services d'envoi. Chacun est une fonction « envoyer(destinataire, sujet, texte, html, pièces jointes) ».
# ---------------------------------------------------------------------------
def transport_agentmail(cle, boite):
    def envoyer(a, sujet, texte, html, pieces_jointes):
        corps = {'to': [a], 'subject': sujet, 'text': texte, 'html': html}
        if pieces_jointes:
            corps['attachments'] = [{'filename': nom, 'content_type': 'image/png', 'content': base64.b64encode(contenu).decode()}
                                    for nom, contenu in pieces_jointes]
        reponse = requests.post(f'https://api.agentmail.to/v0/inboxes/{quote(boite, safe="")}/messages/send', json=corps,
                                headers={'Authorization': f'Bearer {cle}', 'Accept': 'application/json'}, timeout=DELAI_MAX)
        if not reponse.ok:
            _echec('AgentMail', reponse)
    return envoyer


def transport_brevo(cle, expediteur):
    def envoyer(a, sujet, texte, html, pieces_jointes):
        corps = {'sender': expediteur, 'to': [{'email': a}], 'subject': sujet, 'textContent': texte, 'htmlContent': html}
        if pieces_jointes:
            corps['attachment'] = [{'name': nom, 'content': base64.b64encode(contenu).decode()} for nom, contenu in pieces_jointes]
        reponse = requests.post('https://api.brevo.com/v3/smtp/email', json=corps,
                                headers={'api-key': cle, 'Accept': 'application/json'}, timeout=DELAI_MAX)
        if not reponse.ok:
            _echec('Brevo', reponse)
    return envoyer


def transport_smtp(expediteur):
    def envoyer(a, sujet, texte, html, pieces_jointes):
        message = EmailMessage()
        message['From'] = formataddr((expediteur['name'], expediteur['email']))
        message['To'] = a
        message['Subject'] = sujet
        message.set_content(texte)
        message.add_alternative(html, subtype='html')
        for nom, contenu in pieces_jointes:
            message.add_attachment(contenu, maintype='image', subtype='png', filename=nom)
        classe = smtplib.SMTP_SSL if settings.SMTP_SECURE else smtplib.SMTP
        with classe(settings.SMTP_HOST, settings.SMTP_PORT, timeout=DELAI_MAX) as serveur:
            if not settings.SMTP_SECURE:
                serveur.starttls()
            if settings.SMTP_USER:
                serveur.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            serveur.send_message(message)
    return envoyer


# ---------------------------------------------------------------------------
# Le « mailer » : choisit le service, envoie, et se souvient de la dernière panne
# ---------------------------------------------------------------------------
class Mailer:
    def __init__(self):
        expediteur = lire_expediteur(settings.MAIL_FROM)
        self.envoyer = None          # la fonction d'envoi choisie (None = aucun service configuré)
        self.provider = None         # le nom du service, pour l'afficher
        self.sender = expediteur['email']
        if settings.AGENTMAIL_API_KEY and settings.AGENTMAIL_INBOX:
            self.envoyer, self.provider, self.sender = transport_agentmail(settings.AGENTMAIL_API_KEY, settings.AGENTMAIL_INBOX), 'AgentMail', settings.AGENTMAIL_INBOX
        elif settings.BREVO_API_KEY and expediteur['email']:
            self.envoyer, self.provider = transport_brevo(settings.BREVO_API_KEY, expediteur), 'Brevo'
        elif settings.SMTP_HOST and expediteur['email']:
            self.envoyer, self.provider = transport_smtp(expediteur), 'SMTP'
        # Dernier résultat d'envoi, affiché à l'administrateur (page « Comptes ») pour trouver la cause d'une panne.
        self.state = {'last_error': None, 'last_error_at': None, 'last_ok_at': None}

    @property
    def configured(self):
        return self.envoyer is not None

    def send(self, a, sujet, texte, html, pieces_jointes=()):
        """Envoie un e-mail. Renvoie True si envoyé, False si aucun service n'est configuré. Lève une erreur si l'envoi échoue."""
        if not self.envoyer:
            # Mode développement : pas de service, on AFFICHE l'e-mail dans le terminal (le code de confirmation s'y lit).
            logger.warning('\n[E-MAIL NON ENVOYÉ : aucun service configuré]\nÀ : %s\nSujet : %s\n%s\n', a, sujet, texte)
            return False
        try:
            self.envoyer(a, sujet, texte, html, list(pieces_jointes))
        except Exception as erreur:
            self.state.update(last_error=str(erreur), last_error_at=timezone.now())
            raise
        self.state['last_ok_at'] = timezone.now()
        return True

    def in_background(self, libelle, fonction, *args):
        """Envoie sans faire attendre la page (un « thread » = une tâche qui tourne en parallèle).
        Si ça échoue, l'erreur est seulement écrite dans le terminal."""
        def tache():
            try:
                fonction(*args)
            except Exception as erreur:
                logger.error('%s : %s', libelle, erreur)
        threading.Thread(target=tache, daemon=True).start()

    # --- L'habillage commun des e-mails (bandeau bleu marine et filet orange, aux couleurs de SNEDAI)
    @staticmethod
    def habiller(contenu):
        return ('<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1f2937">'
                '<div style="background:#26246a;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0;border-bottom:4px solid #f08a46;font-size:18px;font-weight:bold">Événements SNEDAI</div>'
                f'<div style="border:1px solid #e5e7eb;border-top:0;padding:20px;border-radius:0 0 8px 8px">{contenu}</div></div>')

    @staticmethod
    def bouton(lien, texte):
        return (f'<p><a href="{escape(lien)}" style="display:inline-block;background:#26246a;color:#fff;padding:10px 18px;'
                f'border-radius:6px;text-decoration:none">{escape(texte)}</a></p>')

    # --- Test d'envoi (bouton de la page « Comptes »)
    def send_test(self, a):
        """Envoie un e-mail de test à l'administrateur et renvoie l'erreur EXACTE du service s'il y en a une."""
        if not self.envoyer:
            return {'ok': False, 'error': 'Aucun service d’envoi configuré (AGENTMAIL_API_KEY et AGENTMAIL_INBOX absents).'}
        try:
            self.send(a, 'Test d’envoi – Événements SNEDAI', 'Si vous lisez ce message, les e-mails du site fonctionnent.',
                      self.habiller('<p>Si vous lisez ce message, les e-mails du site <strong>fonctionnent</strong>.</p>'))
            return {'ok': True}
        except Exception as erreur:
            return {'ok': False, 'error': str(erreur)}

    # --- L'e-mail d'inscription : le QR code
    def send_qr_code(self, inscription, qr_png):
        """Envoie le QR code personnel (en pièce jointe + lien vers la page du billet) juste après l'inscription."""
        event = inscription.event
        quand = event.range_text
        return self.send(
            inscription.email, f'Votre QR code pour : {event.titre}',
            f'Bonjour {inscription.prenom},\n\nVotre inscription à « {event.titre} » est enregistrée.\n'
            + (f'Quand : {quand}\n' if quand else '') + (f'Où : {event.lieu}\n' if event.lieu else '')
            + f'\nPrésentez le QR code joint (pièce jointe) à l’accueil le jour de l’événement.\n'
            f'Vous pouvez aussi l’afficher ici : {inscription.url_billet}\n',
            self.habiller(
                f'<p>Bonjour {escape(inscription.prenom)},</p>'
                f'<p>Votre inscription à <strong>{escape(event.titre)}</strong> est enregistrée.</p>'
                + (f'<p><strong>Quand :</strong> {escape(quand)}</p>' if quand else '')
                + (f'<p><strong>Où :</strong> {escape(event.lieu)}</p>' if event.lieu else '')
                + '<p>Votre QR code est <strong>en pièce jointe</strong>. Présentez-le à l’accueil, il sera scanné pour confirmer votre venue.</p>'
                + self.bouton(inscription.url_billet, 'Voir mon QR code')),
            [('qrcode.png', qr_png)])


# Un seul « mailer » pour tout le site (créé la première fois qu'on en a besoin).
_mailer = None


def get_mailer():
    global _mailer
    if _mailer is None:
        _mailer = Mailer()
    return _mailer


def reset_mailer():
    """Recrée le mailer (utile dans les tests, quand on change les réglages)."""
    global _mailer
    _mailer = None
