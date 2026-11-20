"""Envoi des e-mails : AgentMail (prioritaire), puis Brevo, puis SMTP. Tout est gratuit à petite échelle."""
import base64
import logging
import re
import smtplib
import threading
from email.message import EmailMessage
from email.utils import formataddr

import requests
from django.conf import settings
from django.utils import timezone
from django.utils.html import escape

logger = logging.getLogger(__name__)
TIMEOUT = 20


def parse_sender(value):
    """« Nom <adresse> » ou simplement « adresse »."""
    match = re.match(r'^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$', value or '')
    if match:
        return {'name': match.group(1).strip(), 'email': match.group(2).strip()}
    return {'name': 'Événements SNEDAI', 'email': (value or '').strip()}


def _fail(provider, response):
    raise RuntimeError(f'{provider} {response.status_code} : {response.text}')


def agentmail_transport(api_key, inbox):
    def deliver(to, subject, text, html, attachments):
        body = {'to': [to], 'subject': subject, 'text': text, 'html': html}
        if attachments:
            body['attachments'] = [
                {'filename': name, 'content_type': 'image/png', 'content': base64.b64encode(content).decode()} for name, content in attachments
            ]
        response = requests.post(
            f'https://api.agentmail.to/v0/inboxes/{requests.utils.quote(inbox, safe="")}/messages/send',
            json=body, headers={'Authorization': f'Bearer {api_key}', 'Accept': 'application/json'}, timeout=TIMEOUT,
        )
        if not response.ok:
            _fail('AgentMail', response)

    return deliver


def brevo_transport(api_key, sender):
    def deliver(to, subject, text, html, attachments):
        body = {'sender': sender, 'to': [{'email': to}], 'subject': subject, 'textContent': text, 'htmlContent': html}
        if attachments:
            body['attachment'] = [{'name': name, 'content': base64.b64encode(content).decode()} for name, content in attachments]
        response = requests.post('https://api.brevo.com/v3/smtp/email', json=body, headers={'api-key': api_key, 'Accept': 'application/json'}, timeout=TIMEOUT)
        if not response.ok:
            _fail('Brevo', response)

    return deliver


def smtp_transport(sender):
    def deliver(to, subject, text, html, attachments):
        message = EmailMessage()
        message['From'] = formataddr((sender['name'], sender['email']))
        message['To'] = to
        message['Subject'] = subject
        message.set_content(text)
        message.add_alternative(html, subtype='html')
        for name, content in attachments:
            message.add_attachment(content, maintype='image', subtype='png', filename=name)
        client_class = smtplib.SMTP_SSL if settings.SMTP_SECURE else smtplib.SMTP
        with client_class(settings.SMTP_HOST, settings.SMTP_PORT, timeout=TIMEOUT) as client:
            if not settings.SMTP_SECURE:
                client.starttls()
            if settings.SMTP_USER:
                client.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            client.send_message(message)

    return deliver


