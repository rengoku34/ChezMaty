const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function list(value, separator) {
  return (value || '')
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);
}

function loadConfig(env = process.env) {
  const appUrl = (env.APP_URL || `http://localhost:${env.PORT || 3000}`).replace(/\/+$/, '');
  return {
    port: Number(env.PORT) || 3000,
    appUrl,
    production: env.NODE_ENV === 'production',
    sessionSecret: env.SESSION_SECRET || '',
    adminEmails: list(env.ADMIN_EMAILS, ',').map((email) => email.toLowerCase()),
    filiales: list(env.FILIALES, ';'),
    google: {
      clientID: env.GOOGLE_CLIENT_ID || '',
      clientSecret: env.GOOGLE_CLIENT_SECRET || '',
      callbackURL: `${appUrl}/auth/google/callback`,
    },
    smtp: {
      host: env.SMTP_HOST || '',
      port: Number(env.SMTP_PORT) || 587,
      secure: env.SMTP_SECURE === 'true',
      user: env.SMTP_USER || '',
      password: env.SMTP_PASSWORD || '',
      from: env.MAIL_FROM || env.SMTP_USER || '',
    },
    databasePath: path.resolve(ROOT, env.DATABASE_PATH || 'data/snedai.db'),
    uploadDir: path.resolve(ROOT, env.UPLOAD_DIR || 'uploads'),
    timezone: env.TIMEZONE || 'Africa/Abidjan',
  };
}

module.exports = { loadConfig, ROOT };
