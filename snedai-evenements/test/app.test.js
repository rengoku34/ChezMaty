const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');
const request = require('supertest');
const { loadConfig } = require('../src/config');
const { openDatabase } = require('../src/db');
const { createApp } = require('../src/app');
const { handleGoogleProfile } = require('../src/auth');
const { createMailer } = require('../src/mailer');
const { qrContent } = require('../src/qr');

// Base PostgreSQL de test, vidée au début : ne jamais pointer vers la base de production.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://snedai:snedai@localhost:5432/snedai_test';
const silent = { info() {}, error() {} };
let app;
let repo;
const mails = { announced: [], qr: [] };

function fakeMailer() {
  return {
    configured: true,
    async announceEvent(event, users) {
      mails.announced.push({ event, users });
      return users.length;
    },
    async sendQrCode(event, user, png) {
      mails.qr.push({ event, user, png });
      return true;
    },
  };
}

function csrfFrom(html) {
  return html.match(/name="_csrf" value="([^"]+)"/)[1];
}

async function loginAs(email) {
  const agent = request.agent(app);
  const page = await agent.get('/connexion');
  const res = await agent.post('/connexion').type('form').send({ _csrf: csrfFrom(page.text), email, password: 'motdepasse1' });
  assert.equal(res.status, 302);
  const home = await agent.get('/');
  return { agent, csrf: csrfFrom(home.text) };
}

before(async () => {
  const config = loadConfig({
    SESSION_SECRET: 'secret-de-test',
    ADMIN_EMAILS: 'stagiaire@snedai.com',
    FILIALES: 'SNEDAI Groupe;OSIA',
  });
  repo = await openDatabase(TEST_DATABASE_URL);
  await repo.pool.query('TRUNCATE users, events, participations, sessions RESTART IDENTITY CASCADE');
  const passwordHash = bcrypt.hashSync('motdepasse1', 4);
  await repo.createUser({ nom: 'Admin', prenom: 'Stagiaire', filiale: 'SNEDAI Groupe', email: 'stagiaire@snedai.com', passwordHash });
  await repo.createUser({ nom: 'Kouassi', prenom: 'Awa', filiale: 'OSIA', email: 'awa@example.com', passwordHash });
  const agentUser = await repo.createUser({ nom: 'Traoré', prenom: 'Moussa', filiale: 'SNEDAI Groupe', email: 'agent@example.com', passwordHash });
  await repo.setAgent(agentUser.id, true);
  app = createApp({ config, repo, mailer: fakeMailer(), logger: silent });
});

after(() => repo.close());

test('sans compte, on ne voit pas les événements', async () => {
  const res = await request(app).get('/');
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/connexion');
});

test('mauvais mot de passe refusé', async () => {
  const agent = request.agent(app);
  const page = await agent.get('/connexion');
  const res = await agent.post('/connexion').type('form').send({ _csrf: csrfFrom(page.text), email: 'awa@example.com', password: 'faux' });
  assert.equal(res.status, 401);
});

test('un formulaire sans jeton CSRF est refusé', async () => {
  const res = await request(app).post('/connexion').type('form').send({ email: 'awa@example.com', password: 'motdepasse1' });
  assert.equal(res.status, 403);
});

test('seul l’administrateur accède au tableau de bord, à la publication et à l’export', async () => {
  for (const email of ['awa@example.com', 'agent@example.com']) {
    const { agent, csrf } = await loginAs(email);
    assert.equal((await agent.get('/admin/tableau-de-bord')).status, 403);
    assert.equal((await agent.get('/admin/evenements/nouveau')).status, 403);
    assert.equal((await agent.get('/admin/agents')).status, 403);
    const post = await agent.post('/admin/evenements').field('_csrf', csrf).field('titre', 'Pirate').field('description', 'x');
    assert.equal(post.status, 403);
  }
  assert.equal((await repo.listAllEvents()).length, 0);
});

