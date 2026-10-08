/**
 * Express application (routes, static frontend, error handler).
 * Started by server.js; imported directly by the tests.
 */
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { config } from './config.js';
import { run } from './db/index.js';
import { HttpError } from './lib/util.js';
import { basicAuth } from './lib/auth.js';
import projects from './routes/projects.js';
import images from './routes/images.js';
import kits from './routes/kits.js';
import providers from './routes/providers.js';
import prompts from './routes/prompts.js';
import generations from './routes/generations.js';
import library from './routes/library.js';

// Jobs interrupted by a restart can't resume: mark them as failed.
run("UPDATE generations SET status = 'failed', error = 'Interrupted (server restarted).' WHERE status IN ('queued', 'running')");

const app = express();
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', config.trustProxy);

// Health check stays public (uptime monitors); everything else needs the login when APP_PASSWORD is set.
app.get('/api/health', (req, res) => res.json({ ok: true }));
if (config.appPassword) app.use(basicAuth({ user: config.appUser, password: config.appPassword }));

app.use(express.json({ limit: '2mb' }));

// Local tool: refuse cross-site requests from other origins (basic CSRF guard).
app.use('/api', (req, res, next) => {
  const origin = req.get('origin');
  if (origin && req.method !== 'GET') {
    const host = req.get('host');
    const ok = [`http://${host}`, `https://${host}`, 'http://localhost:5173', 'http://127.0.0.1:5173'].includes(origin);
    if (!ok) return res.status(403).json({ error: 'Cross-origin request refused' });
  }
  next();
});

for (const r of [projects, images, library, kits, providers, prompts, generations]) app.use('/api', r);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Serve the built frontend if present
if (fs.existsSync(config.frontendDist)) {
  app.use(express.static(config.frontendDist));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(config.frontendDist, 'index.html')));
}

// Error handler: readable messages, never stack traces or secrets.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File too large.' : err.message;
    return res.status(400).json({ error: msg });
  }
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body.' });
  console.error('[error]', req.method, req.originalUrl, err.message);
  res.status(500).json({ error: err.message || 'Internal error' });
});

export default app;
