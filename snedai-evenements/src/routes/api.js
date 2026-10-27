const crypto = require('node:crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const { rateLimit } = require('express-rate-limit');
const { signupError } = require('../validation');
const { CODE_TTL_MS, RESEND_DELAY_MS, MAX_ATTEMPTS, generateCode, hashCode, codeMatches } = require('../verification');
const { confirmAttendance, scanCode } = require('../services/attendance');
const { nextEvent } = require('../services/events');
const { calendarLinks, eventTimes } = require('../calendar');
const { qrContent } = require('../qr');

const TOKEN_TTL_DAYS = 90;
const clean = (value, max = 100) => String(value ?? '').trim().slice(0, max);
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
// Comparaison factice : le temps de réponse ne révèle pas si l'adresse existe.
const DUMMY_HASH = bcrypt.hashSync('mot-de-passe-factice-1', 10);

// Interface JSON de l'application mobile (/api/v1). Elle n'utilise ni cookie ni session : chaque requête porte
// un jeton « Authorization: Bearer … ». Sans cookie, il n'y a pas de risque CSRF, d'où l'absence de jeton CSRF ici.
module.exports = function apiRoutes({ repo, config, mailer, format, access, logger }) {
  const router = express.Router();
  const calendarOptions = { timeZone: config.timezone, appUrl: config.appUrl };

  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.loginRateLimit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { ok: false, message: 'Trop de tentatives. Réessayez dans quelques minutes.' },
  });

  const fail = (res, status, message, extra = {}) => res.status(status).json({ ok: false, message, ...extra });
  const unauthorized = (res) => fail(res, 401, 'Session expirée, reconnectez-vous.', { code: 'unauthorized' });

  const roleOf = (user) => (access.isAdmin(user) ? 'admin' : access.isAgent(user) ? 'agent' : 'employe');
  const publicUser = (user) => ({ id: user.id, nom: user.nom, prenom: user.prenom, email: user.email, filiale: user.filiale, role: roleOf(user) });

  async function issueToken(user, device) {
    const token = crypto.randomBytes(32).toString('base64url');
    await repo.createApiToken(user.id, sha256(token), clean(device, 80), TOKEN_TTL_DAYS);
    return token;
  }

  async function requireToken(req, res, next) {
    const match = /^Bearer ([A-Za-z0-9_-]{32,64})$/.exec(req.get('authorization') || '');
    if (!match) return unauthorized(res);
    const hash = sha256(match[1]);
    const row = await repo.findApiToken(hash);
    if (!row) return unauthorized(res);
    // La validité du jeton est prolongée à chaque usage, au plus une fois par heure.
    if (Date.now() - new Date(row.token_last_used_at).getTime() > 60 * 60 * 1000) {
      repo.touchApiToken(row.token_id, TOKEN_TTL_DAYS).catch(() => {});
    }
    req.user = row;
    req.tokenHash = hash;
    next();
  }

  const requireAgent = (req, res, next) => (access.isAgent(req.user) ? next() : fail(res, 403, 'Réservé aux agents de scan.'));

  async function loadEvent(req, res, next) {
    const id = Number(req.params.id);
    const event = Number.isInteger(id) && id > 0 ? await repo.findEvent(id) : null;
    if (!event) return fail(res, 404, 'Cet événement n’existe pas.');
    req.event = event;
    next();
  }

  // Les textes (dates, horaires…) sont mis en forme par le serveur : l'application les affiche tels quels.
  function serializeEvent(event, participation) {
    const times = eventTimes(event, config.timezone);
    const now = Date.now();
    const day = format.eventDay(event.debut);
    return {
      id: event.id,
      titre: event.titre,
      description: event.description,
      lieu: event.lieu || '',
      termine: Boolean(event.termine_at),
      photo: event.has_photo ? `/api/v1/events/${event.id}/photo` : null,
      quand: format.eventRange(event.debut, event.fin),
      date: format.eventDate(event.debut).replace(/ à .*/, ''),
      heures: event.debut ? format.eventHours(event.debut, event.fin) : '',
      jour: day?.jour ?? null,
      mois: day?.mois ?? null,
      debut: times ? times.start.toISOString() : null,
      fin: times ? times.end.toISOString() : null,
      enCours: times ? times.start.getTime() <= now && times.end.getTime() > now : false,
      participation: participation
        ? { confirme: true, present: Boolean(participation.scanne_at), scanneLe: participation.scanne_at ? format.timestamp(participation.scanne_at) : null }
        : null,
    };
  }

  function eventDetail(event, participation) {
    return {
      ok: true,
      event: serializeEvent(event, participation),
      // QR code à afficher : seulement tant que la présence n'est pas validée et que l'événement est en cours.
      billet: participation && !participation.scanne_at && !event.termine_at ? { qr: qrContent(participation.qr_token) } : null,
      agenda: event.termine_at ? null : (({ google, outlook }) => ({ google, outlook }))(calendarLinks(event, calendarOptions) || {}),
    };
  }

  // ---------- Public
  router.get('/config', (req, res) => {
    res.json({ ok: true, filiales: config.filiales, inscriptionParEmail: mailer.configured });
  });

  // ---------- Connexion
  router.post('/auth/login', limiter, async (req, res) => {
    const email = clean(req.body?.email, 200).toLowerCase();
    const password = String(req.body?.password ?? '');
    const user = email ? await repo.findUserByEmail(email) : null;
    const valid = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !valid) return fail(res, 401, 'Adresse e-mail ou mot de passe incorrect.');
    repo.purgeExpiredApiTokens().catch(() => {});
    res.json({ ok: true, token: await issueToken(user, req.body?.appareil), user: publicUser(user) });
  });

  router.post('/auth/logout', requireToken, async (req, res) => {
    await repo.deleteApiToken(req.tokenHash);
    res.json({ ok: true });
  });

  router.get('/me', requireToken, (req, res) => res.json({ ok: true, user: publicUser(req.user) }));

  // ---------- Inscription : étape 1, envoi du code par e-mail
  router.post('/auth/signup', limiter, async (req, res) => {
    const values = {
      nom: clean(req.body?.nom),
      prenom: clean(req.body?.prenom),
      filiale: clean(req.body?.filiale),
      email: clean(req.body?.email, 200).toLowerCase(),
    };
    const password = String(req.body?.password ?? '');
    const error = signupError(values, password, String(req.body?.confirmation ?? ''), config.filiales);
    if (error) return fail(res, 400, error);
    if (await repo.findUserByEmail(values.email)) return fail(res, 409, 'Un compte existe déjà avec cette adresse. Connectez-vous.');
    if (!mailer.configured) return fail(res, 503, 'La confirmation par e-mail n’est pas disponible pour le moment.');

    const id = crypto.randomBytes(18).toString('base64url');
    const code = generateCode();
    await repo.savePendingSignup({
      id,
      ...values,
      passwordHash: await bcrypt.hash(password, 12),
      codeHash: hashCode(config.sessionSecret, code),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    });
    try {
      await mailer.sendVerificationCode(values.email, values.prenom, code);
    } catch (err) {
      logger.error(`Code non envoyé à ${values.email} : ${err.message}`);
      await repo.deletePendingSignup(id);
      return fail(res, 502, 'Le code n’a pas pu être envoyé : le service d’e-mail est momentanément indisponible. Réessayez dans quelques minutes.');
    }
    res.status(201).json({ ok: true, signupId: id, email: values.email, expiresInMinutes: CODE_TTL_MS / 60000, resendInSeconds: RESEND_DELAY_MS / 1000 });
  });

  // ---------- Inscription : étape 2, saisie du code
  router.post('/auth/signup/verify', limiter, async (req, res) => {
    const pending = await repo.findPendingSignup(clean(req.body?.signupId, 64));
    if (!pending) return fail(res, 404, 'Inscription introuvable ou expirée. Recommencez.', { code: 'signup_expired' });
    if (new Date(pending.expires_at).getTime() < Date.now()) return fail(res, 400, 'Ce code a expiré. Demandez-en un nouveau.', { code: 'code_expired' });
    if (pending.attempts >= MAX_ATTEMPTS) return fail(res, 429, 'Trop d’essais. Demandez un nouveau code.', { code: 'too_many_attempts' });
    if (!codeMatches(config.sessionSecret, req.body?.code, pending.code_hash)) {
      const attempts = await repo.bumpPendingAttempts(pending.id);
      const left = MAX_ATTEMPTS - attempts;
      return fail(res, 400, left > 0 ? `Code incorrect. Il vous reste ${left} essai(s).` : 'Trop d’essais. Demandez un nouveau code.', { restants: Math.max(left, 0) });
    }
    if (await repo.findUserByEmail(pending.email)) {
      await repo.deletePendingSignup(pending.id);
      return fail(res, 409, 'Un compte existe déjà avec cette adresse. Connectez-vous.');
    }
    const user = await repo.createUser({ nom: pending.nom, prenom: pending.prenom, filiale: pending.filiale, email: pending.email, passwordHash: pending.password_hash });
    await repo.deletePendingSignup(pending.id);
    mailer.sendWelcome(user).catch((err) => logger.error(`Bienvenue non envoyé à ${user.email} : ${err.message}`));
    res.status(201).json({ ok: true, token: await issueToken(user, req.body?.appareil), user: publicUser(user) });
  });

  router.post('/auth/signup/resend', limiter, async (req, res) => {
    const pending = await repo.findPendingSignup(clean(req.body?.signupId, 64));
    if (!pending) return fail(res, 404, 'Inscription introuvable ou expirée. Recommencez.', { code: 'signup_expired' });
    const wait = Math.ceil((new Date(pending.sent_at).getTime() + RESEND_DELAY_MS - Date.now()) / 1000);
    if (wait > 0) return fail(res, 429, `Patientez encore ${wait} s avant de demander un nouveau code.`, { retryInSeconds: wait });
    const code = generateCode();
    await repo.renewPendingCode(pending.id, hashCode(config.sessionSecret, code), new Date(Date.now() + CODE_TTL_MS));
    try {
      await mailer.sendVerificationCode(pending.email, pending.prenom, code);
    } catch (err) {
      logger.error(`Code non renvoyé à ${pending.email} : ${err.message}`);
      return fail(res, 502, 'Le code n’a pas pu être envoyé. Réessayez plus tard.');
    }
    res.json({ ok: true, resendInSeconds: RESEND_DELAY_MS / 1000 });
  });

  // ---------- Événements
  router.get('/events', requireToken, async (req, res) => {
    const [actifs, termines, mine] = await Promise.all([repo.listActiveEvents(), repo.listFinishedEvents(), repo.participationsForUser(req.user.id)]);
    res.json({
      ok: true,
      actifs: actifs.map((event) => serializeEvent(event, mine.get(event.id))),
      termines: termines.map((event) => serializeEvent(event, mine.get(event.id))),
      prochainId: nextEvent(actifs, config.timezone)?.event.id ?? null,
    });
  });

  router.get('/events/:id/photo', requireToken, async (req, res) => {
    const photo = await repo.findEventPhoto(Number(req.params.id) || 0);
    if (!photo) return res.status(404).end();
    res.type(photo.photo_type).set('Cache-Control', 'private, max-age=86400').send(photo.photo_data);
  });

  router.get('/events/:id', requireToken, loadEvent, async (req, res) => {
    res.json(eventDetail(req.event, await repo.findParticipation(req.event.id, req.user.id)));
  });

  router.post('/events/:id/participer', requireToken, loadEvent, async (req, res) => {
    if (req.event.termine_at) return fail(res, 409, 'Cet événement est terminé.');
    const { participation, emailed } = await confirmAttendance({ repo, mailer, format, logger }, req.event, req.user);
    res.json({ ...eventDetail(req.event, participation), emailed });
  });

  router.post('/events/:id/annuler', requireToken, loadEvent, async (req, res) => {
    if (req.event.termine_at) return fail(res, 409, 'Cet événement est terminé.');
    await repo.cancelParticipation(req.event.id, req.user.id);
    res.json(eventDetail(req.event, await repo.findParticipation(req.event.id, req.user.id)));
  });

  // ---------- Scan (agents et administrateur)
  router.post('/scan', requireToken, requireAgent, async (req, res) => {
    const { status, body } = await scanCode({ repo, format }, req.body?.code, req.user.id);
    res.status(status).json(body);
  });

  router.use((req, res) => fail(res, 404, 'Adresse inconnue.'));
  router.use((err, req, res, _next) => {
    logger.error(err);
    fail(res, err.status && err.status < 500 ? err.status : 500, err.status && err.status < 500 ? 'Requête invalide.' : 'Une erreur est survenue. Réessayez dans un instant.');
  });

  return router;
};
