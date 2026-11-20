const crypto = require('node:crypto');
const { Pool } = require('pg');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  filiale TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  google_id TEXT UNIQUE,
  is_agent BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower ON users (lower(email));

CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  titre TEXT NOT NULL,
  description TEXT NOT NULL,
  photo_data BYTEA,
  photo_type TEXT,
  debut TEXT,
  fin TEXT,
  lieu TEXT,
  termine_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS participations (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  qr_token TEXT NOT NULL UNIQUE,
  confirme_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  scanne_at TIMESTAMPTZ,
  scanne_par INTEGER REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (event_id, user_id)
);

-- Bases créées avant la suppression des comptes : supprimer un agent ne doit pas bloquer
-- sur les scans qu'il a faits (ils restent, sans nom d'agent).
ALTER TABLE participations DROP CONSTRAINT IF EXISTS participations_scanne_par_fkey;
ALTER TABLE participations ADD CONSTRAINT participations_scanne_par_fkey
  FOREIGN KEY (scanne_par) REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Application mobile : jetons de connexion (seule l'empreinte est gardée) et inscriptions en attente du code e-mail.
CREATE TABLE IF NOT EXISTS api_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  device TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS pending_signups (
  id TEXT PRIMARY KEY,
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  filiale TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  expires BIGINT NOT NULL
);
`;

// Colonnes des événements sans le contenu binaire de la photo (servie à part).
const EVENT_COLUMNS = `id, titre, description, debut, fin, lieu, termine_at, created_at, (photo_data IS NOT NULL) AS has_photo`;
const PARTICIPANT_COLUMNS = `u.nom, u.prenom, u.email, u.filiale, p.confirme_at, p.scanne_at`;

function poolOptions(connectionString) {
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString);
  return { connectionString, max: 5, ssl: local ? false : { rejectUnauthorized: true } };
}

async function openDatabase(connectionString) {
  if (!connectionString) throw new Error('DATABASE_URL doit être défini.');
  const pool = new Pool(poolOptions(connectionString));
  await pool.query(SCHEMA);
  return createRepository(pool);
}

function createRepository(pool) {
  const one = async (sql, params) => (await pool.query(sql, params)).rows[0];
  const all = async (sql, params) => (await pool.query(sql, params)).rows;

  return {
    pool,
    close: () => pool.end(),

    // Valeur secrète créée au premier démarrage puis réutilisée (ex. : clé des sessions).
    async getOrCreateSecret(key) {
      await pool.query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [
        key,
        crypto.randomBytes(48).toString('hex'),
      ]);
      return (await one('SELECT value FROM settings WHERE key = $1', [key])).value;
    },

    // Utilisateurs
    findUserById: (id) => one('SELECT * FROM users WHERE id = $1', [id]),
    findUserByEmail: (email) => one('SELECT * FROM users WHERE lower(email) = lower($1)', [email]),
    findUserByGoogleId: (googleId) => one('SELECT * FROM users WHERE google_id = $1', [googleId]),
    createUser: ({ nom, prenom, filiale, email, passwordHash, googleId }) =>
      one(
        `INSERT INTO users (nom, prenom, filiale, email, password_hash, google_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [nom, prenom, filiale, email, passwordHash, googleId || null]
      ),
    linkGoogleId: (userId, googleId) => pool.query('UPDATE users SET google_id = $1 WHERE id = $2', [googleId, userId]),
    listUsers: () =>
      all('SELECT id, nom, prenom, email, filiale, is_agent, created_at FROM users ORDER BY nom, prenom'),
    setAgent: (userId, isAgent) => pool.query('UPDATE users SET is_agent = $1 WHERE id = $2', [isAgent, userId]),
    // Supprime aussi ses réponses aux événements et ses sessions ouvertes (il est déconnecté).
    async deleteUser(userId) {
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
      await pool.query("DELETE FROM sessions WHERE data->'passport'->>'user' = $1", [String(userId)]);
    },

    // Application mobile : jetons de connexion
    createApiToken: (userId, tokenHash, device, ttlDays) =>
      pool.query(
        `INSERT INTO api_tokens (user_id, token_hash, device, expires_at)
         VALUES ($1, $2, $3, now() + make_interval(days => $4))`,
        [userId, tokenHash, device || null, ttlDays]
      ),
    // Renvoie l'utilisateur du jeton (et l'identifiant du jeton) s'il n'est pas expiré.
    findApiToken: (tokenHash) =>
      one(
        `SELECT u.*, t.id AS token_id, t.last_used_at AS token_last_used_at
         FROM api_tokens t JOIN users u ON u.id = t.user_id
         WHERE t.token_hash = $1 AND t.expires_at > now()`,
        [tokenHash]
      ),
    touchApiToken: (tokenId, ttlDays) =>
      pool.query('UPDATE api_tokens SET last_used_at = now(), expires_at = now() + make_interval(days => $2) WHERE id = $1', [tokenId, ttlDays]),
    deleteApiToken: (tokenHash) => pool.query('DELETE FROM api_tokens WHERE token_hash = $1', [tokenHash]),
    purgeExpiredApiTokens: () => pool.query('DELETE FROM api_tokens WHERE expires_at < now()'),

    // Application mobile : inscription en attente du code reçu par e-mail
    async savePendingSignup({ id, nom, prenom, filiale, email, passwordHash, codeHash, expiresAt }) {
      await pool.query('DELETE FROM pending_signups WHERE lower(email) = lower($1) OR expires_at < now()', [email]);
      await pool.query(
        `INSERT INTO pending_signups (id, nom, prenom, filiale, email, password_hash, code_hash, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, nom, prenom, filiale, email, passwordHash, codeHash, expiresAt]
      );
    },
    findPendingSignup: (id) => one('SELECT * FROM pending_signups WHERE id = $1', [id]),
    renewPendingCode: (id, codeHash, expiresAt) =>
      pool.query('UPDATE pending_signups SET code_hash = $2, expires_at = $3, sent_at = now(), attempts = 0 WHERE id = $1', [id, codeHash, expiresAt]),
    async bumpPendingAttempts(id) {
      return (await one('UPDATE pending_signups SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts', [id]))?.attempts ?? 0;
    },
    deletePendingSignup: (id) => pool.query('DELETE FROM pending_signups WHERE id = $1', [id]),

    // Événements
    createEvent: ({ titre, description, photoData, photoType, debut, fin, lieu }) =>
      one(
        `INSERT INTO events (titre, description, photo_data, photo_type, debut, fin, lieu)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${EVENT_COLUMNS}`,
        [titre, description, photoData || null, photoType || null, debut || null, fin || null, lieu || null]
      ),
    // Une nouvelle photo remplace l'ancienne ; sans nouvelle photo, l'ancienne est gardée sauf si removePhoto.
    updateEvent: (id, { titre, description, debut, fin, lieu, photoData, photoType, removePhoto }) =>
      pool.query(
        `UPDATE events SET titre = $2, description = $3, debut = $4, fin = $5, lieu = $6,
           photo_data = CASE WHEN $7::bytea IS NOT NULL THEN $7 WHEN $9 THEN NULL ELSE photo_data END,
           photo_type = CASE WHEN $7::bytea IS NOT NULL THEN $8 WHEN $9 THEN NULL ELSE photo_type END
         WHERE id = $1`,
        [id, titre, description, debut || null, fin || null, lieu || null, photoData || null, photoType || null, Boolean(removePhoto)]
      ),
    findEvent: (id) => one(`SELECT ${EVENT_COLUMNS} FROM events WHERE id = $1`, [id]),
    findEventPhoto: (id) => one('SELECT photo_data, photo_type FROM events WHERE id = $1 AND photo_data IS NOT NULL', [id]),
    listActiveEvents: () =>
      all(`SELECT ${EVENT_COLUMNS} FROM events WHERE termine_at IS NULL ORDER BY COALESCE(debut, to_char(created_at, 'YYYY-MM-DD"T"HH24:MI'))`),
    listFinishedEvents: () =>
      all(`SELECT ${EVENT_COLUMNS} FROM events WHERE termine_at IS NOT NULL ORDER BY termine_at DESC`),
    listAllEvents: () =>
      all(`SELECT ${EVENT_COLUMNS} FROM events ORDER BY termine_at IS NOT NULL, created_at DESC`),
    finishEvent: (id) => pool.query('UPDATE events SET termine_at = now() WHERE id = $1 AND termine_at IS NULL', [id]),

    // Participations
    findParticipation: (eventId, userId) =>
      one('SELECT * FROM participations WHERE event_id = $1 AND user_id = $2', [eventId, userId]),
    async confirmParticipation(eventId, userId) {
      const token = crypto.randomBytes(24).toString('base64url');
      await pool.query(
        'INSERT INTO participations (event_id, user_id, qr_token) VALUES ($1, $2, $3) ON CONFLICT (event_id, user_id) DO NOTHING',
        [eventId, userId, token]
      );
      return this.findParticipation(eventId, userId);
    },
    cancelParticipation: (eventId, userId) =>
      pool.query('DELETE FROM participations WHERE event_id = $1 AND user_id = $2 AND scanne_at IS NULL', [eventId, userId]),
    findParticipationByToken: (token) =>
      one(
        `SELECT p.*, u.nom, u.prenom, u.filiale, u.email, e.titre, e.termine_at
         FROM participations p
         JOIN users u ON u.id = p.user_id
         JOIN events e ON e.id = p.event_id
         WHERE p.qr_token = $1`,
        [token]
      ),
    // Renvoie true seulement si ce scan est le premier pour ce QR code.
    async markScanned(participationId, agentId) {
      const result = await pool.query(
        'UPDATE participations SET scanne_at = now(), scanne_par = $1 WHERE id = $2 AND scanne_at IS NULL',
        [agentId, participationId]
      );
      return result.rowCount === 1;
    },
    listConfirmed: (eventId) =>
      all(
        `SELECT ${PARTICIPANT_COLUMNS} FROM participations p JOIN users u ON u.id = p.user_id
         WHERE p.event_id = $1 ORDER BY u.nom, u.prenom`,
        [eventId]
      ),
    // Par filiale : nombre d'inscrits sur le site, de présences annoncées et de présences confirmées (QR).
    statsByFiliale: (eventId) =>
      all(
        `SELECT u.filiale, count(*)::int AS inscrits, count(p.id)::int AS confirmes, count(p.scanne_at)::int AS presents
         FROM users u LEFT JOIN participations p ON p.user_id = u.id AND p.event_id = $1
         GROUP BY u.filiale ORDER BY confirmes DESC, inscrits DESC, u.filiale`,
        [eventId]
      ),
    listPresent: (eventId) =>
      all(
        `SELECT ${PARTICIPANT_COLUMNS} FROM participations p JOIN users u ON u.id = p.user_id
         WHERE p.event_id = $1 AND p.scanne_at IS NOT NULL ORDER BY p.scanne_at`,
        [eventId]
      ),
    async participationsForUser(userId) {
      const rows = await all('SELECT event_id, scanne_at FROM participations WHERE user_id = $1', [userId]);
      return new Map(rows.map((row) => [row.event_id, row]));
    },
  };
}

module.exports = { openDatabase };
