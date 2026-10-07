/**
 * AI provider accounts. API keys are encrypted at rest and NEVER returned:
 * the frontend only sees a masked hint (sk-...abcd).
 */
import { Router } from 'express';
import { all, get, run, parseJson } from '../db/index.js';
import { encrypt, maskKey } from '../lib/crypto.js';
import { badRequest, notFound } from '../lib/util.js';
import { listProviderTypes, getAdapter, createProvider } from '../ai/registry.js';
import { AIError } from '../ai/AIProvider.js';

const router = Router();

function serialize(row) {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    key_hint: row.key_hint,
    has_key: Boolean(row.encrypted_api_key),
    base_url: row.base_url,
    model: row.model,
    models: parseJson(row.models_json, []),
    temperature: row.temperature,
    max_tokens: row.max_tokens,
    created_at: row.created_at,
  };
}

/** Validate a create/update payload. `existing` is the current row on update. */
function validate(body, existing = null) {
  const type = existing?.type || String(body.type || '');
  const Adapter = getAdapter(type);
  if (!Adapter) throw badRequest(`Unknown provider type "${type}"`);
  const name = String(body.name ?? existing?.name ?? Adapter.label).trim().slice(0, 100) || Adapter.label;
  const apiKey = typeof body.api_key === 'string' ? body.api_key.trim() : '';
  if (Adapter.requiresKey && !apiKey && !existing?.encrypted_api_key) throw badRequest('API key is required');
  const baseUrl = String(body.base_url ?? existing?.base_url ?? '').trim();
  if (Adapter.requiresBaseUrl && !baseUrl) throw badRequest('Base URL is required for this provider');
  if (baseUrl && !/^https?:\/\//i.test(baseUrl)) throw badRequest('Base URL must start with http:// or https://');
  const models = Array.isArray(body.models)
    ? [...new Set(body.models.map((m) => String(m).trim()).filter(Boolean))].slice(0, 50)
    : [...parseJson(existing?.models_json, Adapter.defaultModels)];
  const model = String(body.model ?? existing?.model ?? models[0] ?? '').trim();
  if (!model) throw badRequest('Model is required');
  const temperature = Number(body.temperature ?? existing?.temperature ?? 0.7);
  if (!(temperature >= 0 && temperature <= 2)) throw badRequest('Temperature must be between 0 and 2');
  const maxTokens = Math.round(Number(body.max_tokens ?? existing?.max_tokens ?? 8192));
  if (!(maxTokens >= 16 && maxTokens <= 200000)) throw badRequest('Max tokens must be between 16 and 200000');
  if (!models.includes(model)) models.unshift(model);
  return { type, name, apiKey, baseUrl, models, model, temperature, maxTokens };
}

/** Readable error for the "Test connection" button. */
function testError(err) {
  return { ok: false, code: err instanceof AIError ? err.code : 'error', error: err.message };
}

router.get('/providers/types', (req, res) => res.json(listProviderTypes()));

router.get('/providers', (req, res) => res.json(all('SELECT * FROM ai_providers ORDER BY id').map(serialize)));

router.post('/providers', (req, res) => {
  const v = validate(req.body || {});
  const { lastInsertRowid } = run(
    `INSERT INTO ai_providers (type, name, encrypted_api_key, key_hint, base_url, model, models_json, temperature, max_tokens)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    v.type, v.name, encrypt(v.apiKey), maskKey(v.apiKey), v.baseUrl, v.model, JSON.stringify(v.models), v.temperature, v.maxTokens
  );
  res.status(201).json(serialize(get('SELECT * FROM ai_providers WHERE id = ?', lastInsertRowid)));
});

router.patch('/providers/:id', (req, res) => {
  const row = get('SELECT * FROM ai_providers WHERE id = ?', req.params.id);
  if (!row) throw notFound('Provider');
  const v = validate(req.body || {}, row);
  // Key only replaced when a new one is typed
  const encrypted = v.apiKey ? encrypt(v.apiKey) : row.encrypted_api_key;
  const hint = v.apiKey ? maskKey(v.apiKey) : row.key_hint;
  run(
    `UPDATE ai_providers SET name = ?, encrypted_api_key = ?, key_hint = ?, base_url = ?, model = ?, models_json = ?, temperature = ?, max_tokens = ? WHERE id = ?`,
    v.name, encrypted, hint, v.baseUrl, v.model, JSON.stringify(v.models), v.temperature, v.maxTokens, row.id
  );
  res.json(serialize(get('SELECT * FROM ai_providers WHERE id = ?', row.id)));
});

router.delete('/providers/:id', (req, res) => {
  run('DELETE FROM ai_providers WHERE id = ?', req.params.id);
  res.status(204).end();
});

/** Test a saved provider. Optional body.model to test another model of the list. */
router.post('/providers/:id/test', async (req, res) => {
  const row = get('SELECT * FROM ai_providers WHERE id = ?', req.params.id);
  if (!row) throw notFound('Provider');
  try {
    const provider = createProvider({ ...row, model: req.body?.model || row.model });
    res.json(await provider.testConnection());
  } catch (err) {
    res.json(testError(err));
  }
});

/** Test an unsaved configuration (from the form, before saving). */
router.post('/providers/test', async (req, res) => {
  try {
    const v = validate(req.body || {});
    const Adapter = getAdapter(v.type);
    const provider = new Adapter({ apiKey: v.apiKey, baseUrl: v.baseUrl, model: v.model, temperature: v.temperature, maxTokens: v.maxTokens, timeoutMs: 60000 });
    res.json(await provider.testConnection());
  } catch (err) {
    res.json(testError(err));
  }
});

export default router;
