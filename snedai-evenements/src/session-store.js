const session = require('express-session');

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Sessions conservées dans PostgreSQL pour survivre aux redémarrages du serveur.
class PgSessionStore extends session.Store {
  constructor(pool) {
    super();
    this.pool = pool;
    this.cleanupTimer = setInterval(() => this.clearExpired().catch(() => {}), 60 * 60 * 1000);
    this.cleanupTimer.unref();
  }

  expiryOf(sess) {
    const expires = sess?.cookie?.expires ? new Date(sess.cookie.expires).getTime() : NaN;
    return Number.isFinite(expires) ? expires : Date.now() + DEFAULT_TTL_MS;
  }

  get(sid, callback) {
    this.pool
      .query('SELECT data FROM sessions WHERE sid = $1 AND expires >= $2', [sid, Date.now()])
      .then((result) => callback(null, result.rows[0]?.data ?? null), callback);
  }

  set(sid, sess, callback = () => {}) {
    this.pool
      .query(
        `INSERT INTO sessions (sid, data, expires) VALUES ($1, $2, $3)
         ON CONFLICT (sid) DO UPDATE SET data = EXCLUDED.data, expires = EXCLUDED.expires`,
        [sid, sess, this.expiryOf(sess)]
      )
      .then(() => callback(null), callback);
  }

  touch(sid, sess, callback = () => {}) {
    this.pool
      .query('UPDATE sessions SET expires = $1 WHERE sid = $2', [this.expiryOf(sess), sid])
      .then(() => callback(null), callback);
  }

  destroy(sid, callback = () => {}) {
    this.pool.query('DELETE FROM sessions WHERE sid = $1', [sid]).then(() => callback(null), callback);
  }

  clearExpired() {
    return this.pool.query('DELETE FROM sessions WHERE expires < $1', [Date.now()]);
  }
}

module.exports = { PgSessionStore };
