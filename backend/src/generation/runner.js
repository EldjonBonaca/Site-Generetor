/**
 * Generation runner: for every page of the plan, asks the AI to fill the text
 * fields, validates the JSON (retrying up to 2 times) and stores the values.
 * Runs in the background; the UI polls the generation row for progress and log.
 */
import { get, run, parseJson } from '../db/index.js';
import { createProvider } from '../ai/registry.js';
import { AIError } from '../ai/AIProvider.js';
import { extractJson, validateValues } from '../ai/json.js';
import { buildPagePrompt, estimateTokens } from './prompt-builder.js';
import { loadContext, buildPages, analyzePage, buildReplacements, classifyField, siteLinks, fallbackLink } from './plan.js';
import { SITE_PROMPT } from './site-prompt.js';
import { sleep, stripHtml } from '../lib/util.js';

const CHUNK_SIZE = 45; // max fields per AI call, keeps answers reliable on long pages
const CONTENT_RETRIES = 2; // retries when the JSON is invalid/incomplete
// Waits before each retry on rate limit / timeouts / 5xx. Free tiers (e.g. Gemini 503 "high demand")
// can stay overloaded for minutes, so the last waits are long (about 5 minutes in total).
const TRANSPORT_BACKOFF_MS = [5000, 15000, 30000, 60000, 90000, 120000];
const TRANSPORT_RETRIES = TRANSPORT_BACKOFF_MS.length;
const FATAL_CODES = new Set(['auth', 'not_found', 'bad_request']);

const cancelled = new Set();
const running = new Set();
export const cancelGeneration = (id) => cancelled.add(Number(id));
export const isRunning = (id) => running.has(Number(id));

/** Hint for a link field: the text of the same button / list item. */
function linkHint(field, fields) {
  const cut = field.id.lastIndexOf('.');
  const base = field.id.slice(0, cut + 1);
  const itemPrefix = field.id.slice(cut + 1).replace(/link$/, '');
  const sibling = fields.find((f) => f.format !== 'link' && f.id.startsWith(base) && f.id.slice(cut + 1).startsWith(itemPrefix));
  return sibling ? `link of "${stripHtml(sibling.original).slice(0, 60)}"` : null;
}

/** Initial page entries (fields with original text, auto-filled contact/structural fields). */
export function initPages(ctx) {
  const replacements = buildReplacements(ctx);
  const pages = buildPages(ctx);
  return pages.map((page) => {
    const { fields, slots } = analyzePage(ctx, page);
    const state = {};
    return {
      ...page,
      status: 'pending',
      error: null,
      tokens: 0,
      slotCount: slots.length,
      fields: fields.map((f) => {
        const cls = classifyField(f, ctx, replacements, page, state);
        const service = f.card != null ? ctx.services[f.card] : null;
        const hint = [f.hint, service && `service card of "${service.name}"`, f.format === 'link' && linkHint(f, fields)].filter(Boolean).join('; ') || undefined;
        return {
          id: f.id,
          label: f.label,
          widget: f.widget,
          format: f.format,
          maxLength: f.maxLength,
          minLength: f.minLength,
          card: f.card,
          hint,
          original: f.original,
          value: cls.source === 'auto' ? cls.value : null,
          source: cls.source,
        };
      }),
      seo: { title: '', description: '', slug: page.slug },
    };
  });
}

/** Call the provider, retrying transient errors with backoff. */
async function callWithRetry(provider, prompt, options, log) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await provider.generate(prompt, options);
    } catch (err) {
      const retryable = err instanceof AIError && err.retryable;
      if (!retryable || attempt >= TRANSPORT_RETRIES) throw err;
      const wait = err.retryAfterMs || TRANSPORT_BACKOFF_MS[attempt];
      log('warn', `${err.message} Retrying in ${Math.round(wait / 1000)}s...`);
      await sleep(wait);
    }
  }
}

/**
 * Ask the AI for a set of fields of one page. Returns { values, tokens, missing }.
 * The JSON is validated; invalid/incomplete answers are retried up to CONTENT_RETRIES times.
 */
