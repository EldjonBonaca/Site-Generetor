/**
 * HTTP Basic Auth for the whole app (UI, API, images, downloads).
 * Enabled when at least one user is configured (APP_USERS, or APP_USER + APP_PASSWORD).
 * The browser shows its own login prompt and re-sends the credentials automatically,
 * so <img> and download links keep working.
 */
import crypto from 'node:crypto';

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Users from the environment:
 *   APP_USERS=mz:password1,eb:password2,dr:password3   (several users; a password cannot contain ",")
 *   APP_USER=admin + APP_PASSWORD=secret                 (one user, kept for older .env files)
 * @returns {[{ user: string, password: string }]}
 */
export function parseUsers({ users = '', user = '', password = '' } = {}) {
  const list = [];
  for (const entry of String(users).split(',')) {
    const sep = entry.indexOf(':');
    if (sep < 1) continue;
    const u = entry.slice(0, sep).trim();
    const p = entry.slice(sep + 1).trim();
    if (u && p) list.push({ user: u, password: p });
  }
  if (password && !list.some((x) => x.user === (user || 'admin'))) list.push({ user: user || 'admin', password });
  return list;
}

// Slow down password guessing: max failed attempts per IP in a time window.
const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;
const failures = new Map();

export function basicAuth(users) {
  return (req, res, next) => {
    const now = Date.now();
    const entry = failures.get(req.ip);
    if (entry && now - entry.since > WINDOW_MS) failures.delete(req.ip);
    if ((failures.get(req.ip)?.count || 0) >= MAX_FAILURES) {
      return res.status(429).json({ error: 'Too many failed logins. Try again later.' });
    }

    const [scheme, encoded] = (req.get('authorization') || '').split(' ');
    if (scheme === 'Basic' && encoded) {
      const decoded = Buffer.from(encoded, 'base64').toString('utf8');
      const sep = decoded.indexOf(':');
      const u = decoded.slice(0, sep);
      const p = decoded.slice(sep + 1);
      // Every user is compared (no early exit), so the time does not reveal which usernames exist
      let ok = false;
      for (const x of users) ok = (safeEqual(u, x.user) & safeEqual(p, x.password)) === 1 || ok;
      if (sep !== -1 && ok) {
        failures.delete(req.ip);
        req.user = u;
        return next();
      }
      const e = failures.get(req.ip) || { count: 0, since: now };
      e.count += 1;
      failures.set(req.ip, e);
    }

    res.set('WWW-Authenticate', 'Basic realm="Login", charset="UTF-8"');
    res.status(401).json({ error: 'Authentication required' });
  };
}
