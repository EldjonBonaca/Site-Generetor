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
import { loadContext, buildPages, analyzePage, classifyField, siteLinks, fallbackLink } from './plan.js';
import { sitePromptFor } from './site-prompt.js';
import { sleep, stripHtml } from '../lib/util.js';
import { believableFigure } from '../templates/spec.js';

const CHUNK_SIZE = 45; // max fields per AI call, keeps answers reliable on long pages
const CONTENT_RETRIES = 2; // retries when the JSON is invalid/incomplete
const TRANSPORT_RETRIES = 3; // retries on rate limit / timeouts / 5xx
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

/**
 * Initial page entries. Fields filled by the template builder are 'auto'. A text that appears on
 * several pages (the 3 reviews of Home and About) is written by the AI on the first page only: the
 * other copies are 'shared' and always show the value of that first field (sharedFrom).
 */
export function initPages(ctx) {
  const pages = buildPages(ctx);
  const owners = new Map(); // share key -> { page, field }
  return pages.map((page) => {
    const { fields, slots } = analyzePage(ctx, page);
    return {
      ...page,
      status: 'pending',
      error: null,
      tokens: 0,
      slotCount: slots.length,
      fields: fields.map((f) => {
        const cls = classifyField(f);
        const hint = [f.hint, f.format === 'link' && linkHint(f, fields)].filter(Boolean).join('; ') || undefined;
        const entry = {
          id: f.id,
          label: f.label,
          widget: f.widget,
          format: f.format,
          maxLength: f.maxLength,
          minLength: f.minLength,
          hint,
          original: f.original,
          value: cls.source === 'auto' ? cls.value : null,
          source: cls.source,
          // Key figures (fixKeyFigures): the figure and its label are paired by these
          ...(f.share ? { share: f.share } : {}),
          ...(f.widget === 'counter' ? { key: f.key, ref: f.ref } : {}),
        };
        if (f.share && cls.source === 'ai') {
          const owner = owners.get(f.share);
          if (owner) Object.assign(entry, { source: 'shared', sharedFrom: { page: owner.page, field: owner.field } });
          else owners.set(f.share, { page: page.key, field: f.id });
        }
        return entry;
      }),
      seo: { keyphrase: '', title: '', description: '', slug: page.slug },
    };
  });
}

/** Current value of a field, following 'shared' fields to the field they copy. */
export function fieldValue(pages, field) {
  if (field.source !== 'shared') return field.value;
  const owner = pages.find((p) => p.key === field.sharedFrom.page)?.fields.find((f) => f.id === field.sharedFrom.field);
  return owner ? owner.value : null;
}

