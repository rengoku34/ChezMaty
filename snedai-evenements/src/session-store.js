const session = require('express-session');

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Sessions conservées dans SQLite pour survivre aux redémarrages du serveur.
class SqliteSessionStore extends session.Store {
  constructor(db) {
    super();
    this.db = db;
    this.cleanupTimer = setInterval(() => this.clearExpired(), 60 * 60 * 1000);
    this.cleanupTimer.unref();
  }

  expiryOf(sess) {
    const expires = sess?.cookie?.expires ? new Date(sess.cookie.expires).getTime() : NaN;
    return Number.isFinite(expires) ? expires : Date.now() + DEFAULT_TTL_MS;
  }

  get(sid, callback) {
    try {
      const row = this.db.prepare('SELECT data, expires FROM sessions WHERE sid = ?').get(sid);
      if (!row || row.expires < Date.now()) return callback(null, null);
      callback(null, JSON.parse(row.data));
    } catch (error) {
      callback(error);
    }
  }

  set(sid, sess, callback = () => {}) {
    try {
      this.db
        .prepare('INSERT OR REPLACE INTO sessions (sid, data, expires) VALUES (?, ?, ?)')
        .run(sid, JSON.stringify(sess), this.expiryOf(sess));
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  touch(sid, sess, callback = () => {}) {
    try {
      this.db.prepare('UPDATE sessions SET expires = ? WHERE sid = ?').run(this.expiryOf(sess), sid);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  destroy(sid, callback = () => {}) {
    try {
      this.db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  clearExpired() {
    this.db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
  }
}

module.exports = { SqliteSessionStore };
