/**
 * API server entry point.
 * Dev: the Vite dev server (port 5173) proxies /api here.
 * Prod (`npm start`): this server also serves the built frontend.
 */
import fs from 'node:fs';
import { config } from './config.js';
import app from './app.js';

const loopback = ['127.0.0.1', 'localhost', '::1'].includes(config.host);
if (!loopback && !config.appPassword) {
  console.error(`[api] Refusing to listen on ${config.host} without APP_PASSWORD: set it in backend/.env.`);
  process.exit(1);
}
if (!config.appPassword) console.warn('[api] APP_PASSWORD is not set: no login. Fine locally, NOT behind a public domain.');

app.listen(config.port, config.host, () => {
  console.log(`[api] Elementor Site Generator API on http://${config.host}:${config.port}`);
  if (fs.existsSync(config.frontendDist)) console.log(`[api] UI available on http://${config.host}:${config.port}`);
});
