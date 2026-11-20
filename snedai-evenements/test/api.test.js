const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const { loadConfig } = require('../src/config');
const { openDatabase } = require('../src/db');
const { createApp } = require('../src/app');

// Base PostgreSQL de test, vidée au début : ne jamais pointer vers la base de production.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://snedai:snedai@localhost:5432/snedai_test';
const silent = { info() {}, error() {} };
const PASSWORD = 'motdepasse1';
const mails = { qr: [], codes: [], welcome: [], failNext: false };

let app;
let repo;
let eventId;

const fakeMailer = {
  configured: true,
  async sendQrCode(event, user) {
    mails.qr.push({ event: event.id, to: user.email });
    return true;
  },
  async sendVerificationCode(email, prenom, code) {
    if (mails.failNext) throw new Error('service indisponible');
    mails.codes.push({ email, code });
    return true;
  },
  async sendWelcome(user) {
    mails.welcome.push(user.email);
    return true;
  },
};

const api = (method, path, token) => {
  const r = request(app)[method](`/api/v1${path}`);
  return token ? r.set('Authorization', `Bearer ${token}`) : r;
};
const login = async (email) => (await api('post', '/auth/login').send({ email, password: PASSWORD }).expect(200)).body.token;

before(async () => {
  const config = loadConfig({
    SESSION_SECRET: 'secret-de-test',
    ADMIN_EMAILS: 'chef@snedai.com',
    FILIALES: 'SNEDAI Groupe;OSIA',
    LOGIN_RATE_LIMIT: '1000',
  });
  repo = await openDatabase(TEST_DATABASE_URL);
  await repo.pool.query('TRUNCATE users, events, participations, sessions, settings, api_tokens, pending_signups RESTART IDENTITY CASCADE');
  const passwordHash = bcrypt.hashSync(PASSWORD, 4);
  await repo.createUser({ nom: 'Chef', prenom: 'Admin', filiale: 'SNEDAI Groupe', email: 'chef@snedai.com', passwordHash });
  await repo.createUser({ nom: 'Kouassi', prenom: 'Awa', filiale: 'OSIA', email: 'awa@example.com', passwordHash });
  const agent = await repo.createUser({ nom: 'Traoré', prenom: 'Moussa', filiale: 'SNEDAI Groupe', email: 'agent@example.com', passwordHash });
  await repo.setAgent(agent.id, true);
  const event = await repo.createEvent({
    titre: 'Journée bien-être',
    description: 'Activités sportives.',
    debut: '2030-11-14T09:00',
    fin: '2030-11-14T16:00',
    lieu: 'Siège SNEDAI',
    photoData: Buffer.from('89504e470d0a1a0a', 'hex'),
    photoType: 'image/png',
  });
  eventId = event.id;
  app = createApp({ config, repo, mailer: fakeMailer, logger: silent });
});

after(() => repo.close());

