/**
 * Robust extraction/validation of the JSON object returned by the AI.
 */

/** Pull the first JSON object out of a model reply (handles ```json fences and chatter). */
export function extractJson(text) {
  let s = String(text || '').trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('No JSON object found in the AI response.');
  s = s.slice(start, end + 1);
  try {
    return JSON.parse(s);
  } catch (err) {
    // Common model mistake: trailing commas
    try {
      return JSON.parse(s.replace(/,\s*([}\]])/g, '$1'));
    } catch {
      throw new Error(`The AI response is not valid JSON (${err.message}).`);
    }
  }
}

/** Flatten { home: { hero: { title: "x" } } } into { "home.hero.title": "x" }. */
function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

/** Normalize an internal URL for comparison: "/chi-siamo" == "/chi-siamo/". */
export const normalizeUrl = (u) => {
  const s = String(u || '').trim();
  if (/^(tel:|mailto:|#|https?:)/i.test(s) || s === '/') return s;
  return s.startsWith('/') ? s.replace(/\/?$/, '/') : s;
};

/**
 * Keep only expected keys, coerce values to strings.
 * `rules[id]` may contain { allowed: string[] } (link fields) and/or { minLength } (plain-text length).
 * Values breaking a rule are reported in `invalid` (and treated as missing).
 * @returns {{ values: Record<string,string>, missing: string[], invalid: string[] }}
 */
export function validateValues(parsed, expectedIds, rules = {}) {
  const res = validateShape(parsed, expectedIds);
  const invalid = [];
  for (const [id, v] of Object.entries(res.values)) {
    const r = rules[id];
    if (!r) continue;
    if (r.allowed) {
      const match = r.allowed.find((a) => normalizeUrl(a) === normalizeUrl(v));
      if (match) res.values[id] = match;
      else invalid.push(`${id} (URL "${v}" is not one of the allowed URLs)`);
    }
    if (r.minLength && v.replace(/<[^>]+>/g, '').trim().length < r.minLength) invalid.push(`${id} (shorter than ${r.minLength} characters)`);
  }
  for (const item of invalid) {
    const id = item.split(' ')[0];
    delete res.values[id];
    res.missing.push(id);
  }
  return { ...res, invalid };
}

function validateShape(parsed, expectedIds) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('The AI response must be a JSON object of "field id": "text" pairs.');
  }
  // Some models wrap the answer: { "fields": { ... } }
  const candidate = parsed.fields && typeof parsed.fields === 'object' && !Array.isArray(parsed.fields) ? parsed.fields : parsed;
  const direct = { ...candidate };
  const flat = flatten(candidate);
  const values = {};
  const missing = [];
  for (const id of expectedIds) {
    let v = id in direct ? direct[id] : flat[id];
    if (Array.isArray(v)) v = v.join('\n');
    if (typeof v === 'number' || typeof v === 'boolean') v = String(v);
    if (typeof v === 'string' && v.trim() !== '') values[id] = v.trim();
    else missing.push(id);
  }
  return { values, missing };
}