class Mailer:
    def __init__(self):
        sender = parse_sender(settings.MAIL_FROM)
        self.deliver = None
        self.provider = None
        self.sender = sender['email']
        if settings.AGENTMAIL_API_KEY and settings.AGENTMAIL_INBOX:
            self.deliver, self.provider, self.sender = agentmail_transport(settings.AGENTMAIL_API_KEY, settings.AGENTMAIL_INBOX), 'AgentMail', settings.AGENTMAIL_INBOX
        elif settings.BREVO_API_KEY and sender['email']:
            self.deliver, self.provider = brevo_transport(settings.BREVO_API_KEY, sender), 'Brevo'
        elif settings.SMTP_HOST and sender['email']:
            self.deliver, self.provider = smtp_transport(sender), 'SMTP'
        # Dernier résultat d'envoi, affiché à l'administrateur (page « Comptes ») pour trouver la cause d'une panne.
        self.state = {'last_error': None, 'last_error_at': None, 'last_ok_at': None}

    @property
    def configured(self):
        return self.deliver is not None

    def send(self, to, subject, text, html, attachments=()):
        if not self.deliver:
            logger.info('[e-mail non envoyé : aucun service d’envoi configuré] À %s — %s', to, subject)
            return False
        try:
            self.deliver(to, subject, text, html, list(attachments))
        except Exception as error:
            self.state.update(last_error=str(error), last_error_at=timezone.now())
            raise
        self.state['last_ok_at'] = timezone.now()
        return True

    def in_background(self, label, function, *args):
        """Envoi sans faire attendre la page ; l'erreur éventuelle est seulement journalisée."""
        def run():
            try:
                function(*args)
            except Exception as error:
                logger.error('%s : %s', label, error)

        threading.Thread(target=run, daemon=True).start()

    @staticmethod
    def layout(content):
        return (
            '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1f2937">'
            '<div style="background:#26246a;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0;border-bottom:4px solid #f08a46;font-size:18px;font-weight:bold">Événements SNEDAI</div>'
            f'<div style="border:1px solid #e5e7eb;border-top:0;padding:20px;border-radius:0 0 8px 8px">{content}</div></div>'
        )

    @staticmethod
    def button(link, label):
        return f'<p><a href="{escape(link)}" style="display:inline-block;background:#26246a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">{escape(label)}</a></p>'

    def send_verification_code(self, email, prenom, code):
        return self.send(
            email,
            f'{code} est votre code de confirmation – Événements SNEDAI',
            f'Bonjour {prenom},\n\nVotre code de confirmation est : {code}\nIl est valable 15 minutes.\n\nSi vous n’avez pas demandé à créer un compte, ignorez ce message.\n',
            self.layout(
                f'<p>Bonjour {escape(prenom)},</p><p>Voici votre code pour confirmer votre adresse e-mail :</p>'
                f'<p style="font-size:30px;font-weight:bold;letter-spacing:8px;color:#26246a;margin:16px 0">{escape(code)}</p>'
                '<p style="color:#62647a">Il est valable 15 minutes. Si vous n’avez pas demandé à créer un compte, ignorez ce message.</p>'
            ),
        )

    def send_welcome(self, user):
        link = f'{settings.APP_URL}/'
        return self.send(
            user.email,
            'Bienvenue sur les Événements SNEDAI',
            f'Bonjour {user.prenom},\n\nVotre compte est créé. Vous serez prévenu(e) par e-mail à chaque nouvel événement, et vous pourrez confirmer votre présence pour recevoir votre QR code d’entrée.\n\nAccéder au site : {link}\n',
            self.layout(
                f'<p>Bonjour {escape(user.prenom)},</p><p>Bienvenue sur la plateforme des <strong>événements SNEDAI</strong>. Votre compte est créé.</p>'
                '<ul><li>Vous recevrez un e-mail <strong>à chaque nouvel événement</strong> ;</li>'
                '<li>un clic sur « Je serai présent(e) » vous donne votre <strong>QR code d’entrée</strong> ;</li>'
                '<li>le jour J, il suffit de le présenter à l’accueil.</li></ul>' + self.button(link, 'Voir les événements')
            ),
        )

    def send_test(self, to):
        """E-mail de test envoyé à l'administrateur : renvoie l'erreur exacte du service d'envoi s'il y en a une."""
        if not self.deliver:
            return {'ok': False, 'error': 'Aucun service d’envoi configuré (AGENTMAIL_API_KEY et AGENTMAIL_INBOX absents).'}
        try:
            self.send(to, 'Test d’envoi – Événements SNEDAI', 'Si vous lisez ce message, les e-mails du site fonctionnent.',
                      self.layout('<p>Si vous lisez ce message, les e-mails du site <strong>fonctionnent</strong>.</p>'))
            return {'ok': True}
        except Exception as error:
            return {'ok': False, 'error': str(error)}

    def announce_event(self, event, users, when_text):
        """Prévient chaque inscrit d'un nouvel événement, un par un."""
        link = f'{settings.APP_URL}/evenements/{event.id}'
        sent = 0
        for user in users:
            try:
                ok = self.send(
                    user.email,
                    f'Nouvel événement : {event.titre}',
                    f'Bonjour {user.prenom},\n\nUn nouvel événement a été publié : {event.titre}.\n'
                    + (f'Quand : {when_text}\n' if when_text else '') + (f'Où : {event.lieu}\n' if event.lieu else '')
                    + f'\nConfirmez votre présence ici : {link}\n',
                    self.layout(
                        f'<p>Bonjour {escape(user.prenom)},</p><p>Un nouvel événement a été publié :</p><h2 style="margin:8px 0">{escape(event.titre)}</h2>'
                        + (f'<p><strong>Quand :</strong> {escape(when_text)}</p>' if when_text else '')
                        + (f'<p><strong>Où :</strong> {escape(event.lieu)}</p>' if event.lieu else '')
                        + self.button(link, 'Voir l’événement et confirmer ma présence')
                    ),
                )
                sent += 1 if ok else 0
            except Exception as error:
                logger.error('Échec de l’envoi à %s : %s', user.email, error)
        return sent

    def send_qr_code(self, event, user, qr_png, when_text):
        """Envoie le QR code personnel après le clic sur « Je serai présent(e) »."""
        link = f'{settings.APP_URL}/evenements/{event.id}'
        return self.send(
            user.email,
            f'Votre QR code pour : {event.titre}',
            f'Bonjour {user.prenom},\n\nVotre présence à « {event.titre} » est notée. Présentez le QR code joint (pièce jointe) à l’agent d’accueil le jour de l’événement.\nVous pouvez aussi l’afficher ici : {link}\n',
            self.layout(
                f'<p>Bonjour {escape(user.prenom)},</p><p>Votre présence à <strong>{escape(event.titre)}</strong> est notée.</p>'
                + (f'<p><strong>Quand :</strong> {escape(when_text)}</p>' if when_text else '')
                + (f'<p><strong>Où :</strong> {escape(event.lieu)}</p>' if event.lieu else '')
                + '<p>Votre QR code est <strong>en pièce jointe</strong>. Présentez-le à l’agent d’accueil, il sera scanné pour confirmer votre venue.</p>'
                + self.button(link, 'Afficher mon QR code sur le site')
            ),
            [('qrcode.png', qr_png)],
        )


_mailer = None


def get_mailer():
    global _mailer
    if _mailer is None:
        _mailer = Mailer()
    return _mailer


def reset_mailer():
    """Recrée le service d'envoi (après un changement de réglages, par exemple dans les tests)."""
    global _mailer
    _mailer = None
