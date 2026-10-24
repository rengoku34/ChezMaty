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
  scanne_par INTEGER REFERENCES users(id),
  UNIQUE (event_id, user_id)
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

    // Événements
    createEvent: ({ titre, description, photoData, photoType, debut, fin, lieu }) =>
      one(
        `INSERT INTO events (titre, description, photo_data, photo_type, debut, fin, lieu)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${EVENT_COLUMNS}`,
        [titre, description, photoData || null, photoType || null, debut || null, fin || null, lieu || null]
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
