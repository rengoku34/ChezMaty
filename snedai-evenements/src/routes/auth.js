const express = require('express');
const bcrypt = require('bcryptjs');
const { rateLimit } = require('express-rate-limit');

const clean = (value, max = 100) => String(value ?? '').trim().slice(0, max);

module.exports = function authRoutes({ repo, config, passport, googleEnabled }) {
  const router = express.Router();
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
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

  // Reconnexion rapide avec l'adresse e-mail et le mot de passe choisis à l'inscription.
  router.post('/connexion', loginLimiter, async (req, res, next) => {
    const email = clean(req.body.email, 200).toLowerCase();
    const password = String(req.body.password ?? '');
    const user = email ? repo.findUserByEmail(email) : null;
    const valid = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!valid) {
      return renderForm(res, { status: 401, error: 'Adresse e-mail ou mot de passe incorrect.', values: { email } });
    }
    finishLogin(req, res, next, user);
  });

  // Inscription : on garde nom, prénom, filiale et mot de passe, puis Google confirme l'adresse e-mail.
  router.post('/inscription', loginLimiter, async (req, res) => {
    const values = {
      nom: clean(req.body.nom),
      prenom: clean(req.body.prenom),
      filiale: clean(req.body.filiale),
    };
    const password = String(req.body.password ?? '');
    const confirmation = String(req.body.password_confirmation ?? '');
    let error = null;
    if (!values.nom || !values.prenom || !values.filiale) error = 'Merci de remplir le nom, le prénom et la filiale.';
    else if (config.filiales.length && !config.filiales.includes(values.filiale)) error = 'Choisissez une filiale dans la liste.';
    else if (password.length < 8) error = 'Le mot de passe doit contenir au moins 8 caractères.';
    else if (password !== confirmation) error = 'Les deux mots de passe ne sont pas identiques.';
    else if (!googleEnabled) error = 'La connexion Google n’est pas encore configurée sur le serveur.';
    if (error) return renderForm(res, { onglet: 'inscription', status: 400, error, values });

    req.session.pendingSignup = { ...values, passwordHash: await bcrypt.hash(password, 12) };
    res.redirect('/auth/google');
  });

  router.get('/auth/google', (req, res, next) => {
    if (!googleEnabled) return renderForm(res, { status: 503, error: 'La connexion Google n’est pas encore configurée.' });
    passport.authenticate('google', { scope: ['profile', 'email'], prompt: 'select_account' })(req, res, next);
  });

  router.get('/auth/google/callback', (req, res, next) => {
    if (!googleEnabled) return res.redirect('/connexion');
    passport.authenticate('google', (err, user, info) => {
      if (err) return next(err);
      if (!user) {
        const onglet = info?.error?.includes('Créez') ? 'inscription' : 'connexion';
        return renderForm(res, { onglet, status: 400, error: info?.error || 'Connexion Google annulée.' });
      }
      if (info?.created) req.session.flash = { type: 'success', message: `Bienvenue ${user.prenom}, votre compte est créé !` };
      finishLogin(req, res, next, user);
    })(req, res, next);
  });

  router.post('/deconnexion', (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      req.session.destroy(() => {
        res.clearCookie('snedai.sid');
        res.redirect('/connexion');
      });
    });
  });

  return router;
};