async function generateFields({ provider, ctx, page, promptRow, fields, log, extra = '' }) {
  const service = page.serviceId ? ctx.services.find((s) => s.id === page.serviceId) : null;
  const expected = fields.map((f) => f.id);
  const links = siteLinks(ctx);
  const rules = {};
  for (const f of fields) {
    if (f.format === 'link') rules[f.id] = { allowed: links.map((l) => l.url) };
    if (f.minLength) rules[f.id] = { ...(rules[f.id] || {}), minLength: f.minLength };
  }
  const collected = {};
  let tokens = 0;
  let note = '';
  let lastError = null;

  for (let attempt = 0; attempt <= CONTENT_RETRIES; attempt++) {
    const pending = fields.filter((f) => !(f.id in collected));
    const { prompt, system, vars } = buildPagePrompt({
      promptContent: promptRow.content,
      project: ctx.project,
      services: ctx.services,
      service,
      fields: pending,
      pageTitle: page.title,
      role: page.role,
      links,
      ctx,
      extra: extra + note,
    });
    const res = await callWithRetry(provider, prompt, { system, json: true, fields: pending, context: vars, links }, log);
    tokens += (res.usage?.inputTokens || estimateTokens(prompt)) + (res.usage?.outputTokens || estimateTokens(res.text));

    try {
      if (res.finishReason === 'length') {
        throw new Error('The answer was cut off (max tokens reached). Increase "max tokens" in the provider settings.');
      }
      const parsed = extractJson(res.text);
      const { values, missing, invalid } = validateValues(parsed, pending.map((f) => f.id), rules);
      Object.assign(collected, values);
      if (!missing.length) return { values: collected, tokens, missing: [] };
      lastError = new Error(`missing or invalid ${missing.length} field(s)`);
      note = invalid.length
        ? `\n- IMPORTANT: some values of your previous answer were not valid: ${invalid.join('; ')}. Return ALL the keys listed above respecting the rules.`
        : `\n- IMPORTANT: your previous answer was missing some keys. Return ALL the keys listed above.`;
      log('warn', `${page.title}: answer incomplete (${missing.length} missing field(s)), retrying (${attempt + 1}/${CONTENT_RETRIES})...`);
    } catch (err) {
      lastError = err;
      note = `\n- IMPORTANT: your previous answer could not be used (${err.message}). Reply with ONLY the JSON object.`;
      if (attempt < CONTENT_RETRIES) log('warn', `${page.title}: ${err.message} Retrying (${attempt + 1}/${CONTENT_RETRIES})...`);
    }
  }

  const missing = expected.filter((id) => !(id in collected));
  if (Object.keys(collected).length === 0) {
    throw new Error(`The AI did not return usable JSON after ${CONTENT_RETRIES + 1} attempts: ${lastError?.message}`);
  }
  return { values: collected, tokens, missing };
}

