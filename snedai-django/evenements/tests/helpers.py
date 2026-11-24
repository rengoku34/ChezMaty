import re
from unittest import mock

from django.core.cache import cache
from django.test import TestCase, override_settings

from ..models import Event, User
from ..services.mailer import reset_mailer

SETTINGS = dict(
    ADMIN_EMAILS=['admin@test.ci'], FILIALES=[], AGENTMAIL_API_KEY='cle-test', AGENTMAIL_INBOX='snedai@agentmail.to',
    BREVO_API_KEY='', SMTP_HOST='', GOOGLE_CLIENT_ID='', GOOGLE_CLIENT_SECRET='', GOOGLE_ENABLED=False, LOGIN_RATE_LIMIT=1000,
    PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'],
)
PASSWORD = 'motdepasse1'


class Response:
    ok = True
    status_code = 200
    text = ''


@override_settings(**SETTINGS)
class BaseTest(TestCase):
    """Base des tests : envoi d'e-mails simulé (les messages sont gardés dans self.sent)."""

    def setUp(self):
        cache.clear()
        reset_mailer()
        self.sent = []
        self.mail_ok = True

        def fake_post(url, json=None, **kwargs):
            if not self.mail_ok:
                failure = Response()
                failure.ok, failure.status_code, failure.text = False, 401, 'Clé refusée'
                return failure
            self.sent.append({'url': url, **json})
            return Response()

        patcher = mock.patch('evenements.services.mailer.requests.post', side_effect=fake_post)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(reset_mailer)

    def user(self, email, nom='Dupont', prenom='Awa', filiale='SNEDAI', agent=False, password=PASSWORD):
        return User.objects.create_user(email, password, nom=nom, prenom=prenom, filiale=filiale, is_agent=agent)

    def event(self, titre='Journée bien-être', debut='2099-11-14T09:00', fin='2099-11-14T16:00', lieu='Siège SNEDAI', **extra):
        return Event.objects.create(titre=titre, description='Une belle journée.', debut=debut, fin=fin, lieu=lieu, **extra)

    def login(self, client, email, password=PASSWORD):
        return client.post('/connexion', {'email': email, 'password': password})

    def last_code(self):
        match = re.search(r'est : (\d{6})', self.sent[-1]['text'])
        return match.group(1)
