const crypto = require('node:crypto');

// Jeton anti-CSRF stocké en session et exigé sur chaque requête qui modifie des données.
function csrfToken(req, res, next) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

function isValid(req) {
  const expected = req.session?.csrfToken;
  const received = req.body?._csrf || req.get('x-csrf-token');
  if (!expected || typeof received !== 'string' || received.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

function verifyCsrf(req, res, next) {
  if (isValid(req)) return next();
  res.status(403);
  if (req.accepts(['html', 'json']) === 'json') return res.json({ ok: false, message: 'Session expirée, rechargez la page.' });
  res.render('error', { title: 'Action refusée', message: 'Votre session a expiré. Rechargez la page puis réessayez.' });
}

// Les formulaires avec photo (multipart) sont vérifiés après la lecture du fichier, dans leur route.
function verifyCsrfUnlessMultipart(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.is('multipart/form-data')) return next();
  verifyCsrf(req, res, next);
}

module.exports = { csrfToken, verifyCsrf, verifyCsrfUnlessMultipart };