/** Fill all AI fields (+ SEO) of a page, in chunks. Mutates `page`. */
export async function generatePage({ provider, ctx, page, promptRow, log, onlyFieldIds = null }) {
  const targets = page.fields.filter((f) => (onlyFieldIds ? onlyFieldIds.includes(f.id) : f.source !== 'auto'));
  const wantSeo = !onlyFieldIds ? page.slug !== null : onlyFieldIds.some((id) => id.startsWith('_seo.'));
  const seoFields = wantSeo
    ? [
        { id: '_seo.title', format: 'text', maxLength: 60, label: 'SEO title', hint: 'SEO title of the page' },
        { id: '_seo.description', format: 'text', maxLength: 155, label: 'Meta description', hint: 'meta description of the page' },
      ].filter((f) => !onlyFieldIds || onlyFieldIds.includes(f.id))
    : [];
  const all = [...targets.map((f) => ({ ...f, original: f.original })), ...seoFields];
  if (!all.length) return;

  // Context for partial regeneration: current texts of the page.
  let extra = '';
  if (onlyFieldIds) {
    const others = page.fields
      .filter((f) => !onlyFieldIds.includes(f.id) && f.value)
      .slice(0, 30)
      .map((f) => `  · ${f.id}: "${stripHtml(f.value).replace(/\s+/g, ' ').slice(0, 120)}"`);
    if (others.length) extra = `\n- For consistency, these are the other current texts of the page (do NOT return them):\n${others.join('\n')}`;
  }

  const chunks = [];
  for (let i = 0; i < all.length; i += CHUNK_SIZE) chunks.push(all.slice(i, i + CHUNK_SIZE));

  for (const [i, chunk] of chunks.entries()) {
    const partNote = chunks.length > 1 ? `\n- This page is filled in ${chunks.length} parts; this is part ${i + 1}.` : '';
    const { values, tokens, missing } = await generateFields({ provider, ctx, page, promptRow, fields: chunk, log, extra: extra + partNote });
    page.tokens += tokens;
    for (const f of page.fields) {
      if (f.id in values) {
        f.value = values[f.id];
        f.source = 'ai';
      }
    }
    if (values['_seo.title']) page.seo.title = values['_seo.title'];
    if (values['_seo.description']) page.seo.description = values['_seo.description'];
    if (missing.length) {
      log('warn', `${page.title}: ${missing.length} field(s) not returned correctly by the AI: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}`);
      const links = siteLinks(ctx);
      for (const f of page.fields) {
        if (!missing.includes(f.id) || f.value != null) continue;
        if (f.format === 'link') {
          // Links never keep demo URLs: best guess from the demo link / button text
          f.value = fallbackLink(`${f.original} ${f.hint || ''}`, links);
          f.source = 'auto';
        } else f.source = 'original';
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

function makeLogger(state) {
  return (level, msg) => {
    state.log.push({ t: new Date().toISOString(), level, msg });
    if (state.log.length > 500) state.log.splice(0, state.log.length - 500);
  };
}

function save(id, state) {
  run(
    `UPDATE generations SET status = ?, progress = ?, log_json = ?, output_json = ?, tokens_used = ?, error = ?, updated_at = datetime('now') WHERE id = ?`,
    state.status,
    state.progress,
    JSON.stringify(state.log),
    JSON.stringify(state.output),
    state.tokens,
    state.error,
    id
  );
}

function loadState(gen) {
  return {
    status: gen.status,
    progress: gen.progress,
    log: parseJson(gen.log_json, []),
    output: parseJson(gen.output_json, { pages: [] }),
    tokens: gen.tokens_used,
    error: gen.error,
  };
}

function getProvider(providerId) {
  const row = providerId ? get('SELECT * FROM ai_providers WHERE id = ?', providerId) : null;
  if (!row) throw new Error('The AI provider of this generation no longer exists.');
  return createProvider(row);
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

/** Full generation of all pages (background job). */
export async function runGeneration(generationId, { pageKeys = null } = {}) {
  const id = Number(generationId);
  const gen = get('SELECT * FROM generations WHERE id = ?', id);
  const state = loadState(gen);
  const log = makeLogger(state);
  running.add(id);
  cancelled.delete(id);

  try {
    const ctx = loadContext(gen.project_id);
    const provider = getProvider(gen.provider_id);
    if (!state.output.pages?.length) state.output = { pages: initPages(ctx) };
    const targets = state.output.pages.filter((p) => !pageKeys || pageKeys.includes(p.key));

    state.status = 'running';
    state.error = null;
    log('info', pageKeys ? `Regenerating ${targets.map((p) => p.title).join(', ')}` : `Generation started with ${provider.constructor.label} · ${provider.model} — ${targets.length} page(s).`);
    save(id, state);

    let done = 0;
    for (const page of targets) {
      if (cancelled.has(id)) {
        log('warn', 'Generation cancelled by the user.');
        break;
      }
      page.status = 'running';
      save(id, state);
      log('info', `Generating "${page.title}" (${page.fields.filter((f) => f.source !== 'auto').length} fields)...`);
      try {
        await generatePage({ provider, ctx, page, promptRow: SITE_PROMPT, log });
        page.status = 'done';
        page.error = null;
        log('success', `"${page.title}" done (${page.tokens.toLocaleString('en')} tokens so far on this page).`);
      } catch (err) {
        page.status = 'error';
        page.error = err.message;
        log('error', `"${page.title}": ${err.message}`);
        if (err instanceof AIError && FATAL_CODES.has(err.code)) {
          state.error = err.message;
          log('error', 'Stopping: this error would repeat for every page.');
          for (const p of targets) if (p.status === 'pending' || p.status === 'running') p.status = 'error';
          break;
        }
      }
      done++;
      state.tokens = state.output.pages.reduce((sum, p) => sum + (p.tokens || 0), 0);
      state.progress = done / targets.length;
      save(id, state);
    }

    const pages = state.output.pages;
    if (cancelled.has(id)) for (const p of pages) if (p.status === 'running' || p.status === 'pending') p.status = 'pending';
    const ok = pages.filter((p) => p.status === 'done').length;
    state.status = ok === 0 ? 'failed' : 'completed';
    if (ok === 0 && !state.error) state.error = 'No page could be generated. See the log for details.';
    state.progress = 1;
    log(state.status === 'completed' ? 'success' : 'error', `Finished: ${ok}/${pages.length} page(s) generated, ${state.tokens.toLocaleString('en')} tokens used.`);
    if (ok > 0) run(`UPDATE projects SET status = 'generated', updated_at = datetime('now') WHERE id = ?`, gen.project_id);
  } catch (err) {
    state.status = 'failed';
    state.error = err.message;
    log('error', err.message);
  } finally {
    save(id, state);
    running.delete(id);
    cancelled.delete(id);
  }
}

/** Regenerate a single field (synchronous: awaited by the HTTP request). */
export async function regenerateField(generationId, pageKey, fieldId) {
  const gen = get('SELECT * FROM generations WHERE id = ?', generationId);
  const state = loadState(gen);
  const log = makeLogger(state);
  const page = state.output.pages.find((p) => p.key === pageKey);
  if (!page) throw new Error('Page not found in this generation.');
  const isSeo = fieldId.startsWith('_seo.');
  if (!isSeo && !page.fields.some((f) => f.id === fieldId)) throw new Error('Field not found.');

  const ctx = loadContext(gen.project_id);
  const provider = getProvider(gen.provider_id);
  const before = page.tokens;
  log('info', `Regenerating field ${fieldId} of "${page.title}"...`);
  await generatePage({ provider, ctx, page, promptRow: SITE_PROMPT, log, onlyFieldIds: [fieldId] });
  state.tokens += page.tokens - before;
  log('success', `Field ${fieldId} regenerated.`);
  save(generationId, state);
  return page;
}
