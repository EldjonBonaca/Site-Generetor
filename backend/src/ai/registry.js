/**
 * Provider registry: auto-discovers every adapter in ./providers at startup.
 * Dropping a new file there is all it takes to support a new provider.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AIError, AIProvider } from './AIProvider.js';
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

/**
 * Instantiate a provider from a DB row (decrypts the key in memory only).
 * When the model stays overloaded (5xx after the retries), the call moves on to the other models
 * of the provider (its model list, then the suggested ones), keeping the first one that answers;
 * models that do not exist (404) are skipped.
 */
export function createProvider(row) {
  const Adapter = adapters.get(row.type);
  if (!Adapter) throw new Error(`Unknown provider type "${row.type}"`);
  const provider = new Adapter({
    apiKey: row.encrypted_api_key ? decrypt(row.encrypted_api_key) : '',
    baseUrl: row.base_url,
    model: row.model,
    temperature: row.temperature,
    maxTokens: row.max_tokens,
    timeoutMs: config.aiTimeoutMs,
  });
  let list = [];
  try {
    list = JSON.parse(row.models_json || '[]');
  } catch {
    /* no list */
  }
  const fallbacks = [...new Set([...(Array.isArray(list) ? list : []), ...Adapter.defaultModels])].filter((m) => typeof m === 'string' && m && m !== provider.model);
  if (!fallbacks.length) return provider;
  const generate = provider.generate.bind(provider);
  provider.generate = async (prompt, options) => {
    try {
      return await generate(prompt, options);
    } catch (err) {
      if (!(err instanceof AIError && err.code === 'server' && err.status >= 500)) throw err;
      const first = provider.model;
      const mainDelays = provider.retryDelays;
      provider.retryDelays = provider.fallbackRetryDelays; // the other models: fewer retries each
      try {
        for (const model of fallbacks.filter((m) => m !== first)) {
          provider.model = model;
          try {
            return await generate(prompt, options);
          } catch (e) {
            if (!(e instanceof AIError && ((e.code === 'server' && e.status >= 500) || e.code === 'not_found'))) throw e;
          }
        }
        provider.model = first;
        err.message += ` The other models (${fallbacks.join(', ')}) are not available either.`;
        throw err;
      } finally {
        provider.retryDelays = mainDelays;
      }
    }
  };
  return provider;
}
