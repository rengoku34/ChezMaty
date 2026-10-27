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
async function handleGoogleProfile(repo, pendingSignup, profile) {
  const emailEntry = profile.emails?.[0];
  const email = emailEntry?.value?.toLowerCase();
  const verified = emailEntry?.verified ?? profile._json?.email_verified;
  if (!email || verified === false) {
    return { error: 'Google n’a pas fourni d’adresse e-mail vérifiée.' };
  }

  if (pendingSignup) {
    // Google confirme que l'adresse saisie dans le formulaire appartient bien à la personne.
    if (pendingSignup.email && pendingSignup.email !== email) {
      return {
        error: `Le compte Google choisi (${email}) ne correspond pas à l’adresse saisie (${pendingSignup.email}). Recommencez en choisissant le bon compte Google.`,
        signup: true,
      };
    }
    if ((await repo.findUserByEmail(email)) || (await repo.findUserByGoogleId(profile.id))) {
      return { error: 'Un compte existe déjà avec cette adresse Google. Connectez-vous.' };
    }
    const user = await repo.createUser({ ...pendingSignup, email, googleId: profile.id });
    return { user, created: true };
  }

  let user = await repo.findUserByGoogleId(profile.id);
  if (!user) {
    user = await repo.findUserByEmail(email);
    if (user && !user.google_id) await repo.linkGoogleId(user.id, profile.id);
  }
  if (!user) return { error: 'Aucun compte n’existe pour cette adresse. Créez d’abord votre compte.' };
  return { user };
}

function configurePassport(config, repo) {
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser((id, done) => {
    repo.findUserById(id).then((user) => done(null, user || false), done);
  });

  const googleEnabled = Boolean(config.google.clientID && config.google.clientSecret);
  if (googleEnabled) {
    passport.use(
      new GoogleStrategy(
        { ...config.google, passReqToCallback: true },
        (req, _accessToken, _refreshToken, profile, done) => {
          const pending = req.session.pendingSignup;
          delete req.session.pendingSignup;
          handleGoogleProfile(repo, pending, profile).then((result) => done(null, result.user || false, result), done);
        }
      )
    );
  }
  return { passport, googleEnabled };
}

module.exports = { createAccess, configurePassport, handleGoogleProfile };
