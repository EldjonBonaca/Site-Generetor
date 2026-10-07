/**
 * API server entry point.
 * Dev: the Vite dev server (port 5173) proxies /api here.
 * Prod (`npm start`): this server also serves the built frontend.
 */
import fs from 'node:fs';
import { config } from './config.js';
import app from './app.js';

app.listen(config.port, '127.0.0.1', () => {
  console.log(`[api] Elementor Site Generator API on http://localhost:${config.port}`);
  if (fs.existsSync(config.frontendDist)) console.log(`[api] UI available on http://localhost:${config.port}`);
});
