/**
 * Login for the whole app (UI, API, images, downloads) with a login page and a session cookie,
 * so every user can log out. Enabled when at least one user is configured:
 *   APP_USERS=mz:password1,eb:password2,dr:password3   (a password cannot contain ",")
 *   APP_USER=admin + APP_PASSWORD=secret                 (one user, kept for older .env files)
 *
 * The session cookie is signed (HMAC) and holds the username, an expiry and a fingerprint of the
 * password: removing a user or changing their password in .env ends their sessions.
 * The user chooses at login how many minutes the session lasts (SESSION_MINUTES); it ends at that time
 * unless it is extended (POST /api/session/extend: the same number of minutes again, from now).
 * req.user is the logged-in username (null when the login is disabled).
 */
import crypto from 'node:crypto';

export const SESSION_COOKIE = 'esg_session';
/** Session lengths offered on the login page, in minutes (the first one when none is chosen). */
export const SESSION_MINUTES = [15, 5, 10, 20, 30];
const sessionMinutes = (v) => (SESSION_MINUTES.includes(Number(v)) ? Number(v) : SESSION_MINUTES[0]);

const sha256 = (s) => crypto.createHash('sha256').update(s).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(sha256(a), sha256(b));
const b64url = (buf) => Buffer.from(buf).toString('base64url');

/** @returns {[{ user: string, password: string }]} */
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

/** The user with these credentials, or null. Every user is compared (no early exit): timing reveals nothing. */
export function checkCredentials(users, username, password) {
  let found = null;
  for (const x of users) if ((safeEqual(String(username), x.user) & safeEqual(String(password), x.password)) === 1) found = x;
  return found;
}

