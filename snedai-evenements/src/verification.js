const crypto = require('node:crypto');

// Code à 6 chiffres envoyé par e-mail pour confirmer une adresse (site et application).
const CODE_TTL_MS = 15 * 60 * 1000;
const RESEND_DELAY_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

const generateCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

// Seule l'empreinte du code est conservée, jamais le code lui-même.
const hashCode = (secret, code) => crypto.createHash('sha256').update(`${secret}:${code}`).digest('hex');

function codeMatches(secret, code, expectedHash) {
  const digits = String(code ?? '').replace(/\D/g, '');
  if (digits.length !== 6 || typeof expectedHash !== 'string') return false;
  const a = Buffer.from(hashCode(secret, digits));
  const b = Buffer.from(expectedHash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { CODE_TTL_MS, RESEND_DELAY_MS, MAX_ATTEMPTS, generateCode, hashCode, codeMatches };