test('connexion : mauvais identifiants refusés, bon jeton accepté, déconnexion qui invalide le jeton', async () => {
  assert.equal((await api('post', '/auth/login').send({ email: 'awa@example.com', password: 'faux' })).status, 401);
  assert.equal((await api('post', '/auth/login').send({ email: 'inconnu@example.com', password: PASSWORD })).status, 401);

  const res = await api('post', '/auth/login').send({ email: 'AWA@example.com', password: PASSWORD, appareil: 'Pixel 7' }).expect(200);
  assert.match(res.body.token, /^[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(res.body.user, { id: res.body.user.id, nom: 'Kouassi', prenom: 'Awa', email: 'awa@example.com', filiale: 'OSIA', role: 'employe' });
  assert.equal(res.body.user.password_hash, undefined);

  const me = await api('get', '/me', res.body.token).expect(200);
  assert.equal(me.body.user.email, 'awa@example.com');
  await api('post', '/auth/logout', res.body.token).expect(200);
  assert.equal((await api('get', '/me', res.body.token)).status, 401);
});

test('sans jeton valide, rien n’est accessible ; un cookie de session du site ne donne aucun accès', async () => {
  for (const [method, path] of [['get', '/me'], ['get', '/events'], ['get', `/events/${eventId}`], ['post', `/events/${eventId}/participer`], ['post', '/scan']]) {
    assert.equal((await api(method, path)).status, 401, `${method} ${path}`);
  }
  assert.equal((await api('get', '/me', 'a'.repeat(43))).status, 401);
  assert.equal((await request(app).get('/api/v1/me').set('Authorization', 'Basic abc')).status, 401);

  // Connexion par le site (cookie) puis appel de l'interface mobile sans jeton : refusé.
  const web = request.agent(app);
  const page = await web.get('/connexion');
  const csrf = page.text.match(/name="_csrf" value="([^"]+)"/)[1];
  await web.post('/connexion').type('form').send({ _csrf: csrf, email: 'awa@example.com', password: PASSWORD }).expect(302);
  assert.equal((await web.get('/api/v1/me')).status, 401);
});

test('réponses en JSON, y compris pour une adresse inconnue ou un corps invalide', async () => {
  const unknown = await request(app).get('/api/v1/nimporte-quoi').expect(404);
  assert.equal(unknown.body.ok, false);
  const bad = await request(app).post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{ pas du json').expect(400);
  assert.equal(bad.body.ok, false);
  assert.match(bad.headers['content-type'], /json/);
});

test('l’employé voit les événements, confirme sa présence et reçoit son billet', async () => {
  const token = await login('awa@example.com');
  const list = await api('get', '/events', token).expect(200);
  assert.equal(list.body.actifs.length, 1);
  assert.equal(list.body.prochainId, eventId);
  const ev = list.body.actifs[0];
  assert.equal(ev.titre, 'Journée bien-être');
  assert.equal(ev.participation, null);
  assert.equal(ev.jour, '14');
  assert.equal(ev.heures, '09:00 – 16:00');
  assert.equal(ev.debut, '2030-11-14T09:00:00.000Z');
  assert.equal(ev.photo, `/api/v1/events/${eventId}/photo`);

  const before = await api('get', `/events/${eventId}`, token).expect(200);
  assert.equal(before.body.billet, null);
  assert.match(before.body.agenda.google, /calendar\.google\.com/);

  const joined = await api('post', `/events/${eventId}/participer`, token).expect(200);
  assert.match(joined.body.billet.qr, /^SNEDAI-EVT:[A-Za-z0-9_-]{32}$/);
  assert.equal(joined.body.emailed, true);
  assert.equal(joined.body.event.participation.confirme, true);
  assert.equal(mails.qr.length, 1);

  // Confirmer une deuxième fois ne crée pas un autre billet et n'envoie pas un autre e-mail.
  const again = await api('post', `/events/${eventId}/participer`, token).expect(200);
  assert.equal(again.body.billet.qr, joined.body.billet.qr);
  assert.equal(mails.qr.length, 1);

  const cancelled = await api('post', `/events/${eventId}/annuler`, token).expect(200);
  assert.equal(cancelled.body.billet, null);
  assert.equal(cancelled.body.event.participation, null);
  assert.equal((await api('get', `/events/999999`, token)).status, 404);
});

test('la photo n’est visible qu’avec un jeton', async () => {
  const token = await login('awa@example.com');
  assert.equal((await api('get', `/events/${eventId}/photo`)).status, 401);
  const photo = await api('get', `/events/${eventId}/photo`, token).expect(200);
  assert.equal(photo.headers['content-type'], 'image/png');
});

test('scan par un agent : présence confirmée une seule fois, réservé aux agents', async () => {
  const employee = await login('awa@example.com');
  const agent = await login('agent@example.com');
  const ticket = (await api('post', `/events/${eventId}/participer`, employee).expect(200)).body.billet.qr;

  assert.equal((await api('post', '/scan', employee).send({ code: ticket })).status, 403);
  assert.equal((await api('post', '/scan', agent).send({ code: 'SNEDAI-EVT:inconnuinconnuinconnu123' })).status, 404);

  const first = await api('post', '/scan', agent).send({ code: ticket }).expect(200);
  assert.equal(first.body.status, 'present');
  assert.equal(first.body.person.nom, 'Kouassi');
  assert.equal((await api('post', '/scan', agent).send({ code: ticket })).body.status, 'deja');

  const detail = await api('get', `/events/${eventId}`, employee).expect(200);
  assert.equal(detail.body.event.participation.present, true);
  assert.equal(detail.body.billet, null, 'plus de QR code une fois la présence validée');
  assert.equal((await api('post', `/events/${eventId}/annuler`, employee).expect(200)).body.event.participation.present, true, 'une présence validée ne s’annule pas');
});

test('un événement terminé ne prend plus de réponses', async () => {
  const other = await repo.createEvent({ titre: 'Ancien', description: 'x', debut: '2020-01-01T09:00' });
  await repo.finishEvent(other.id);
  const token = await login('awa@example.com');
  assert.equal((await api('post', `/events/${other.id}/participer`, token)).status, 409);
  const list = await api('get', '/events', token).expect(200);
  assert.deepEqual(list.body.termines.map((e) => e.titre), ['Ancien']);
});

test('inscription par code : étapes, essais limités, renvoi différé, doublons refusés', async () => {
  const form = { nom: 'Bamba', prenom: 'Fatou', filiale: 'OSIA', email: 'Fatou@Exemple.ci', password: 'Secret2026', confirmation: 'Secret2026' };

  assert.equal((await api('post', '/auth/signup').send({ ...form, password: 'motdepasse', confirmation: 'motdepasse' })).status, 400);
  assert.equal((await api('post', '/auth/signup').send({ ...form, filiale: 'Inconnue' })).status, 400);
  assert.equal((await api('post', '/auth/signup').send({ ...form, email: 'awa@example.com' })).status, 409);

  mails.failNext = true;
  assert.equal((await api('post', '/auth/signup').send(form)).status, 502);
  mails.failNext = false;

  const start = await api('post', '/auth/signup').send(form).expect(201);
  assert.equal(start.body.email, 'fatou@exemple.ci');
  assert.equal(start.body.expiresInMinutes, 15);
  const { code } = mails.codes.at(-1);
  assert.match(code, /^\d{6}$/);
  assert.equal(await repo.findUserByEmail('fatou@exemple.ci'), undefined, 'pas de compte avant la confirmation');

  assert.match((await api('post', '/auth/signup/resend').send({ signupId: start.body.signupId }).expect(429)).body.message, /Patientez/);
  const wrong = String((Number(code) + 1) % 1000000).padStart(6, '0');
  assert.equal((await api('post', '/auth/signup/verify').send({ signupId: start.body.signupId, code: wrong }).expect(400)).body.restants, 4);

  const done = await api('post', '/auth/signup/verify').send({ signupId: start.body.signupId, code: ` ${code.slice(0, 3)} ${code.slice(3)} ` }).expect(201);
  assert.equal(done.body.user.role, 'employe');
  assert.equal(done.body.user.nom, 'Bamba');
  assert.equal((await api('get', '/me', done.body.token).expect(200)).body.user.email, 'fatou@exemple.ci');
  assert.deepEqual(mails.welcome, ['fatou@exemple.ci']);
  assert.equal((await api('post', '/auth/signup/verify').send({ signupId: start.body.signupId, code })).status, 404, 'le code ne sert qu’une fois');

  // Reconnexion avec le mot de passe choisi.
  assert.equal((await api('post', '/auth/login').send({ email: 'fatou@exemple.ci', password: 'Secret2026' })).status, 200);
});

test('5 codes faux bloquent l’inscription jusqu’à un nouveau code', async () => {
  const start = await api('post', '/auth/signup')
    .send({ nom: 'Yao', prenom: 'Koffi', filiale: 'OSIA', email: 'koffi@exemple.ci', password: 'Secret2026', confirmation: 'Secret2026' })
    .expect(201);
  const { code } = mails.codes.at(-1);
  const wrong = String((Number(code) + 1) % 1000000).padStart(6, '0');
  for (let i = 0; i < 5; i += 1) await api('post', '/auth/signup/verify').send({ signupId: start.body.signupId, code: wrong }).expect(400);
  assert.equal((await api('post', '/auth/signup/verify').send({ signupId: start.body.signupId, code })).status, 429, 'même le bon code est refusé après 5 essais');
});

test('config publique et jeton d’un compte supprimé', async () => {
  const config = await api('get', '/config').expect(200);
  assert.deepEqual(config.body.filiales, ['SNEDAI Groupe', 'OSIA']);
  assert.equal(config.body.inscriptionParEmail, true);

  const user = await repo.createUser({ nom: 'Temp', prenom: 'Compte', filiale: 'OSIA', email: 'temp@example.com', passwordHash: bcrypt.hashSync(PASSWORD, 4) });
  const token = await login('temp@example.com');
  await api('get', '/me', token).expect(200);
  await repo.deleteUser(user.id);
  assert.equal((await api('get', '/me', token)).status, 401);
});

test('un administrateur est reconnu avec son rôle', async () => {
  const token = await login('chef@snedai.com');
  assert.equal((await api('get', '/me', token).expect(200)).body.user.role, 'admin');
  const agent = await login('agent@example.com');
  assert.equal((await api('get', '/me', agent).expect(200)).body.user.role, 'agent');
});
