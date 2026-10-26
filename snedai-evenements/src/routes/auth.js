const crypto = require('node:crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const { rateLimit } = require('express-rate-limit');

const clean = (value, max = 100) => String(value ?? '').trim().slice(0, max);

module.exports = function authRoutes({ repo, config, passport, googleEnabled, mailer, logger }) {
  const router = express.Router();
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.loginRateLimit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: 'Trop de tentatives. Réessayez dans quelques minutes.',
  });

  function renderForm(res, { onglet = 'connexion', status = 200, error = null, values = {} } = {}) {
    res.status(status).render('auth', {
      title: onglet === 'inscription' ? 'Créer mon compte' : 'Se connecter',
      onglet,
      error,
      values,
      filiales: config.filiales,
      googleEnabled,
      emailSignupEnabled: mailer.configured,
    });
  }

  function finishLogin(req, res, next, user) {
    const returnTo = req.session.returnTo;
    req.login(user, (err) => {
      if (err) return next(err);
      res.redirect(returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/');
    });
  }

  router.get('/connexion', (req, res) => {
    if (req.user) return res.redirect('/');
    renderForm(res, { onglet: req.query.onglet === 'inscription' ? 'inscription' : 'connexion' });
  });

  // Pages publiques demandées par Google pour publier l'écran de connexion.
  const adminContact = config.mailFrom.email;
  router.get('/confidentialite', (req, res) =>
    res.render('legal/confidentialite', { title: 'Politique de confidentialité', adminContact })
  );
  router.get('/conditions', (req, res) => res.render('legal/conditions', { title: 'Conditions d’utilisation', adminContact }));

  // Reconnexion rapide avec l'adresse e-mail et le mot de passe choisis à l'inscription.
  router.post('/connexion', loginLimiter, async (req, res, next) => {
    const email = clean(req.body.email, 200).toLowerCase();
    const password = String(req.body.password ?? '');
    const user = email ? await repo.findUserByEmail(email) : null;
    const valid = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!valid) {
      return renderForm(res, { status: 401, error: 'Adresse e-mail ou mot de passe incorrect.' });
    }
    finishLogin(req, res, next, user);
  });

  // Inscription : nom, prénom, filiale, e-mail et mot de passe du site. L'adresse e-mail est ensuite confirmée
  // soit par un code à 6 chiffres envoyé par e-mail, soit par Google (au choix de la personne).
  router.post('/inscription', loginLimiter, async (req, res) => {
    const values = {
      nom: clean(req.body.nom),
      prenom: clean(req.body.prenom),
      filiale: clean(req.body.filiale),
      email: clean(req.body.email, 200).toLowerCase(),
    };
    const methode = req.body.methode === 'google' ? 'google' : 'email';
    const password = String(req.body.password ?? '');
    const confirmation = String(req.body.password_confirmation ?? '');
    let error = null;
    if (!values.nom || !values.prenom || !values.filiale) error = 'Merci de remplir le nom, le prénom et la filiale.';
    else if (config.filiales.length && !config.filiales.includes(values.filiale)) error = 'Choisissez une filiale dans la liste.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) error = 'Adresse e-mail invalide.';
    else if (await repo.findUserByEmail(values.email)) error = 'Un compte existe déjà avec cette adresse. Connectez-vous.';
    else if (password.length < 8 || !/[A-Za-zÀ-ÿ]/.test(password) || !/\d/.test(password)) {
      error = 'Le mot de passe doit contenir au moins 8 caractères, dont au moins une lettre et un chiffre.';
    } else if (password !== confirmation) error = 'Les deux mots de passe ne sont pas identiques.';
    else if (methode === 'google' && !googleEnabled) error = 'La connexion Google n’est pas encore configurée sur le serveur.';
    else if (methode === 'email' && !mailer.configured) {
      error = 'La confirmation par e-mail n’est pas encore disponible. Utilisez « Continuer avec Google ».';
    }
    if (error) return renderForm(res, { onglet: 'inscription', status: 400, error, values });

    const passwordHash = await bcrypt.hash(password, 12);
    if (methode === 'google') {
      req.session.pendingSignup = { ...values, passwordHash };
      return res.redirect('/auth/google');
    }
    req.session.emailSignup = { ...values, passwordHash };
    try {
      await sendCode(req.session.emailSignup);
    } catch (err) {
      logger.error(`Code non envoyé à ${values.email} : ${err.message}`);
      delete req.session.emailSignup;
      const fallback = googleEnabled ? ' Vous pouvez aussi continuer avec Google.' : '';
      return renderForm(res, {
        onglet: 'inscription',
        status: 502,
        error: `Le code n’a pas pu être envoyé : le service d’e-mail est momentanément indisponible. Réessayez dans quelques minutes ou prévenez l’administrateur.${fallback}`,
        values,
      });
    }
    res.redirect('/inscription/code');
  });

  // Code de confirmation : 6 chiffres, valable 15 minutes, 5 essais au maximum ; seul son empreinte est gardée.
  const CODE_TTL_MS = 15 * 60 * 1000;
  const RESEND_DELAY_MS = 60 * 1000;
  const MAX_ATTEMPTS = 5;
  const hashCode = (code) => crypto.createHash('sha256').update(`${config.sessionSecret}:${code}`).digest('hex');

  async function sendCode(pending) {
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    Object.assign(pending, { codeHash: hashCode(code), expires: Date.now() + CODE_TTL_MS, sentAt: Date.now(), attempts: 0 });
    await mailer.sendVerificationCode(pending.email, pending.prenom, code);
  }

  function renderCode(res, pending, { status = 200, error = null, info = null } = {}) {
    res.status(status).render('verify-code', { title: 'Confirmer mon adresse e-mail', email: pending.email, error, info });
  }

  router.get('/inscription/code', (req, res) => {
    const pending = req.session.emailSignup;
    if (!pending) return res.redirect('/connexion?onglet=inscription');
    renderCode(res, pending);
  });

  router.post('/inscription/code', loginLimiter, async (req, res, next) => {
    const pending = req.session.emailSignup;
    if (!pending) return res.redirect('/connexion?onglet=inscription');
    if (Date.now() > pending.expires) return renderCode(res, pending, { status: 400, error: 'Ce code a expiré. Demandez-en un nouveau.' });
    if (pending.attempts >= MAX_ATTEMPTS) return renderCode(res, pending, { status: 429, error: 'Trop d’essais. Demandez un nouveau code.' });

    const code = String(req.body.code ?? '').replace(/\D/g, '');
    const valid = code.length === 6 && crypto.timingSafeEqual(Buffer.from(hashCode(code)), Buffer.from(pending.codeHash));
    if (!valid) {
      pending.attempts += 1;
      const left = MAX_ATTEMPTS - pending.attempts;
      return renderCode(res, pending, { status: 400, error: left > 0 ? `Code incorrect. Il vous reste ${left} essai(s).` : 'Trop d’essais. Demandez un nouveau code.' });
    }
    if (await repo.findUserByEmail(pending.email)) {
      delete req.session.emailSignup;
      return renderForm(res, { status: 400, error: 'Un compte existe déjà avec cette adresse. Connectez-vous.' });
    }
    const { nom, prenom, filiale, email, passwordHash } = pending;
    const user = await repo.createUser({ nom, prenom, filiale, email, passwordHash });
    delete req.session.emailSignup;
    req.session.flash = { type: 'success', message: `Bienvenue ${user.prenom}, votre adresse est confirmée et votre compte est créé !` };
    mailer.sendWelcome(user).catch((error) => logger.error(`Bienvenue non envoyé à ${user.email} : ${error.message}`));
    finishLogin(req, res, next, user);
  });

  router.post('/inscription/code/renvoyer', loginLimiter, async (req, res) => {
    const pending = req.session.emailSignup;
    if (!pending) return res.redirect('/connexion?onglet=inscription');
    const wait = Math.ceil((pending.sentAt + RESEND_DELAY_MS - Date.now()) / 1000);
    if (wait > 0) return renderCode(res, pending, { status: 429, error: `Patientez encore ${wait} s avant de demander un nouveau code.` });
    try {
      await sendCode(pending);
    } catch (err) {
      logger.error(`Code non renvoyé à ${pending.email} : ${err.message}`);
      return renderCode(res, pending, { status: 502, error: 'Le code n’a pas pu être envoyé. Réessayez plus tard.' });
    }
    renderCode(res, pending, { info: 'Un nouveau code vient de vous être envoyé.' });
  });

  router.get('/auth/google', (req, res, next) => {
    if (!googleEnabled) return renderForm(res, { status: 503, error: 'La connexion Google n’est pas encore configurée.' });
    // Pendant une inscription, Google propose directement le compte de l'adresse saisie.
    const loginHint = req.session.pendingSignup?.email;
    passport.authenticate('google', { scope: ['profile', 'email'], prompt: 'select_account', ...(loginHint && { loginHint }) })(req, res, next);
  });

  router.get('/auth/google/callback', (req, res, next) => {
    if (!googleEnabled) return res.redirect('/connexion');
    passport.authenticate('google', (err, user, info) => {
      if (err) return next(err);
      if (!user) {
        const onglet = info?.signup || info?.error?.includes('Créez') ? 'inscription' : 'connexion';
        return renderForm(res, { onglet, status: 400, error: info?.error || 'Connexion Google annulée.' });
      }
      if (info?.created) {
        req.session.flash = { type: 'success', message: `Bienvenue ${user.prenom}, votre compte est créé ! Un e-mail de bienvenue vous a été envoyé.` };
        // Envoi en arrière-plan : la connexion n'attend pas l'e-mail.
        mailer.sendWelcome(user).catch((error) => logger.error(`Bienvenue non envoyé à ${user.email} : ${error.message}`));
      }
      finishLogin(req, res, next, user);
    })(req, res, next);
  });

  router.post('/deconnexion', (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      req.session.destroy(() => {
        res.clearCookie('snedai.sid');
        // Vide le cache du navigateur : le bouton « Retour » ne réaffiche plus les pages privées.
        res.set('Clear-Site-Data', '"cache"');
        res.redirect('/connexion');
      });
    });
  });

  return router;
};
