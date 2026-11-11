/**
 * Names of the services as typed by the user, tidied before the site is written: the first letter
 * uppercase, and the spelling mistakes corrected by the AI (typing errors, missing accents). The name is
 * the title of the article, the item of the services menu and the base of its address, so it is fixed
 * once, in the project, before the pages are planned.
 *
 * The AI may only correct: an answer that changes a name too much (another wording, added or removed
 * words) is ignored for that name.
 */
import { all, get, run } from '../db/index.js';
import { extractJson } from '../ai/json.js';
import { slugify } from '../lib/util.js';
import { languageName } from './prompt-builder.js';

/** First letter uppercase when the name starts with a lowercase letter (the rest as typed: acronyms and brand names keep their capitals). */
export function capitalizeFirst(name) {
  const s = String(name ?? '').trim().replace(/\s+/g, ' ');
  // A name starting with a figure ("24h pronto intervento") stays as typed
  return /^\p{Ll}/u.test(s) ? s[0].toLocaleUpperCase() + s.slice(1) : s;
}

const plain = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function distance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length];
}

/**
 * Is `fixed` the same name as `original` with only its spelling corrected? Same number of words, and
 * few letters changed (accents and capitals do not count): at most 2, or a quarter of the name.
 */
export function isSpellingFix(original, fixed) {
  const a = plain(original).trim();
  const b = plain(fixed).trim();
  if (!b || fixed.length > 200 || /[<>{}\[\]]/.test(fixed)) return false;
  if (a.split(/\s+/).length !== b.split(/\s+/).length) return false;
  return distance(a, b) <= Math.max(2, Math.floor(a.length / 4));
}

export function buildNamesPrompt(project, services) {
  const language = languageName(project.language);
  return {
    system: 'You are a careful proofreader. You always answer with a single valid JSON object exactly as requested, without any extra text.',
    prompt: `These are the names of the services of a business${project.industry ? ` (${project.industry})` : ''}, typed by hand in ${language}. Correct ONLY spelling and typing mistakes (wrong, missing or swapped letters, missing accents and apostrophes).

Rules:
- Do not rephrase, translate, shorten or extend a name: same words, same order, same number of words.
- A name that is already correct is returned exactly as it is.
- Keep acronyms and brand names as typed. Start each name with a capital letter; do not capitalize the other words unless the language requires it.

Names (JSON, key -> name):
${JSON.stringify(Object.fromEntries(services.map((s) => [`s${s.id}`, s.name])), null, 1)}

Answer with one JSON object with the same keys and the corrected names as values.`,
  };
}

const uniqueSlug = (projectId, wanted, exceptId) => {
  const base = slugify(wanted) || 'service';
  let slug = base;
  for (let n = 2; get('SELECT id FROM services WHERE project_id = ? AND slug = ? AND id IS NOT ?', projectId, slug, exceptId); n++) slug = `${base}-${n}`;
  return slug;
};

/**
 * Tidy the service names of a project (saved in the project). `generate(prompt, options)` calls the AI;
 * when it fails, or without it, the names only get their capital letter.
 * @returns {{ id: number, from: string, to: string }[]} the names changed
 */
export async function tidyServiceNames(projectId, project, generate = null) {
  const services = all('SELECT * FROM services WHERE project_id = ? ORDER BY position, id', projectId).filter((s) => s.name?.trim());
  if (!services.length) return [];
  let answer = {};
  if (generate) {
    try {
      const { prompt, system } = buildNamesPrompt(project, services);
      const res = await generate(prompt, { system, json: true, task: 'service-names', context: { names: services.map((s) => s.name) } });
      answer = extractJson(res.text) || {};
    } catch {
      answer = {}; // the names stay as typed (with their capital letter)
    }
  }
  const changed = [];
  for (const s of services) {
    const proposed = typeof answer[`s${s.id}`] === 'string' ? answer[`s${s.id}`].trim().replace(/\s+/g, ' ') : '';
    const name = capitalizeFirst(proposed && isSpellingFix(s.name, proposed) ? proposed : s.name);
    if (name === s.name) continue;
    // An address still made from the name follows it; one typed by the user stays
    const automatic = s.slug === uniqueSlug(projectId, s.name, s.id);
    run('UPDATE services SET name = ?, slug = ? WHERE id = ?', name, automatic ? uniqueSlug(projectId, name, s.id) : s.slug, s.id);
    changed.push({ id: s.id, from: s.name, to: name });
  }
  if (changed.length) run("UPDATE projects SET updated_at = datetime('now') WHERE id = ?", projectId);
  return changed;
}
