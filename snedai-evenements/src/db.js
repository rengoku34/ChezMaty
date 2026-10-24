const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  filiale TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  google_id TEXT UNIQUE,
  is_agent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titre TEXT NOT NULL,
  description TEXT NOT NULL,
  photo TEXT,
  debut TEXT,
  fin TEXT,
  lieu TEXT,
  termine_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS participations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  qr_token TEXT NOT NULL UNIQUE,
  confirme_at TEXT NOT NULL DEFAULT (datetime('now')),
  scanne_at TEXT,
  scanne_par INTEGER REFERENCES users(id),
  UNIQUE (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  expires INTEGER NOT NULL
);
`;

function openDatabase(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return createRepository(db);
}

function createRepository(db) {
  const PARTICIPANT_COLUMNS = `u.nom, u.prenom, u.email, u.filiale, p.confirme_at, p.scanne_at`;

  return {
    raw: db,

    // Utilisateurs
    findUserById: (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id),
    findUserByEmail: (email) => db.prepare('SELECT * FROM users WHERE email = ?').get(email),
    findUserByGoogleId: (googleId) => db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId),
    createUser({ nom, prenom, filiale, email, passwordHash, googleId }) {
      const info = db
        .prepare(
          'INSERT INTO users (nom, prenom, filiale, email, password_hash, google_id) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run(nom, prenom, filiale, email, passwordHash, googleId || null);
      return this.findUserById(info.lastInsertRowid);
    },
    linkGoogleId: (userId, googleId) =>
      db.prepare('UPDATE users SET google_id = ? WHERE id = ?').run(googleId, userId),
    listUsers: () =>
      db.prepare('SELECT id, nom, prenom, email, filiale, is_agent, created_at FROM users ORDER BY nom, prenom').all(),
    setAgent: (userId, isAgent) =>
      db.prepare('UPDATE users SET is_agent = ? WHERE id = ?').run(isAgent ? 1 : 0, userId),

    // Événements
    createEvent({ titre, description, photo, debut, fin, lieu }) {
      const info = db
        .prepare('INSERT INTO events (titre, description, photo, debut, fin, lieu) VALUES (?, ?, ?, ?, ?, ?)')
        .run(titre, description, photo || null, debut || null, fin || null, lieu || null);
      return this.findEvent(info.lastInsertRowid);
    },
    findEvent: (id) => db.prepare('SELECT * FROM events WHERE id = ?').get(id),
    listActiveEvents: () =>
      db.prepare('SELECT * FROM events WHERE termine_at IS NULL ORDER BY COALESCE(debut, created_at) ASC').all(),
    listFinishedEvents: () =>
      db.prepare('SELECT * FROM events WHERE termine_at IS NOT NULL ORDER BY termine_at DESC').all(),
    listAllEvents: () =>
      db.prepare('SELECT * FROM events ORDER BY termine_at IS NOT NULL, created_at DESC').all(),
    finishEvent: (id) =>
      db.prepare("UPDATE events SET termine_at = datetime('now') WHERE id = ? AND termine_at IS NULL").run(id),

    // Participations
    findParticipation: (eventId, userId) =>
      db.prepare('SELECT * FROM participations WHERE event_id = ? AND user_id = ?').get(eventId, userId),
    confirmParticipation(eventId, userId) {
      const existing = this.findParticipation(eventId, userId);
      if (existing) return existing;
      const token = crypto.randomBytes(24).toString('base64url');
      db.prepare('INSERT INTO participations (event_id, user_id, qr_token) VALUES (?, ?, ?)').run(eventId, userId, token);
      return this.findParticipation(eventId, userId);
    },
    cancelParticipation: (eventId, userId) =>
      db
        .prepare('DELETE FROM participations WHERE event_id = ? AND user_id = ? AND scanne_at IS NULL')
        .run(eventId, userId),
    findParticipationByToken: (token) =>
      db
        .prepare(
          `SELECT p.*, u.nom, u.prenom, u.filiale, u.email, e.titre, e.termine_at
           FROM participations p
           JOIN users u ON u.id = p.user_id
           JOIN events e ON e.id = p.event_id
           WHERE p.qr_token = ?`
        )
        .get(token),
    markScanned: (participationId, agentId) =>
      db
        .prepare("UPDATE participations SET scanne_at = datetime('now'), scanne_par = ? WHERE id = ? AND scanne_at IS NULL")
        .run(agentId, participationId),
    listConfirmed: (eventId) =>
      db
        .prepare(
          `SELECT ${PARTICIPANT_COLUMNS} FROM participations p JOIN users u ON u.id = p.user_id
           WHERE p.event_id = ? ORDER BY u.nom, u.prenom`
        )
        .all(eventId),
    listPresent: (eventId) =>
      db
        .prepare(
          `SELECT ${PARTICIPANT_COLUMNS} FROM participations p JOIN users u ON u.id = p.user_id
           WHERE p.event_id = ? AND p.scanne_at IS NOT NULL ORDER BY p.scanne_at`
        )
        .all(eventId),
    participationIdsForUser(userId) {
      const rows = db.prepare('SELECT event_id, scanne_at FROM participations WHERE user_id = ?').all(userId);
      return new Map(rows.map((row) => [row.event_id, row]));
    },
  };
}

module.exports = { openDatabase };
