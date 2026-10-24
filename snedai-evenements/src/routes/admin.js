const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const multer = require('multer');
const { verifyCsrf } = require('../csrf');
const { buildEventWorkbook } = require('../excel');

const IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const clean = (value, max) => String(value ?? '').trim().slice(0, max);

// Toutes ces routes sont réservées à l'administrateur (requireAdmin) : publier, voir les listes,
// exporter en Excel, terminer un événement et désigner les agents de scan.
module.exports = function adminRoutes({ repo, config, mailer, format, access, logger }) {
  const router = express.Router();
  router.use(access.requireAdmin);

  fs.mkdirSync(config.uploadDir, { recursive: true });
  const upload = multer({
    storage: multer.diskStorage({
      destination: config.uploadDir,
      filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${IMAGE_TYPES[file.mimetype]}`),
    }),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => cb(null, Boolean(IMAGE_TYPES[file.mimetype])),
  });

  function loadEvent(req, res, next) {
    const event = repo.findEvent(Number(req.params.id));
    if (!event) return res.status(404).render('error', { title: 'Introuvable', message: 'Cet événement n’existe pas.' });
    req.event = event;
    next();
  }

  router.get('/evenements/nouveau', (req, res) => {
    res.render('admin/new-event', { title: 'Publier un événement', error: null, values: {} });
  });

  router.post(
    '/evenements',
    (req, res, next) =>
      upload.single('photo')(req, res, (err) => {
        if (!err) return next();
        req.uploadError = err.code === 'LIMIT_FILE_SIZE' ? 'La photo ne doit pas dépasser 5 Mo.' : 'Photo invalide.';
        next();
      }),
    verifyCsrf,
    (req, res) => {
      const values = {
        titre: clean(req.body.titre, 150),
        description: clean(req.body.description, 5000),
        lieu: clean(req.body.lieu, 200),
        debut: clean(req.body.debut, 16),
        fin: clean(req.body.fin, 16),
      };
      let error = req.uploadError || null;
      if (!error && (!values.titre || !values.description)) error = 'Le sujet et la description sont obligatoires.';
      if (!error && ((values.debut && !DATETIME.test(values.debut)) || (values.fin && !DATETIME.test(values.fin)))) error = 'Horaires invalides.';
      if (!error && values.fin && !values.debut) error = 'Indiquez l’heure de début avant l’heure de fin.';
      if (!error && values.debut && values.fin && values.fin < values.debut) error = 'La fin doit être après le début.';
      if (error) {
        if (req.file) fs.rm(req.file.path, { force: true }, () => {});
        return res.status(400).render('admin/new-event', { title: 'Publier un événement', error, values });
      }

      const event = repo.createEvent({ ...values, photo: req.file?.filename });
      const users = repo.listUsers();
      // Envoi des e-mails en arrière-plan pour ne pas bloquer la page.
      mailer
        .announceEvent(event, users, format.eventRange(event.debut, event.fin))
        .then((sent) => logger.info(`Événement ${event.id} annoncé : ${sent}/${users.length} e-mails envoyés.`))
        .catch((err) => logger.error(`Annonce de l’événement ${event.id} : ${err.message}`));

      req.session.flash = {
        type: 'success',
        message: mailer.configured
          ? `Événement publié. Les ${users.length} inscrit(s) sont prévenus par e-mail.`
          : 'Événement publié. (Les e-mails ne partent pas : SMTP non configuré.)',
      };
      res.redirect(`/admin/tableau-de-bord?evenement=${event.id}`);
    }
  );

  // Tableau de bord d'un événement, choisi dans la liste déroulante (historique).
  router.get('/tableau-de-bord', (req, res) => {
    const events = repo.listAllEvents();
    const selected = events.find((e) => e.id === Number(req.query.evenement)) || events[0] || null;
    res.render('admin/dashboard', {
      title: 'Tableau de bord',
      events,
      event: selected,
      inscrits: repo.listUsers(),
      confirmes: selected ? repo.listConfirmed(selected.id) : [],
      presents: selected ? repo.listPresent(selected.id) : [],
    });
  });

  router.get('/evenements/:id/export.xlsx', loadEvent, async (req, res) => {
    const buffer = await buildEventWorkbook({
      event: req.event,
      inscrits: repo.listUsers(),
      confirmes: repo.listConfirmed(req.event.id),
      presents: repo.listPresent(req.event.id),
      format,
    });
    const slug = req.event.titre.normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'evenement';
    res
      .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .set('Content-Disposition', `attachment; filename="snedai-${req.event.id}-${slug}.xlsx"`)
      .send(Buffer.from(buffer));
  });

  router.post('/evenements/:id/terminer', loadEvent, (req, res) => {
    repo.finishEvent(req.event.id);
    req.session.flash = { type: 'success', message: `« ${req.event.titre} » est marqué comme terminé.` };
    res.redirect(`/admin/tableau-de-bord?evenement=${req.event.id}`);
  });

  router.get('/agents', (req, res) => {
    res.render('admin/agents', { title: 'Agents de scan', users: repo.listUsers() });
  });

  router.post('/agents/:id', (req, res) => {
    const user = repo.findUserById(Number(req.params.id));
    if (user) repo.setAgent(user.id, req.body.agent === '1');
    res.redirect('/admin/agents');
  });

  return router;
};
