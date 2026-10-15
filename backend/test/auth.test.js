/** Login (HTTP Basic Auth) for several users. Runs in its own process, so config is isolated. */
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
let server;
let base;

before(async () => {
  await new Promise((r) => (server = app.listen(0, '127.0.0.1', r)));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server?.close());

const basic = (u, p) => ({ authorization: `Basic ${Buffer.from(`${u}:${p}`).toString('base64')}` });
const status = async (headers) => (await fetch(`${base}/api/projects`, { headers })).status;

test('users from APP_USERS (and the older APP_USER + APP_PASSWORD)', () => {
  assert.deepEqual(parseUsers({ users: process.env.APP_USERS }).map((u) => u.user), ['mz', 'eb', 'dr']);
  assert.deepEqual(parseUsers({ user: 'admin', password: 'x' }), [{ user: 'admin', password: 'x' }]);
  assert.deepEqual(parseUsers({ users: 'bad,:nouser,nopass:' }), []);
});

test('health check is public', async () => {
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
});

test('API and files require the login', async () => {
  const res = await fetch(`${base}/api/projects`);
  assert.equal(res.status, 401);
  assert.equal(res.headers.get('www-authenticate'), 'Basic realm="Login", charset="UTF-8"');
  assert.equal(await status(basic('mz', 'wrong')), 401);
  assert.equal(await status(basic('mz', 'Dr-2026')), 401, "another user's password does not work");
  assert.equal(await status(basic('xx', 'Pass-mz1')), 401);
});

test('each user logs in with their own password (a password may contain a colon)', async () => {
  assert.equal(await status(basic('mz', 'Pass-mz1')), 200);
  assert.equal(await status(basic('eb', 's3cret:eb')), 200);
  assert.equal(await status(basic('dr', 'Dr-2026')), 200);
});