function cookies(req) {
  const out = {};
  for (const part of String(req.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// Slow down password guessing: max failed logins per IP in a time window.
const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;
const failures = new Map();
const blocked = (ip) => {
  const e = failures.get(ip);
  if (e && Date.now() - e.since > WINDOW_MS) failures.delete(ip);
  return (failures.get(ip)?.count || 0) >= MAX_FAILURES;
};
const fail = (ip) => {
  const e = failures.get(ip) || { count: 0, since: Date.now() };
  e.count += 1;
  failures.set(ip, e);
};

/**
 * @param {{ users: {user,password}[], secret: string }} opts
 * @returns {{ enabled, middleware, login, logout, me }} express handlers
 */
export function createAuth({ users, secret }) {
  const key = crypto.createHmac('sha256', secret).update('esg-session').digest();
  const sign = (data) => b64url(crypto.createHmac('sha256', key).update(data).digest());
  const fingerprint = (u) => b64url(sha256(`${u.user}:${u.password}`)).slice(0, 12);

  /** A session of `minutes` from now: { token, expiresAt }. */
  const issue = (u, minutes) => {
    const expiresAt = Date.now() + minutes * 60000;
    const data = b64url(JSON.stringify({ u: u.user, f: fingerprint(u), exp: expiresAt, m: minutes }));
    return { token: `${data}.${sign(data)}`, expiresAt };
  };
  /** The session of a cookie: { user, expiresAt, minutes }, or null (no cookie, forged, expired, user removed). */
  const session = (token) => {
    const [data, mac] = String(token || '').split('.');
    if (!data || !mac || !safeEqual(mac, sign(data))) return null;
    try {
      const s = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
      const u = users.find((x) => x.user === s.u);
      return u && s.exp > Date.now() && s.f === fingerprint(u) ? { user: u.user, expiresAt: s.exp, minutes: sessionMinutes(s.m) } : null;
    } catch {
      return null;
    }
  };
  const start = (req, res, u, minutes) => {
    const { token, expiresAt } = issue(u, minutes);
    setCookie(req, res, token, minutes * 60);
    return expiresAt;
  };
  function setCookie(req, res, value, maxAge) {
    res.append('Set-Cookie', `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${req.secure ? '; Secure' : ''}`);
  }

  const PUBLIC = new Set(['/login', '/api/login', '/api/health']);

  return {
    enabled: users.length > 0,

    middleware(req, res, next) {
      req.user = null;
      if (!users.length || PUBLIC.has(req.path)) return next();
      req.session = session(cookies(req)[SESSION_COOKIE]);
      req.user = req.session?.user || null;
      if (req.user) return next();
      if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Login required' });
      const next_ = req.originalUrl && req.originalUrl !== '/' ? `?next=${encodeURIComponent(req.originalUrl)}` : '';
      return res.redirect(302, `/login${next_}`);
    },

    login(req, res) {
      if (blocked(req.ip)) return res.status(429).json({ error: 'Too many failed logins. Try again later.' });
      const u = checkCredentials(users, req.body?.username ?? '', req.body?.password ?? '');
      if (!u) {
        fail(req.ip);
        return res.status(401).json({ error: 'Wrong username or password.' });
      }
      failures.delete(req.ip);
      const minutes = sessionMinutes(req.body?.minutes);
      res.json({ user: u.user, minutes, expiresAt: start(req, res, u, minutes), now: Date.now() });
    },

    /** The session starts again for the minutes chosen at login ("continue" of the warning before it ends). */
    extend(req, res) {
      const u = users.find((x) => x.user === req.user);
      if (!u || !req.session) return res.status(401).json({ error: 'Login required' });
      res.json({ user: u.user, minutes: req.session.minutes, expiresAt: start(req, res, u, req.session.minutes), now: Date.now() });
    },

    logout(req, res) {
      setCookie(req, res, '', 0);
      res.status(204).end();
    },

    me(req, res) {
      res.json({ user: req.user, auth: users.length > 0, ...(req.session ? { expiresAt: req.session.expiresAt, minutes: req.session.minutes, now: Date.now() } : {}) });
    },
  };
}

/** Login page: neutral, nothing tells what the application does. */
export const LOGIN_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="data:,">
<title>Login</title>
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f1f5f9;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#0f172a}
form{width:min(360px,calc(100vw - 32px));background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:32px;box-shadow:0 10px 30px rgba(15,23,42,.06)}
h1{margin:0 0 16px;font-size:22px;font-weight:600}
.warn{display:flex;gap:10px;align-items:flex-start;margin:0 0 22px;padding:12px 14px;border:1px solid #fcd34d;border-radius:10px;background:#fffbeb;font-size:13.5px;line-height:1.45;color:#92400e}
.warn b{display:block;color:#b45309;letter-spacing:.04em}
.warn span{font-size:20px;line-height:1.1}
label{display:block;margin-bottom:16px;font-size:14px;font-weight:500;color:#334155}
input,select{display:block;width:100%;margin-top:6px;padding:11px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:15px;font-family:inherit;background:#fff;color:inherit}
input:focus,select:focus{outline:none;border-color:#4f46e5;box-shadow:0 0 0 3px rgba(79,70,229,.15)}
/* The password is typed in a plain field drawn as dots: the browser does not offer to save it */
.secret{-webkit-text-security:disc;text-security:disc}
button{width:100%;margin-top:8px;padding:12px;border:0;border-radius:8px;background:#4f46e5;color:#fff;font-size:15px;font-weight:600;cursor:pointer}
button:disabled{opacity:.6;cursor:wait}
.error{min-height:20px;margin:12px 0 0;font-size:14px;color:#b91c1c}
</style>
</head>
<body>
<form id="f" autocomplete="off">
<h1>Login</h1>
<div class="warn"><span aria-hidden="true">&#9888;&#65039;</span><p style="margin:0"><b>KUJDES!</b>Po hap di&ccedil;ka t&euml; paligjshme. Vazhdo me p&euml;rgjegj&euml;sin&euml; t&euml;nde &#128517;</p></div>
<label>Username<input name="username" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" required autofocus></label>
<label>Password<input name="password" class="secret" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" required></label>
<label>Durata della sessione<select name="minutes">__SESSION_OPTIONS__</select></label>
<button type="submit">Sign in</button>
<p class="error" id="e" role="alert"></p>
</form>
<script>
document.getElementById('f').addEventListener('submit', async function (ev) {
  ev.preventDefault();
  var btn = this.querySelector('button'), err = document.getElementById('e');
  btn.disabled = true; err.textContent = '';
  try {
    var res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: this.username.value, password: this.password.value, minutes: Number(this.minutes.value) }) });
    this.password.value = '';
    if (res.ok) {
      this.username.value = '';
      var next = new URLSearchParams(location.search).get('next') || '/';
      location.href = next.charAt(0) === '/' && next.charAt(1) !== '/' ? next : '/';
      return;
    }
    err.textContent = ((await res.json().catch(function () { return {}; })).error) || 'Login failed.';
  } catch (e) { err.textContent = 'Network error.'; }
  btn.disabled = false;
});
</script>
</body>
</html>`.replace(
  '__SESSION_OPTIONS__',
  SESSION_MINUTES.slice()
    .sort((a, b) => a - b)
    .map((m) => `<option value="${m}"${m === SESSION_MINUTES[0] ? ' selected' : ''}>${m} minuti</option>`)
    .join('')
);
