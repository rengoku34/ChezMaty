const express = require('express');
const multer = require('multer');
const { verifyCsrf } = require('../csrf');
const { buildEventWorkbook } = require('../excel');

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_PHOTO_MB = 3;
const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const clean = (value, max) => String(value ?? '').trim().slice(0, max);

// Toutes ces routes sont réservées à l'administrateur (requireAdmin) : publier, voir les listes,
// exporter en Excel, terminer un événement et désigner les agents de scan.
module.exports = function adminRoutes({ repo, config, mailer, format, access, logger }) {
  const router = express.Router();
  router.use(access.requireAdmin);

  // La photo est gardée en mémoire puis enregistrée dans la base : rien n'est stocké sur le disque
  // du serveur, qui est effacé à chaque redémarrage sur les hébergements gratuits.
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_PHOTO_MB * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => cb(null, IMAGE_TYPES.includes(file.mimetype)),
  });

  async function loadEvent(req, res, next) {
    const id = Number(req.params.id);
    const event = Number.isInteger(id) && id > 0 ? await repo.findEvent(id) : null;
    if (!event) return res.status(404).render('error', { title: 'Introuvable', message: 'Cet événement n’existe pas.' });
    req.event = event;
    next();
  }

  const photoUpload = (req, res, next) =>
    upload.single('photo')(req, res, (err) => {
      if (!err) return next();
      req.uploadError = err.code === 'LIMIT_FILE_SIZE' ? `La photo ne doit pas dépasser ${MAX_PHOTO_MB} Mo.` : 'Photo invalide.';
      next();
    });

  // Lit et vérifie les champs du formulaire d'événement (création ou modification).
  function readEventForm(req) {
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
    return { values, error };
  }

  router.get('/evenements/nouveau', (req, res) => {
    res.render('admin/new-event', { title: 'Publier un événement', error: null, values: {}, event: null });
  });

  router.post(
    '/evenements',
    photoUpload,
    verifyCsrf,
    async (req, res) => {
      const { values, error } = readEventForm(req);
      if (error) {
        return res.status(400).render('admin/new-event', { title: 'Publier un événement', error, values, event: null });
      }

      const event = await repo.createEvent({ ...values, photoData: req.file?.buffer, photoType: req.file?.mimetype });
      const users = await repo.listUsers();
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

  router.get('/evenements/:id/modifier', loadEvent, (req, res) => {
    res.render('admin/new-event', { title: 'Modifier l’événement', error: null, values: req.event, event: req.event });
  });

  // Modification : les inscrits ne sont pas prévenus à nouveau et leurs QR codes restent valables.
  router.post('/evenements/:id/modifier', photoUpload, verifyCsrf, loadEvent, async (req, res) => {
    const { values, error } = readEventForm(req);
    if (error) {
      return res.status(400).render('admin/new-event', { title: 'Modifier l’événement', error, values, event: req.event });
    }
    await repo.updateEvent(req.event.id, {
      ...values,
      photoData: req.file?.buffer,
      photoType: req.file?.mimetype,
      removePhoto: !req.file && req.body.supprimer_photo === '1',
    });
    req.session.flash = { type: 'success', message: 'Événement modifié.' };
    res.redirect(`/admin/tableau-de-bord?evenement=${req.event.id}`);
  });

  // Tableau de bord d'un événement, choisi dans la liste déroulante (historique).
  router.get('/tableau-de-bord', async (req, res) => {
    const events = await repo.listAllEvents();
    const selected = events.find((e) => e.id === Number(req.query.evenement)) || events[0] || null;
    res.render('admin/dashboard', {
      title: 'Tableau de bord',
      events,
      event: selected,
      inscrits: await repo.listUsers(),
      confirmes: selected ? await repo.listConfirmed(selected.id) : [],
      presents: selected ? await repo.listPresent(selected.id) : [],
    });
  });

  router.get('/evenements/:id/export.xlsx', loadEvent, async (req, res) => {
    const buffer = await buildEventWorkbook({
      event: req.event,
      inscrits: await repo.listUsers(),
      confirmes: await repo.listConfirmed(req.event.id),
      presents: await repo.listPresent(req.event.id),
      format,
    });
    const slug = req.event.titre.normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'evenement';
    res
      .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .set('Content-Disposition', `attachment; filename="snedai-${req.event.id}-${slug}.xlsx"`)
      .send(Buffer.from(buffer));
  });

  router.post('/evenements/:id/terminer', loadEvent, async (req, res) => {
    await repo.finishEvent(req.event.id);
    req.session.flash = { type: 'success', message: `« ${req.event.titre} » est marqué comme terminé.` };
    res.redirect(`/admin/tableau-de-bord?evenement=${req.event.id}`);
  });

  router.get('/agents', async (req, res) => {
    res.render('admin/agents', { title: 'Comptes', users: await repo.listUsers() });
  });

  router.post('/test-email', async (req, res) => {
    const result = await mailer.sendTest(req.user.email);
    req.session.flash = result.ok
      ? { type: 'success', message: `E-mail de test envoyé à ${req.user.email} depuis ${mailer.sender}. Regardez aussi dans les « Spams ».` }
      : { type: 'error', message: `L’e-mail n’est pas parti. Erreur : ${result.error}` };
    res.redirect('/admin/agents');
  });

  // Suppression d'un compte (utile après des tests). Le compte administrateur ne peut pas être supprimé.
  router.post('/comptes/:id/supprimer', async (req, res) => {
    const user = await repo.findUserById(Number(req.params.id) || 0);
    if (!user) return res.redirect('/admin/agents');
    if (access.isAdmin(user)) {
      req.session.flash = { type: 'error', message: 'Le compte administrateur ne peut pas être supprimé.' };
      return res.redirect('/admin/agents');
    }
    await repo.deleteUser(user.id);
    req.session.flash = { type: 'success', message: `Le compte de ${user.prenom} ${user.nom} a été supprimé.` };
    res.redirect('/admin/agents');
  });

  router.post('/agents/:id', async (req, res) => {
    const user = await repo.findUserById(Number(req.params.id) || 0);
    if (user) await repo.setAgent(user.id, req.body.agent === '1');
    res.redirect('/admin/agents');
  });

  return router;
};
