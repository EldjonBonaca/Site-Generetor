/**
 * Provider registry: auto-discovers every adapter in ./providers at startup.
 * Dropping a new file there is all it takes to support a new provider.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AIProvider } from './AIProvider.js';
import { decrypt } from '../lib/crypto.js';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adapters = new Map();

for (const file of fs.readdirSync(path.join(__dirname, 'providers')).sort()) {
  if (!file.endsWith('.js')) continue;
  const mod = await import(pathToFileURL(path.join(__dirname, 'providers', file)).href);
  const Adapter = mod.default;
  if (Adapter?.prototype instanceof AIProvider && Adapter.type) adapters.set(Adapter.type, Adapter);
}

const ORDER = ['anthropic', 'openai', 'gemini', 'openai-compatible', 'mock'];

export function listProviderTypes() {
  return [...adapters.values()]
    .map((A) => A.describe())
    .sort((a, b) => (ORDER.indexOf(a.type) + 1 || 99) - (ORDER.indexOf(b.type) + 1 || 99));
}

export function getAdapter(type) {
  return adapters.get(type) || null;
}

/** Instantiate a provider from a DB row (decrypts the key in memory only). */
export function createProvider(row) {
  const Adapter = adapters.get(row.type);
  if (!Adapter) throw new Error(`Unknown provider type "${row.type}"`);
  return new Adapter({
    apiKey: row.encrypted_api_key ? decrypt(row.encrypted_api_key) : '',
    baseUrl: row.base_url,
    model: row.model,
    temperature: row.temperature,
    maxTokens: row.max_tokens,
    timeoutMs: config.aiTimeoutMs,
  });
}
