/**
 * Users: login page + session cookie, logout, and who sees what (own AI providers, own or
 * shared templates, shared projects). Runs in its own process, so config is isolated.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'esg-auth-'));
process.env.ENCRYPTION_KEY ||= 'c'.repeat(64);
process.env.APP_USERS = 'mz:Pass-mz1, eb:s3cret:eb ,dr:Dr-2026';
delete process.env.APP_USER;
delete process.env.APP_PASSWORD;

const { default: app } = await import('../src/app.js');
const { parseUsers } = await import('../src/lib/auth.js');
const { run } = await import('../src/db/index.js');
let server;
let base;

before(async () => {
  await new Promise((r) => (server = app.listen(0, '127.0.0.1', r)));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server?.close());

async function login(username, password) {
  const res = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  return { status: res.status, cookie: (res.headers.get('set-cookie') || '').split(';')[0], setCookie: res.headers.get('set-cookie') || '' };
}
/** API call as a logged-in user (cookie) -> { status, body } */
async function as(cookie, method, url, body) {
  const res = await fetch(base + url, { method, redirect: 'manual', headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* html */
  }
  return { status: res.status, body: data, location: res.headers.get('location') };
}

test('users from APP_USERS (and the older APP_USER + APP_PASSWORD)', () => {
  assert.deepEqual(parseUsers({ users: process.env.APP_USERS }).map((u) => u.user), ['mz', 'eb', 'dr']);
  assert.deepEqual(parseUsers({ user: 'admin', password: 'x' }), [{ user: 'admin', password: 'x' }]);
  assert.deepEqual(parseUsers({ users: 'bad,:nouser,nopass:' }), []);
});

test('without login: health check only; pages go to the neutral login page', async () => {
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
  assert.equal((await as('', 'GET', '/api/projects')).status, 401);
  const page = await as('', 'GET', '/projects/3');
  assert.equal(page.status, 302);
  assert.equal(page.location, '/login?next=%2Fprojects%2F3');
  const loginPage = await as('', 'GET', '/login');
  assert.equal(loginPage.status, 200);
  assert.match(loginPage.body, /<title>Login<\/title>/);
  assert.doesNotMatch(loginPage.body, /generat|elementor|website/i, 'nothing tells what the app does');
});

test('login, session, logout', async () => {
  assert.equal((await login('mz', 'wrong')).status, 401);
  assert.equal((await login('mz', 'Dr-2026')).status, 401, "another user's password does not work");
  const mz = await login('mz', 'Pass-mz1');
  assert.equal(mz.status, 200);
  assert.match(mz.setCookie, /esg_session=.+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000/);
  assert.equal((await as(mz.cookie, 'GET', '/api/projects')).status, 200);
  assert.deepEqual((await as(mz.cookie, 'GET', '/api/me')).body, { user: 'mz', auth: true });
  assert.equal((await login('eb', 's3cret:eb')).status, 200, 'a password may contain a colon');

  // A forged cookie (another username, same signature) is refused
  const [data, mac] = mz.cookie.split('=')[1].split('.');
  const forged = Buffer.from(Buffer.from(data, 'base64url').toString().replace('"mz"', '"eb"')).toString('base64url');
  assert.equal((await as(`esg_session=${forged}.${mac}`, 'GET', '/api/projects')).status, 401);

  const out = await fetch(`${base}/api/logout`, { method: 'POST', headers: { cookie: mz.cookie } });
  assert.equal(out.status, 204);
  assert.match(out.headers.get('set-cookie'), /esg_session=; Path=\/; HttpOnly; SameSite=Lax; Max-Age=0/);
});

test('own AI providers, own or shared templates, shared projects', async () => {
  const mz = (await login('mz', 'Pass-mz1')).cookie;
  const eb = (await login('eb', 's3cret:eb')).cookie;

  // AI providers: only the owner sees and uses them; the ones from before users existed are shared
  run("INSERT INTO ai_providers (type, name, encrypted_api_key, key_hint, base_url, model, models_json) VALUES ('mock', 'Old shared', '', '', '', 'mock-1', '[]')");
  const mine = (await as(mz, 'POST', '/api/providers', { type: 'mock', name: 'Key of mz' })).body;
  assert.equal(mine.owner, 'mz');
  assert.deepEqual((await as(mz, 'GET', '/api/providers')).body.map((p) => p.name), ['Old shared', 'Key of mz']);
  assert.deepEqual((await as(eb, 'GET', '/api/providers')).body.map((p) => p.name), ['Old shared']);
  assert.equal((await as(eb, 'PATCH', `/api/providers/${mine.id}`, { name: 'x' })).status, 404);
  assert.equal((await as(eb, 'DELETE', `/api/providers/${mine.id}`)).status, 404);
  assert.equal((await as(eb, 'POST', `/api/providers/${mine.id}/test`)).status, 404);

  // Templates: categories shared; a template is private unless its owner shares it
  const cat = (await as(mz, 'POST', '/api/template-categories', { name: 'Parrucchieri' })).body;
  const priv = (await as(mz, 'POST', `/api/template-categories/${cat.id}/templates`, { name: 'Private', spec: {} })).body;
  const pub = (await as(mz, 'POST', `/api/template-categories/${cat.id}/templates`, { name: 'For everyone', spec: {}, shared: true })).body;
  assert.deepEqual([priv.owner, priv.shared, priv.can_edit, pub.shared], ['mz', false, true, true]);
  assert.deepEqual((await as(eb, 'GET', `/api/templates?category=${cat.id}`)).body.map((t) => [t.name, t.can_edit]), [['For everyone', false]]);
  assert.equal((await as(eb, 'GET', `/api/templates/${priv.id}`)).status, 404);
  assert.equal((await as(eb, 'PATCH', `/api/templates/${pub.id}`, { name: 'Mine now' })).status, 403);
  assert.equal((await as(eb, 'DELETE', `/api/templates/${pub.id}`)).status, 403);
  assert.equal((await as(eb, 'DELETE', `/api/template-categories/${cat.id}`)).status, 403, 'category with templates of another user');
  const copy = (await as(eb, 'POST', `/api/templates/${pub.id}/duplicate`)).body;
  assert.deepEqual([copy.owner, copy.shared, copy.can_edit], ['eb', false, true], 'a shared template can be copied');
  assert.equal((await as(mz, 'PATCH', `/api/templates/${priv.id}`, { shared: true })).body.shared, true, 'the owner shares it');
  assert.equal((await as(eb, 'GET', `/api/templates/${priv.id}`)).status, 200);

  // Projects are shared, but each user generates with their own AI provider
  const project = (await as(mz, 'POST', '/api/projects', { site_name: 'Salone' })).body;
  await as(mz, 'PATCH', `/api/projects/${project.id}`, { settings: { generation: { providerId: mine.id } } });
  assert.equal((await as(eb, 'GET', `/api/projects/${project.id}`)).status, 200, 'projects are shared');
  const readiness = (await as(eb, 'GET', `/api/projects/${project.id}/readiness`)).body;
  assert.ok(readiness.items.some((i) => i.step === 'ai' && /another user/.test(i.message)));
  assert.ok(!(await as(mz, 'GET', `/api/projects/${project.id}/readiness`)).body.items.some((i) => i.step === 'ai'));
});

test("a shared project shows its template even when it is another user's private one", async () => {
  const mz = (await login('mz', 'Pass-mz1')).cookie;
  const eb = (await login('eb', 's3cret:eb')).cookie;
  const cat = (await as(mz, 'POST', '/api/template-categories', { name: 'Ristoranti' })).body;
  const priv = (await as(mz, 'POST', `/api/template-categories/${cat.id}/templates`, { name: 'Private 2', spec: {} })).body;
  const project = (await as(mz, 'POST', '/api/projects', { site_name: 'Trattoria' })).body;
  await as(mz, 'PUT', `/api/projects/${project.id}/template`, { template_id: priv.id });
  assert.equal((await as(eb, 'GET', `/api/templates/${priv.id}`)).status, 404);
  const seen = await as(eb, 'GET', `/api/templates/${priv.id}?project=${project.id}`);
  assert.equal(seen.status, 200);
  assert.equal(seen.body.can_edit, false);
  assert.equal((await as(eb, 'PUT', `/api/projects/${project.id}/template`, { template_id: priv.id })).status, 404, 'cannot pick it for other projects');
});
