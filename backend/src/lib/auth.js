/**
 * HTTP Basic Auth for the whole app (UI, API, images, downloads).
 * Enabled when APP_PASSWORD is set. The browser shows its own login prompt and
 * re-sends the credentials automatically, so <img> and download links keep working.
 */
import crypto from 'node:crypto';

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Slow down password guessing: max failed attempts per IP in a time window.
const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;
const failures = new Map();

export function basicAuth({ user, password }) {
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
      if (sep !== -1 && safeEqual(u, user) && safeEqual(p, password)) {
        failures.delete(req.ip);
        return next();
      }
      const e = failures.get(req.ip) || { count: 0, since: now };
      e.count += 1;
      failures.set(req.ip, e);
    }

    res.set('WWW-Authenticate', 'Basic realm="Site Generator", charset="UTF-8"');
    res.status(401).json({ error: 'Authentication required' });
  };
}
