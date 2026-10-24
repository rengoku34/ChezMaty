const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');
const request = require('supertest');
const { loadConfig } = require('../src/config');
const { openDatabase } = require('../src/db');
const { createApp } = require('../src/app');
const { handleGoogleProfile } = require('../src/auth');
const { qrContent } = require('../src/qr');

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

before(() => {
  const config = loadConfig({
    SESSION_SECRET: 'secret-de-test',
    ADMIN_EMAILS: 'stagiaire@snedai.com',
    FILIALES: 'SNEDAI Groupe;OSIA',
    UPLOAD_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'snedai-uploads-')),
  });
  repo = openDatabase(':memory:');
  const passwordHash = bcrypt.hashSync('motdepasse1', 4);
  repo.createUser({ nom: 'Admin', prenom: 'Stagiaire', filiale: 'SNEDAI Groupe', email: 'stagiaire@snedai.com', passwordHash });
  repo.createUser({ nom: 'Kouassi', prenom: 'Awa', filiale: 'OSIA', email: 'awa@example.com', passwordHash });
  const agentUser = repo.createUser({ nom: 'Traoré', prenom: 'Moussa', filiale: 'SNEDAI Groupe', email: 'agent@example.com', passwordHash });
  repo.setAgent(agentUser.id, true);
  app = createApp({ config, repo, mailer: fakeMailer(), logger: silent });
});

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
  assert.equal(repo.listAllEvents().length, 0);
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
  const event = repo.listActiveEvents()[0];
  assert.equal(event.titre, 'Journée bien-être');
  assert.ok(event.photo.endsWith('.png'));
  assert.equal(mails.announced[0].users.length, 3, 'tous les inscrits sont prévenus');

  // Un employé confirme sa présence et reçoit son QR code.
  const awa = await loginAs('awa@example.com');
  assert.match((await awa.agent.get('/')).text, /Journée bien-être/);
  await awa.agent.post(`/evenements/${event.id}/participer`).type('form').send({ _csrf: awa.csrf }).expect(302);
  const page = await awa.agent.get(`/evenements/${event.id}`);
  assert.match(page.text, /Votre QR code d’entrée/);
  assert.equal(mails.qr.length, 1);
  const participation = repo.findParticipation(event.id, mails.qr[0].user.id);

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
  assert.equal(repo.listActiveEvents().length, 0);
  assert.equal(repo.listFinishedEvents().length, 1);
  assert.equal((await scan(qrContent(participation.qr_token))).body.status, 'termine');
  const moussa = repo.findUserByEmail('agent@example.com');
  await agent.agent.post(`/evenements/${event.id}/participer`).type('form').send({ _csrf: agent.csrf }).expect(302);
  assert.equal(repo.findParticipation(event.id, moussa.id), undefined);
});

test('photos accessibles seulement une fois connecté', async () => {
  const event = repo.listAllEvents()[0];
  assert.equal((await request(app).get(`/uploads/${event.photo}`)).status, 302);
});

test('création et connexion avec Google', () => {
  const profile = (id, email) => ({ id, emails: [{ value: email, verified: true }] });
  const pending = { nom: 'Yao', prenom: 'Koffi', filiale: 'OSIA', passwordHash: 'x' };

  const created = handleGoogleProfile(repo, pending, profile('g-1', 'Koffi@Gmail.com'));
  assert.equal(created.created, true);
  assert.equal(created.user.email, 'koffi@gmail.com');

  assert.match(handleGoogleProfile(repo, pending, profile('g-1', 'koffi@gmail.com')).error, /existe déjà/);
  assert.equal(handleGoogleProfile(repo, null, profile('g-1', 'koffi@gmail.com')).user.id, created.user.id);
  assert.match(handleGoogleProfile(repo, null, profile('g-2', 'inconnu@gmail.com')).error, /Créez/);
  assert.match(handleGoogleProfile(repo, pending, { id: 'g-3', emails: [{ value: 'a@b.c', verified: false }] }).error, /vérifiée/);
});