/** Call the provider, retrying transient errors with backoff. */
async function callWithRetry(provider, prompt, options, log) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await provider.generate(prompt, options);
    } catch (err) {
      const retryable = err instanceof AIError && err.retryable;
      if (!retryable || attempt >= TRANSPORT_RETRIES) throw err;
      const wait = err.retryAfterMs || [2000, 6000, 15000][attempt];
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
    if (f.format === 'number') rules[f.id] = { ...(rules[f.id] || {}), number: true };
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
export async function generatePage({ provider, ctx, page, promptRow, log, onlyFieldIds = null, usedKeyphrases = [], related = '' }) {
  const targets = page.fields.filter((f) => f.source !== 'shared' && (onlyFieldIds ? onlyFieldIds.includes(f.id) : f.source !== 'auto'));
  const wantSeo = !onlyFieldIds ? page.slug !== null : onlyFieldIds.some((id) => id.startsWith('_seo.'));
  const seoFields = wantSeo
    ? [
        { id: '_seo.keyphrase', format: 'text', maxLength: 60, label: 'Focus keyphrase', hint: 'Yoast SEO focus keyphrase: the 2–4 word search people type to find this page (main word of the page + service or business type + city), different on every page' },
        { id: '_seo.title', format: 'text', maxLength: 60, label: 'SEO title', hint: 'SEO title of the page: starts with the exact focus keyphrase, 40–60 characters' },
        { id: '_seo.description', format: 'text', maxLength: 156, minLength: 120, label: 'Meta description', hint: 'meta description of the page, 120–156 characters: contains the exact focus keyphrase once' },
      ].filter((f) => !onlyFieldIds || onlyFieldIds.includes(f.id))
    : [];
  // SEO first: the focus keyphrase is decided with the first texts of the page (banner sentence, titles),
  // and the following parts are told to use it
  const all = [...seoFields, ...targets.map((f) => ({ ...f, original: f.original }))];
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
    // Yoast flags a focus keyphrase already used by another page of the site
    const used = chunk.some((f) => f.id === '_seo.keyphrase') && usedKeyphrases.length ? `\n- Focus keyphrases already used by other pages of the site (choose a different one): ${usedKeyphrases.map((k) => `"${k}"`).join(', ')}.` : '';
    const keyphrase = !chunk.some((f) => f.id === '_seo.keyphrase') && page.seo?.keyphrase ? `\n- The focus keyphrase of this page is "${page.seo.keyphrase}": use it exactly as the SEO rules below say (subheadings, first sentence of the long texts).` : '';
    const { values, tokens, missing } = await generateFields({ provider, ctx, page, promptRow, fields: chunk, log, extra: extra + related + partNote + used + keyphrase });
    page.tokens += tokens;
    for (const f of page.fields) {
      if (f.id in values) {
        f.value = values[f.id];
        f.source = 'ai';
      }
    }
    if (values['_seo.keyphrase']) page.seo.keyphrase = values['_seo.keyphrase'];
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
  const fixed = fixKeyFigures(page);
  if (fixed) log('warn', `${page.title}: ${fixed} key figure(s) not believable (e.g. too many years of experience) corrected: check them with the client.`);
}

/**
 * Key figures written by the AI made believable (believableFigure: e.g. 1200 years of experience -> 25). Pairs: the figures of the templates (shared keys
 * statN.value / statN.label) and the counters of Template Kits (ending_number + title of one widget).
 * Returns the number of figures corrected.
 */
export function fixKeyFigures(page) {
  const pairs = [];
  const byShare = new Map(page.fields.filter((f) => f.share && f.source !== 'shared').map((f) => [f.share, f]));
  for (const [share, value] of byShare) {
    const m = /^(stat\d+)\.value$/.exec(share);
    if (m && byShare.get(`${m[1]}.label`)) pairs.push([value, byShare.get(`${m[1]}.label`)]);
  }
  const elOf = (f) => String(f.ref || '').split(':')[0];
  for (const n of page.fields.filter((f) => f.widget === 'counter' && f.key === 'ending_number')) {
    const title = page.fields.find((f) => f.widget === 'counter' && f.key === 'title' && elOf(f) === elOf(n));
    if (title) pairs.push([n, title]);
  }
  let fixed = 0;
  for (const [valueField, labelField] of pairs) {
    const better = believableFigure(valueField.value, labelField.value ?? labelField.original, valueField.format === 'number');
    if (better === null) continue;
    valueField.value = better;
    fixed++;
  }
  return fixed;
}

/** Texts of the About page (the presentation of the business) given to the AI, at most this many characters. */
const ABOUT_CONTEXT = 1500;

/**
 * Texts of other pages the AI needs for a page: the Contact page presents the business in the words
 * of the About page (already written: the pages are generated in menu order).
 */
export function relatedContext(pages, page) {
  if (page.role !== 'contact') return '';
  const about = pages.find((p) => p.role === 'about');
  const texts = (about?.fields || [])
    .map((f) => fieldValue(pages, f))
    .filter((v) => typeof v === 'string')
    .map((v) => stripHtml(v).replace(/\s+/g, ' ').trim())
    .filter((v) => v.length > 80);
  if (!texts.length) return '';
  return `\n- Presentation of the business written on the About page of this site: "${texts.join(' ').slice(0, ABOUT_CONTEXT)}". The introduction text of this Contact page takes a short part of it (who we are, experience, what makes the business special) in other words, then invites to get in touch: no generic invitation.`;
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
      log('info', `Generating "${page.title}" (${page.fields.filter((f) => f.source !== 'auto' && f.source !== 'shared').length} fields)...`);
      try {
        const usedKeyphrases = state.output.pages.filter((p) => p !== page && p.seo?.keyphrase).map((p) => p.seo.keyphrase);
        await generatePage({ provider, ctx, page, promptRow: sitePromptFor(ctx), log, usedKeyphrases, related: relatedContext(state.output.pages, page) });
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
  const target = page.fields.find((f) => f.id === fieldId);
  if (!isSeo && !target) throw new Error('Field not found.');
  if (target?.source === 'shared') throw new Error('This text is the same as on another page: regenerate it there.');

  const ctx = loadContext(gen.project_id);
  const provider = getProvider(gen.provider_id);
  const before = page.tokens;
  log('info', `Regenerating field ${fieldId} of "${page.title}"...`);
  const usedKeyphrases = state.output.pages.filter((p) => p !== page && p.seo?.keyphrase).map((p) => p.seo.keyphrase);
  await generatePage({ provider, ctx, page, promptRow: sitePromptFor(ctx), log, onlyFieldIds: [fieldId], usedKeyphrases, related: relatedContext(state.output.pages, page) });
  state.tokens += page.tokens - before;
  log('success', `Field ${fieldId} regenerated.`);
  save(generationId, state);
  return page;
}
