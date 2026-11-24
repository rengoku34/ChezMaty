const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function list(value, separator) {
  return (value || '')
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);
}

// « Nom <adresse> » ou simplement « adresse ».
function parseSender(value) {
  const match = value.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  return { name: 'Événements SNEDAI', email: value.trim() };
}

function loadConfig(env = process.env) {
  // Sur Render, RENDER_EXTERNAL_URL donne l'adresse publique du site sans réglage supplémentaire.
  const appUrl = (env.APP_URL || env.RENDER_EXTERNAL_URL || `http://localhost:${env.PORT || 3000}`).replace(/\/+$/, '');
  return {
    port: Number(env.PORT) || 3000,
    appUrl,
    // Render définit RENDER=true : le mode production s'active sans réglage.
    production: env.NODE_ENV === 'production' || env.RENDER === 'true',
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
    },
    // Espaces ou guillemets collés par erreur autour de la clé : retirés.
    // AgentMail (agentmail.to) : clé API et adresse de la boîte d'envoi (ex. snedai-evenements@agentmail.to).
    agentmail: {
      apiKey: (env.AGENTMAIL_API_KEY || '').trim().replace(/^["']|["']$/g, ''),
      inbox: (env.AGENTMAIL_INBOX || '').trim().toLowerCase(),
    },
    brevoApiKey: (env.BREVO_API_KEY || '').trim().replace(/^["']|["']$/g, ''),
    // Par défaut, les e-mails partent de la première adresse administrateur.
    mailFrom: parseSender(env.MAIL_FROM || env.SMTP_USER || list(env.ADMIN_EMAILS, ',')[0] || ''),
    databaseUrl: env.DATABASE_URL || '',
    timezone: env.TIMEZONE || 'Africa/Abidjan',
    // Application Android (TWA générée par PWABuilder) : identifiant du paquet et empreinte(s) SHA-256 du certificat,
    // publiés dans /.well-known/assetlinks.json pour que l'application s'ouvre en plein écran, sans barre d'adresse.
    android: {
      packageName: (env.ANDROID_PACKAGE_NAME || '').trim(),
      sha256: list(env.ANDROID_CERT_SHA256, ',').map((value) => value.toUpperCase()),
    },
    // Tentatives de connexion / d'inscription autorisées par adresse IP et par période de 15 minutes.
    loginRateLimit: Number(env.LOGIN_RATE_LIMIT) || 20,
  };
}

module.exports = { loadConfig, ROOT };
