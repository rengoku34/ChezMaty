import json
import re
from datetime import timedelta

from django.test import Client, override_settings
from django.utils import timezone

from ..models import ApiToken, Event, Participation, PendingSignup, User
from .helpers import PASSWORD, BaseTest


class ApiClient:
    """Client de l'application mobile : JSON et jeton « Bearer », jamais de cookie."""

    def __init__(self):
        self.http = Client()
        self.token = None

    def call(self, method, path, body=None, token=True):
        headers = {'HTTP_AUTHORIZATION': f'Bearer {self.token}'} if token and self.token else {}
        if method == 'GET':
            return self.http.get(f'/api/v1{path}', **headers)
        return self.http.post(f'/api/v1{path}', json.dumps(body or {}), content_type='application/json', **headers)

    def login(self, email, password=PASSWORD):
        response = self.call('POST', '/auth/login', {'email': email, 'password': password}, token=False)
        if response.status_code == 200:
            self.token = response.json()['token']
        return response


class ApiTests(BaseTest):
    def test_connexion_mauvais_identifiants_refuses_bon_jeton_accepte_deconnexion_invalide_le_jeton(self):
        self.user('awa@test.ci', filiale='SNEDAI Telecom')
        app = ApiClient()
        self.assertEqual(app.login('awa@test.ci', 'faux12345').status_code, 401)
        self.assertEqual(app.login('inconnu@test.ci').status_code, 401)
        response = app.login('AWA@test.ci')
        data = response.json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data['user'], {'id': User.objects.get().id, 'nom': 'Dupont', 'prenom': 'Awa', 'email': 'awa@test.ci', 'filiale': 'SNEDAI Telecom', 'role': 'employe'})
        self.assertEqual(ApiToken.objects.get().token_hash == data['token'], False)  # seule l'empreinte est gardée
        self.assertEqual(app.call('GET', '/me').json()['user']['email'], 'awa@test.ci')
        self.assertEqual(app.call('POST', '/auth/logout').status_code, 200)
        self.assertEqual(app.call('GET', '/me').status_code, 401)

    def test_sans_jeton_valide_rien_n_est_accessible_et_un_cookie_de_session_ne_donne_aucun_acces(self):
        event = self.event()
        self.user('awa@test.ci')
        app = ApiClient()
        for path in ('/me', '/events', f'/events/{event.id}', f'/events/{event.id}/photo'):
            response = app.call('GET', path)
            self.assertEqual((response.status_code, response.json()['code']), (401, 'unauthorized'), path)
        for bad in ('x', 'a' * 40 + '!'):
            app.token = bad
            self.assertEqual(app.call('GET', '/me').status_code, 401)
        web = Client()
        self.login(web, 'awa@test.ci')
        self.assertEqual(web.get('/api/v1/events').status_code, 401)

    def test_reponses_en_json_y_compris_pour_une_adresse_inconnue_ou_un_corps_invalide(self):
        app = ApiClient()
        self.assertEqual(app.call('GET', '/nimporte-quoi').json(), {'ok': False, 'message': 'Adresse inconnue.'})
        response = app.http.post('/api/v1/auth/login', 'pas du json', content_type='application/json')
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()['ok'], False)
        self.assertEqual(app.call('GET', '/auth/login', token=False).status_code, 405)
        self.assertEqual(app.http.get('/api/nimporte').status_code, 404)

    def test_l_employe_voit_les_evenements_confirme_sa_presence_et_recoit_son_billet(self):
        event = self.event('Séminaire', debut='2099-11-14T09:00', fin='2099-11-14T16:00')
        self.event('Autre', debut='2099-12-01T09:00', fin='2099-12-01T10:00')
        self.user('awa@test.ci')
        app = ApiClient()
        app.login('awa@test.ci')

        listing = app.call('GET', '/events').json()
        self.assertEqual([e['titre'] for e in listing['actifs']], ['Séminaire', 'Autre'])
        self.assertEqual(listing['prochainId'], event.id)
        first = listing['actifs'][0]
        self.assertEqual((first['jour'], first['mois'], first['heures'], first['date']), ('14', 'nov', '09:00 – 16:00', 'samedi 14 novembre 2099'))
        self.assertEqual((first['debut'], first['participation']), ('2099-11-14T09:00:00.000Z', None))

        detail = app.call('GET', f'/events/{event.id}').json()
        self.assertEqual((detail['billet'], detail['event']['participation']), (None, None))
        self.assertIn('google.com', detail['agenda']['google'])

        done = app.call('POST', f'/events/{event.id}/participer').json()
        self.assertTrue(done['emailed'])
        participation = Participation.objects.get()
        self.assertEqual(done['billet']['qr'], f'SNEDAI-EVT:{participation.qr_token}')
        self.assertEqual(done['event']['participation'], {'confirme': True, 'present': False, 'scanneLe': None})
        self.assertEqual(len(self.sent), 1)
        self.assertFalse(app.call('POST', f'/events/{event.id}/participer').json()['emailed'])  # pas de second e-mail
        self.assertEqual(len(self.sent), 1)

        cancelled = app.call('POST', f'/events/{event.id}/annuler').json()
        self.assertEqual((cancelled['billet'], cancelled['event']['participation']), (None, None))
        self.assertEqual(app.call('GET', '/events/9999').status_code, 404)

    def test_la_photo_n_est_visible_qu_avec_un_jeton(self):
        event = self.event()
        Event.objects.filter(pk=event.pk).update(photo_data=b'\x89PNG-test', photo_type='image/png')
        self.user('awa@test.ci')
        app = ApiClient()
        self.assertEqual(app.call('GET', f'/events/{event.id}/photo').status_code, 401)
        app.login('awa@test.ci')
        response = app.call('GET', f'/events/{event.id}/photo')
        self.assertEqual((response.status_code, response['Content-Type'], response.content), (200, 'image/png', b'\x89PNG-test'))
        self.assertEqual(app.call('GET', '/events').json()['actifs'][0]['photo'], f'/api/v1/events/{event.id}/photo')

    def test_scan_par_un_agent_presence_confirmee_une_seule_fois_et_reserve_aux_agents(self):
        event = self.event()
        awa = self.user('awa@test.ci', prenom='Awa')
        self.user('moussa@test.ci', agent=True)
        employee, agent = ApiClient(), ApiClient()
        employee.login('awa@test.ci')
        agent.login('moussa@test.ci')
        qr = employee.call('POST', f'/events/{event.id}/participer').json()['billet']['qr']

        self.assertEqual(employee.call('POST', '/scan', {'code': qr}).status_code, 403)
        ok = agent.call('POST', '/scan', {'code': qr})
        self.assertEqual((ok.status_code, ok.json()['status'], ok.json()['person']['prenom']), (200, 'present', 'Awa'))
        again = agent.call('POST', '/scan', {'code': qr})
        self.assertEqual((again.status_code, again.json()['status']), (409, 'deja'))
        self.assertEqual(agent.call('POST', '/scan', {'code': 'SNEDAI-EVT:' + 'z' * 32}).json()['status'], 'inconnu')
        self.assertEqual(agent.call('POST', '/scan', {}).json()['status'], 'inconnu')

        validated = employee.call('GET', f'/events/{event.id}').json()
        self.assertTrue(validated['event']['participation']['present'])
        self.assertIsNone(validated['billet'])
        self.assertEqual(agent.call('GET', '/me').json()['user']['role'], 'agent')

    def test_un_evenement_termine_ne_prend_plus_de_reponses(self):
        event = self.event(termine_at=timezone.now())
        self.user('awa@test.ci')
        app = ApiClient()
        app.login('awa@test.ci')
        self.assertEqual(app.call('POST', f'/events/{event.id}/participer').status_code, 409)
        self.assertEqual(app.call('POST', f'/events/{event.id}/annuler').status_code, 409)
        listing = app.call('GET', '/events').json()
        self.assertEqual((listing['actifs'], len(listing['termines']), listing['prochainId']), ([], 1, None))

    def test_config_publique_et_jeton_d_un_compte_supprime(self):
        with override_settings(FILIALES=['SNEDAI', 'SNEDAI Telecom']):
            self.assertEqual(ApiClient().call('GET', '/config', token=False).json(), {'ok': True, 'filiales': ['SNEDAI', 'SNEDAI Telecom'], 'inscriptionParEmail': True})
        user = self.user('awa@test.ci')
        app = ApiClient()
        app.login('awa@test.ci')
        user.delete()
        self.assertEqual(app.call('GET', '/me').status_code, 401)

    def test_un_jeton_expire_est_refuse(self):
        self.user('awa@test.ci')
        app = ApiClient()
        app.login('awa@test.ci')
        ApiToken.objects.update(expires_at=timezone.now() - timedelta(days=1))
        self.assertEqual(app.call('GET', '/me').status_code, 401)

    def test_un_administrateur_est_reconnu_avec_son_role(self):
        self.user('admin@test.ci')
        app = ApiClient()
        self.assertEqual(app.login('admin@test.ci').json()['user']['role'], 'admin')


