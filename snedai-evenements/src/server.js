const fs = require('node:fs');
const path = require('node:path');
const { ROOT, loadConfig } = require('./config');

const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const { openDatabase } = require('./db');
const { createMailer } = require('./mailer');
const { createApp } = require('./app');

const config = loadConfig();
if (!config.adminEmails.length) console.warn('Attention : ADMIN_EMAILS est vide, personne ne peut publier.');
if (!config.google.clientID) console.warn('Attention : GOOGLE_CLIENT_ID est vide, la création de compte Google est désactivée.');

const repo = openDatabase(config.databasePath);
const app = createApp({ config, repo, mailer: createMailer(config) });

app.listen(config.port, () => console.log(`Événements SNEDAI : ${config.appUrl} (port ${config.port})`));
