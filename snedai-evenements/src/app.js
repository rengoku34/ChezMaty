const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const { ROOT } = require('./config');
const { configurePassport, createAccess } = require('./auth');
const { csrfToken, verifyCsrfUnlessMultipart } = require('./csrf');
const { createFormatters } = require('./format');
const { PgSessionStore } = require('./session-store');
const authRoutes = require('./routes/auth');
const eventRoutes = require('./routes/events');
const adminRoutes = require('./routes/admin');
const agentRoutes = require('./routes/agent');

// Ajouté aux adresses du CSS et du JavaScript : à chaque mise en ligne, le navigateur charge
// la nouvelle version au lieu de celle gardée en mémoire. Render fournit le commit déployé.
const ASSET_VERSION = (process.env.RENDER_GIT_COMMIT || String(Date.now())).slice(0, 12);

function createApp({ config, repo, mailer, logger = console }) {
  if (!config.sessionSecret) throw new Error('SESSION_SECRET doit être défini.');

  const app = express();
  const format = createFormatters(config.timezone);
  const access = createAccess(config);
  const { passport, googleEnabled } = configurePassport(config, repo);
  const deps = { repo, config, mailer, format, access, logger, passport, googleEnabled };
  // Logo de l'entreprise : il suffit de déposer public/img/logo.(svg|png|jpg|webp).
  const logoFile = ['svg', 'png', 'jpg', 'webp'].map((ext) => `logo.${ext}`)
    .find((name) => fs.existsSync(path.join(ROOT, 'public/img', name)));
  const logoUrl = logoFile ? `/static/img/${logoFile}?v=${ASSET_VERSION}` : null;

  app.set('view engine', 'ejs');
  app.set('views', path.join(ROOT, 'views'));
  if (config.production) app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'img-src': ["'self'", 'data:'],
          // L'inscription redirige le formulaire vers Google.
          'form-action': ["'self'", 'https://accounts.google.com'],
        },
      },
    })
  );
  app.use('/static', express.static(path.join(ROOT, 'public'), { maxAge: '1d' }));
  app.use('/static/vendor', express.static(path.join(ROOT, 'node_modules/html5-qrcode'), { maxAge: '7d' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(express.json({ limit: '10kb' }));
  app.use(
    session({
      name: 'snedai.sid',
      secret: config.sessionSecret,
      store: new PgSessionStore(repo.pool),
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: 'lax', secure: config.production, maxAge: 7 * 24 * 60 * 60 * 1000 },
    })
  );
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(csrfToken);
  app.use((req, res, next) => {
    // Aucune page n'est gardée en mémoire par le navigateur : après une déconnexion,
    // « Retour » ne peut plus afficher les listes ni les informations personnelles.
    res.set('Cache-Control', 'no-store');
    res.locals.user = req.user || null;
    res.locals.isAdmin = access.isAdmin(req.user);
    res.locals.isAgent = access.isAgent(req.user);
    res.locals.format = format;
    res.locals.logoUrl = logoUrl;
    res.locals.assetVersion = ASSET_VERSION;
    res.locals.path = req.path;
    res.locals.flash = req.session.flash || null;
    delete req.session.flash;
    next();
  });
  app.use(verifyCsrfUnlessMultipart);

  app.use(authRoutes(deps));
  app.use('/admin', adminRoutes(deps));
  app.use('/scan', agentRoutes(deps));
  app.use(eventRoutes(deps));

  app.use((req, res) => res.status(404).render('error', { title: 'Page introuvable', message: 'Cette page n’existe pas.' }));
  app.use((err, req, res, _next) => {
    logger.error(err);
    res.status(500).render('error', { title: 'Erreur', message: 'Une erreur est survenue. Réessayez dans un instant.' });
  });

  return app;
}

module.exports = { createApp };
