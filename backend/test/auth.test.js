/** Login (HTTP Basic Auth) when APP_PASSWORD is set. Runs in its own process, so config is isolated. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'esg-auth-'));
process.env.ENCRYPTION_KEY ||= 'c'.repeat(64);
process.env.APP_USER = 'admin';
process.env.APP_PASSWORD = 's3cret:pass';

const { default: app } = await import('../src/app.js');
let server;
let base;

before(async () => {
  await new Promise((r) => (server = app.listen(0, '127.0.0.1', r)));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server?.close());

const basic = (u, p) => ({ authorization: `Basic ${Buffer.from(`${u}:${p}`).toString('base64')}` });

test('health check is public', async () => {
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
});

test('API and files require the login', async () => {
  const res = await fetch(`${base}/api/projects`);
  assert.equal(res.status, 401);
  assert.match(res.headers.get('www-authenticate'), /^Basic/);
  assert.equal((await fetch(`${base}/api/projects`, { headers: basic('admin', 'wrong') })).status, 401);
  assert.equal((await fetch(`${base}/api/projects`, { headers: basic('other', 's3cret:pass') })).status, 401);
});

test('correct credentials pass (password may contain a colon)', async () => {
  assert.equal((await fetch(`${base}/api/projects`, { headers: basic('admin', 's3cret:pass') })).status, 200);
});
