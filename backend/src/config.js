/**
 * Central configuration: loads backend/.env, resolves storage paths and
 * makes sure an encryption key exists (generated on first run for convenience).
 */
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BACKEND_ROOT = path.resolve(__dirname, '..');
const envPath = path.join(BACKEND_ROOT, '.env');

dotenv.config({ path: envPath, quiet: true });

if (!process.env.ENCRYPTION_KEY) {
  const key = crypto.randomBytes(32).toString('hex');
  fs.appendFileSync(envPath, `${fs.existsSync(envPath) ? '\n' : ''}ENCRYPTION_KEY=${key}\n`);
  process.env.ENCRYPTION_KEY = key;
  console.warn(
    '[config] ENCRYPTION_KEY was missing: a new one was generated in backend/.env.\n' +
      '         Keep it safe: without it the saved API keys cannot be decrypted.'
  );
}

const storageDir = path.resolve(BACKEND_ROOT, process.env.STORAGE_DIR || '../storage');

export const config = {
  port: Number(process.env.PORT || 4000),
  // 127.0.0.1 = reachable only through a reverse proxy (nginx) on the same machine
  host: process.env.HOST || '127.0.0.1',
  // Number of reverse proxies in front of the app (for the client IP); 0 = none
  trustProxy: Number(process.env.TRUST_PROXY || 0),
  // Login for the whole app (HTTP Basic Auth). Empty password = no login (local use only)
  appUser: process.env.APP_USER || 'admin',
  appPassword: process.env.APP_PASSWORD || '',
  encryptionKey: process.env.ENCRYPTION_KEY,
  storageDir,
  dbPath: path.join(storageDir, 'app.sqlite'),
  imagesDir: path.join(storageDir, 'images'),
  libraryDir: path.join(storageDir, 'library'),
  kitsDir: path.join(storageDir, 'kits'),
  outputDir: path.join(storageDir, 'output'),
  tmpDir: path.join(storageDir, 'tmp'),
  maxImageBytes: Number(process.env.MAX_IMAGE_MB || 15) * 1024 * 1024,
  maxKitBytes: Number(process.env.MAX_KIT_MB || 150) * 1024 * 1024,
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS || 180000),
  frontendDist: path.resolve(BACKEND_ROOT, '../frontend/dist'),
};

for (const dir of [config.storageDir, config.imagesDir, config.libraryDir, config.kitsDir, config.outputDir, config.tmpDir]) {
  fs.mkdirSync(dir, { recursive: true });
}
