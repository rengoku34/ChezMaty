const express = require('express');
const { qrDataUrl, qrPng } = require('../qr');
const { calendarLinks, buildIcs } = require('../calendar');
const { confirmAttendance } = require('../services/attendance');
const { nextEvent } = require('../services/events');

module.exports = function eventRoutes({ repo, config, mailer, format, access, logger }) {
  const calendarOptions = { timeZone: config.timezone, appUrl: config.appUrl };
  const router = express.Router();
  router.use(access.requireAuth);

  async function loadEvent(req, res, next) {
    const id = Number(req.params.id);
    const event = Number.isInteger(id) && id > 0 ? await repo.findEvent(id) : null;
    if (!event) return res.status(404).render('error', { title: 'Introuvable', message: 'Cet événement n’existe pas.' });
    req.event = event;
    next();
  }

  // « La maison » : les événements en cours, et les événements terminés mis de côté.
  router.get('/', async (req, res) => {
    const actifs = await repo.listActiveEvents();
    res.render('home', {
      title: 'Accueil',
      actifs,
      prochain: nextEvent(actifs, config.timezone),
      termines: await repo.listFinishedEvents(),
      participations: await repo.participationsForUser(req.user.id),
    });
  });

  // Les photos sont dans la base et visibles seulement une fois connecté (« dans la maison »).
  router.get('/evenements/:id/photo', async (req, res) => {
    const photo = await repo.findEventPhoto(Number(req.params.id) || 0);
    if (!photo) return res.status(404).end();
    res.type(photo.photo_type).set('Cache-Control', 'private, max-age=604800').send(photo.photo_data);
  });

  router.get('/evenements/:id', loadEvent, async (req, res) => {
    const participation = await repo.findParticipation(req.event.id, req.user.id);
    res.render('event', {
      title: req.event.titre,
      event: req.event,
      participation,
      agenda: req.event.termine_at ? null : calendarLinks(req.event, calendarOptions),
      qr: participation && !participation.scanne_at && !req.event.termine_at ? await qrDataUrl(participation.qr_token) : null,
    });
  });

  router.post('/evenements/:id/participer', loadEvent, async (req, res) => {
    const { event, user } = req;
    if (event.termine_at) {
      req.session.flash = { type: 'error', message: 'Cet événement est terminé.' };
      return res.redirect(`/evenements/${event.id}`);
    }
    const { emailed } = await confirmAttendance({ repo, mailer, format, logger }, event, user);
    let message = 'Votre présence est notée. Voici votre QR code à présenter à l’entrée.';
    if (emailed) message += ' Il vous a aussi été envoyé par e-mail.';
    req.session.flash = { type: 'success', message };
    res.redirect(`/evenements/${event.id}`);
  });

  router.post('/evenements/:id/annuler', loadEvent, async (req, res) => {
    if (!req.event.termine_at) await repo.cancelParticipation(req.event.id, req.user.id);
    req.session.flash = { type: 'info', message: 'Votre participation a été annulée.' };
    res.redirect(`/evenements/${req.event.id}`);
  });

  router.get('/evenements/:id/agenda.ics', loadEvent, (req, res) => {
    const ics = buildIcs(req.event, calendarOptions);
    if (!ics) return res.status(404).end();
    res
      .type('text/calendar; charset=utf-8')
      .set('Content-Disposition', `attachment; filename="evenement-${req.event.id}.ics"`)
      .send(ics);
  });

  router.get('/evenements/:id/qr.png', loadEvent, async (req, res) => {
    const participation = await repo.findParticipation(req.event.id, req.user.id);
    if (!participation) return res.status(404).end();
    res
      .type('png')
      .set('Content-Disposition', `attachment; filename="qrcode-evenement-${req.event.id}.png"`)
      .send(await qrPng(participation.qr_token));
  });

  return router;
};
