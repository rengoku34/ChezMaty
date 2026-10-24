const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');

function createAccess(config) {
  const isAdmin = (user) => Boolean(user && config.adminEmails.includes(user.email.toLowerCase()));
  const isAgent = (user) => Boolean(user && (user.is_agent || isAdmin(user)));

  function deny(req, res, status, message) {
    res.status(status);
    if (req.accepts(['html', 'json']) === 'json') return res.json({ ok: false, message });
    res.render('error', { title: 'Accès refusé', message });
  }

  return {
    isAdmin,
    isAgent,
    // Sans compte, on ne « rentre pas dans la maison » : retour au formulaire.
    requireAuth(req, res, next) {
      if (req.user) return next();
      if (req.method === 'GET') req.session.returnTo = req.originalUrl;
      res.redirect('/connexion');
    },
    // Droits réservés au propriétaire du site (adresses définies dans ADMIN_EMAILS).
    requireAdmin(req, res, next) {
      if (!req.user) return res.redirect('/connexion');
      if (isAdmin(req.user)) return next();
      deny(req, res, 403, 'Cette page est réservée à l’administrateur.');
    },
    requireAgent(req, res, next) {
      if (!req.user) return res.redirect('/connexion');
      if (isAgent(req.user)) return next();
      deny(req, res, 403, 'Cette page est réservée aux agents d’accueil.');
    },
  };
}

// Traite le profil renvoyé par Google : création du compte si une inscription est en attente,
// sinon connexion d'un compte existant.
function handleGoogleProfile(repo, pendingSignup, profile) {
  const emailEntry = profile.emails?.[0];
  const email = emailEntry?.value?.toLowerCase();
  const verified = emailEntry?.verified ?? profile._json?.email_verified;
  if (!email || verified === false) {
    return { error: 'Google n’a pas fourni d’adresse e-mail vérifiée.' };
  }

  if (pendingSignup) {
    if (repo.findUserByEmail(email) || repo.findUserByGoogleId(profile.id)) {
      return { error: 'Un compte existe déjà avec cette adresse Google. Connectez-vous.' };
    }
    const user = repo.createUser({ ...pendingSignup, email, googleId: profile.id });
    return { user, created: true };
  }

  let user = repo.findUserByGoogleId(profile.id);
  if (!user) {
    user = repo.findUserByEmail(email);
    if (user && !user.google_id) repo.linkGoogleId(user.id, profile.id);
  }
  if (!user) return { error: 'Aucun compte n’existe pour cette adresse. Créez d’abord votre compte.' };
  return { user };
}

function configurePassport(config, repo) {
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser((id, done) => {
    try {
      done(null, repo.findUserById(id) || false);
    } catch (error) {
      done(error);
    }
  });

  const googleEnabled = Boolean(config.google.clientID && config.google.clientSecret);
  if (googleEnabled) {
    passport.use(
      new GoogleStrategy(
        { ...config.google, passReqToCallback: true },
        (req, _accessToken, _refreshToken, profile, done) => {
          try {
            const pending = req.session.pendingSignup;
            delete req.session.pendingSignup;
            const result = handleGoogleProfile(repo, pending, profile);
            done(null, result.user || false, result);
          } catch (error) {
            done(error);
          }
        }
      )
    );
  }
  return { passport, googleEnabled };
}

module.exports = { createAccess, configurePassport, handleGoogleProfile };