test('parcours complet : publication, présence, QR, scan, tableau de bord, Excel, terminé', async () => {
  const admin = await loginAs('stagiaire@snedai.com');
  const publish = await admin.agent
    .post('/admin/evenements')
    .field('_csrf', admin.csrf)
    .field('titre', 'Journée bien-être')
    .field('description', 'Activités sportives et déjeuner.')
    .field('debut', '2026-11-14T09:00')
    .field('fin', '2026-11-14T16:00')
    .field('lieu', 'Siège SNEDAI')
    .attach('photo', Buffer.from('89504e470d0a1a0a', 'hex'), { filename: 'photo.png', contentType: 'image/png' });
  assert.equal(publish.status, 302);
  const [event] = await repo.listActiveEvents();
  assert.equal(event.titre, 'Journée bien-être');
  assert.equal(event.has_photo, true);
  assert.equal(mails.announced[0].users.length, 3, 'tous les inscrits sont prévenus');

  // Un employé confirme sa présence et reçoit son QR code.
  const awa = await loginAs('awa@example.com');
  assert.match((await awa.agent.get('/')).text, /Journée bien-être/);
  await awa.agent.post(`/evenements/${event.id}/participer`).type('form').send({ _csrf: awa.csrf }).expect(302);
  const page = await awa.agent.get(`/evenements/${event.id}`);
  assert.match(page.text, /Votre QR code d’entrée/);
  const photo = await awa.agent.get(`/evenements/${event.id}/photo`);
  assert.equal(photo.headers['content-type'], 'image/png');
  assert.equal(mails.qr.length, 1);
  const participation = await repo.findParticipation(event.id, mails.qr[0].user.id);

  // L'agent scanne : présence confirmée, puis un second scan est signalé.
  const agent = await loginAs('agent@example.com');
  const scan = (code) => agent.agent.post('/scan').set('X-CSRF-Token', agent.csrf).set('Accept', 'application/json').send({ code });
  const first = await scan(qrContent(participation.qr_token));
  assert.equal(first.status, 200);
  assert.equal(first.body.person.nom, 'Kouassi');
  assert.equal((await scan(qrContent(participation.qr_token))).body.status, 'deja');
  assert.equal((await scan('SNEDAI-EVT:inconnuinconnuinconnu123')).status, 404);

  // Tableau de bord et export Excel.
  const dashboard = await admin.agent.get(`/admin/tableau-de-bord?evenement=${event.id}`);
  assert.match(dashboard.text, /<strong>3<\/strong><span>Inscrits sur le site/);
  assert.match(dashboard.text, /<strong>1<\/strong><span>Ont dit/);
  assert.match(dashboard.text, /<strong>1<\/strong><span>Étaient là/);
  const xlsx = await admin.agent.get(`/admin/evenements/${event.id}/export.xlsx`).buffer(true).parse((res, cb) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });
  assert.equal(xlsx.status, 200);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(xlsx.body);
  assert.deepEqual(workbook.worksheets.map((s) => s.name), ['Résumé', 'Inscrits sur le site', 'Présents annoncés', 'Présents confirmés (QR)']);
  assert.equal(workbook.getWorksheet('Inscrits sur le site').rowCount, 4);
  assert.equal(workbook.getWorksheet('Présents confirmés (QR)').getRow(2).getCell(3).value, 'awa@example.com');

  // Fin de l'événement : il passe dans l'historique, plus de scan ni d'inscription.
  await admin.agent.post(`/admin/evenements/${event.id}/terminer`).type('form').send({ _csrf: admin.csrf }).expect(302);
  assert.match((await admin.agent.get(`/admin/tableau-de-bord?evenement=${event.id}`)).text, /✔ Terminé/);
  assert.equal((await repo.listActiveEvents()).length, 0);
  assert.equal((await repo.listFinishedEvents()).length, 1);
  assert.equal((await scan(qrContent(participation.qr_token))).body.status, 'termine');
  const moussa = await repo.findUserByEmail('agent@example.com');
  await agent.agent.post(`/evenements/${event.id}/participer`).type('form').send({ _csrf: agent.csrf }).expect(302);
  assert.equal(await repo.findParticipation(event.id, moussa.id), undefined);
});

test('photos accessibles seulement une fois connecté', async () => {
  const [event] = await repo.listAllEvents();
  assert.equal((await request(app).get(`/evenements/${event.id}/photo`)).status, 302);
});

test('création et connexion avec Google', async () => {
  const profile = (id, email) => ({ id, emails: [{ value: email, verified: true }] });
  const pending = { nom: 'Yao', prenom: 'Koffi', filiale: 'OSIA', passwordHash: 'x' };

  const created = await handleGoogleProfile(repo, pending, profile('g-1', 'Koffi@Gmail.com'));
  assert.equal(created.created, true);
  assert.equal(created.user.email, 'koffi@gmail.com');

  assert.match((await handleGoogleProfile(repo, pending, profile('g-1', 'koffi@gmail.com'))).error, /existe déjà/);
  assert.equal((await handleGoogleProfile(repo, null, profile('g-1', 'koffi@gmail.com'))).user.id, created.user.id);
  assert.match((await handleGoogleProfile(repo, null, profile('g-2', 'inconnu@gmail.com'))).error, /Créez/);
  const unverified = { id: 'g-3', emails: [{ value: 'a@b.c', verified: false }] };
  assert.match((await handleGoogleProfile(repo, pending, unverified)).error, /vérifiée/);
});

test('les e-mails partent par l’API Brevo avec le QR code en pièce jointe', async () => {
  const calls = [];
  const fetchStub = async (url, options) => {
    calls.push({ url, headers: options.headers, body: JSON.parse(options.body) });
    return { ok: true };
  };
  const config = loadConfig({ BREVO_API_KEY: 'cle-test', MAIL_FROM: 'Événements SNEDAI <rh@example.com>', APP_URL: 'https://site.test' });
  const mailer = createMailer(config, silent, fetchStub);
  assert.equal(mailer.configured, true);

  const event = { id: 7, titre: 'Séminaire', lieu: 'Abidjan' };
  await mailer.sendQrCode(event, { email: 'awa@example.com', prenom: 'Awa' }, Buffer.from('png'), '');
  const sent = calls[0];
  assert.equal(sent.url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(sent.headers['api-key'], 'cle-test');
  assert.deepEqual(sent.body.sender, { name: 'Événements SNEDAI', email: 'rh@example.com' });
  assert.deepEqual(sent.body.to, [{ email: 'awa@example.com' }]);
  assert.equal(sent.body.attachment[0].content, Buffer.from('png').toString('base64'));

  assert.equal(await mailer.announceEvent(event, [{ email: 'a@x.ci', prenom: 'A' }, { email: 'b@x.ci', prenom: 'B' }], ''), 2);
});