class ApiSignupTests(BaseTest):
    values = {'nom': 'Kone', 'prenom': 'Issa', 'filiale': 'SNEDAI', 'email': 'Issa@Test.ci', 'password': PASSWORD, 'confirmation': PASSWORD}

    def test_inscription_par_code_etapes_essais_limites_renvoi_differe_doublons_refuses(self):
        app = ApiClient()
        start = app.call('POST', '/auth/signup', self.values, token=False)
        self.assertEqual(start.status_code, 201)
        info = start.json()
        self.assertEqual((info['email'], info['expiresInMinutes'], info['resendInSeconds']), ('issa@test.ci', 15, 60))
        self.assertEqual(User.objects.count(), 0)
        self.assertEqual(self.sent[-1]['to'], ['issa@test.ci'])

        wrong = app.call('POST', '/auth/signup/verify', {'signupId': info['signupId'], 'code': '12'}, token=False)
        self.assertEqual((wrong.status_code, wrong.json()['restants']), (400, 4))
        resend = app.call('POST', '/auth/signup/resend', {'signupId': info['signupId']}, token=False)
        self.assertEqual(resend.status_code, 429)
        self.assertGreater(resend.json()['retryInSeconds'], 0)
        PendingSignup.objects.update(sent_at=timezone.now() - timedelta(seconds=61))
        self.assertEqual(app.call('POST', '/auth/signup/resend', {'signupId': info['signupId']}, token=False).status_code, 200)
        self.assertEqual(len(self.sent), 2)

        done = app.call('POST', '/auth/signup/verify', {'signupId': info['signupId'], 'code': self.last_code()}, token=False)
        self.assertEqual(done.status_code, 201)
        self.assertEqual(done.json()['user']['email'], 'issa@test.ci')
        app.token = done.json()['token']
        self.assertEqual(app.call('GET', '/me').status_code, 200)
        self.assertEqual(PendingSignup.objects.count(), 0)

        # doublon refusé
        self.assertEqual(app.call('POST', '/auth/signup', self.values, token=False).status_code, 409)
        # le code d'une inscription terminée ne sert plus
        self.assertEqual(app.call('POST', '/auth/signup/verify', {'signupId': info['signupId'], 'code': '000000'}, token=False).json()['code'], 'signup_expired')

    def test_cinq_codes_faux_bloquent_l_inscription_jusqu_a_un_nouveau_code(self):
        app = ApiClient()
        info = app.call('POST', '/auth/signup', self.values, token=False).json()
        real = self.last_code()
        wrong = '999999' if real != '999999' else '888888'
        for _ in range(5):
            app.call('POST', '/auth/signup/verify', {'signupId': info['signupId'], 'code': wrong}, token=False)
        blocked = app.call('POST', '/auth/signup/verify', {'signupId': info['signupId'], 'code': real}, token=False)
        self.assertEqual((blocked.status_code, blocked.json()['code']), (429, 'too_many_attempts'))
        self.assertEqual(User.objects.count(), 0)

    def test_validation_expiration_et_pannes(self):
        app = ApiClient()
        for changes, message in (({'email': 'nope'}, 'invalide'), ({'confirmation': 'autre1234'}, 'identiques'), ({'password': 'court', 'confirmation': 'court'}, '8 caractères')):
            response = app.call('POST', '/auth/signup', {**self.values, **changes}, token=False)
            self.assertEqual(response.status_code, 400)
            self.assertIn(message, response.json()['message'])

        info = app.call('POST', '/auth/signup', self.values, token=False).json()
        PendingSignup.objects.update(expires_at=timezone.now() - timedelta(minutes=1))
        expired = app.call('POST', '/auth/signup/verify', {'signupId': info['signupId'], 'code': self.last_code()}, token=False)
        self.assertEqual((expired.status_code, expired.json()['code']), (400, 'code_expired'))

        self.mail_ok = False
        self.assertEqual(app.call('POST', '/auth/signup', self.values, token=False).status_code, 502)
        self.assertEqual(PendingSignup.objects.filter(email='issa@test.ci').count(), 0)
        with override_settings(AGENTMAIL_API_KEY='', AGENTMAIL_INBOX=''):
            from ..services.mailer import reset_mailer
            reset_mailer()
            self.assertEqual(app.call('POST', '/auth/signup', self.values, token=False).status_code, 503)

    @override_settings(LOGIN_RATE_LIMIT=2)
    def test_limitation_des_tentatives(self):
        app = ApiClient()
        codes = [app.call('POST', '/auth/login', {'email': 'a@test.ci', 'password': 'x'}, token=False).status_code for _ in range(4)]
        self.assertEqual(codes, [401, 401, 429, 429])
