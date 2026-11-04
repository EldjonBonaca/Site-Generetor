/**
 * Industry analysis of a category: before designing its templates, the AI reads the category name
 * (and description) and describes the business, its customers, typical services, the design
 * conventions of the websites of that industry, trust signals, the Home sections that suit it and
 * the design directions that fit it (db/prompts/analisi-categoria-it.md).
 *
 * The profile is saved on the category (template_categories.profile_json) and used by every
 * template generation of the category: the direction is chosen among the suitable ones, the
 * optional Home sections among the recommended ones, and the conventions are given to the AI as
 * inspiration. The AI uses its own knowledge of the industry (it does not browse the web).
 */
import { extractJson } from '../ai/json.js';
import { AIError } from '../ai/AIProvider.js';
import { estimateTokens } from '../generation/prompt-builder.js';
import { INDUSTRY_PROMPT } from '../generation/site-prompt.js';
import { LAYOUTS, OPTIONAL_SECTIONS, REQUIRED_SECTIONS, SECTION_NAMES_IT, STYLE_OPTIONS, sanitizeSections } from './spec.js';
import { DIRECTIONS } from './directions.js';

const RETRIES = 2;

/** Directions that suit most industries, used to complete a short list of suitable ones. */
const VERSATILE = ['corporate', 'minimal', 'technical', 'natural', 'editorial', 'bold', 'friendly', 'premium', 'industrial'];

const SYSTEM = 'You are a senior web designer and marketing consultant. You always answer with a single valid JSON object exactly as requested, without any extra text.';

const text = (v, max) => (typeof v === 'string' ? v.replace(/<[^>]*>/g, '').trim().slice(0, max) : '');
const texts = (v, n, max) => (Array.isArray(v) ? v.map((x) => text(x, max)).filter(Boolean).slice(0, n) : []);
const hex = (v) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim().toUpperCase() : '');

/**
 * Visual choices the analysis may prefer for the industry (the planner favours them when the
 * direction allows them, while still keeping the templates of the category different).
 */
export const PREFERABLE = {
  style: ['theme', 'buttons', 'images', 'photoTone', 'decor', 'highlight'],
  layout: ['header', 'hero', 'about', 'features', 'services', 'testimonials', 'homeGallery', 'cta'],
};

/** Preferred values of the industry: { style: { key: [values] }, layout: { key: [values] } }, only known values. */
function sanitizePrefer(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const out = { style: {}, layout: {} };
  for (const [group, keys] of Object.entries(PREFERABLE)) {
    const allowed = group === 'style' ? STYLE_OPTIONS : LAYOUTS;
    for (const key of keys) {
      const v = r[group]?.[key] ?? r[key];
      const values = [...new Set((Array.isArray(v) ? v : [v]).map(String).filter((x) => allowed[key].includes(x)))].slice(0, 3);
      if (values.length) out[group][key] = values;
    }
  }
  return out;
}

/** Palettes typical of the industry: [{ name, primary, secondary, dark }], valid colors only. */
function sanitizePalettes(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map((p) => ({ name: text(p?.name, 40), primary: hex(p?.primary), secondary: hex(p?.secondary), dark: hex(p?.dark) }))
    .filter((p) => p.primary && p.secondary)
    .slice(0, 5);
}

/** Make any AI answer a usable profile. */
export function sanitizeProfile(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const ids = DIRECTIONS.map((d) => d.id);
  const directions = [...new Set((Array.isArray(r.directions) ? r.directions : []).map(String).filter((d) => ids.includes(d)))];
  // At least 5 directions, so that 5 templates of the category never share one (the most versatile ones complete the list)
  for (const id of VERSATILE) if (directions.length < 5 && !directions.includes(id)) directions.push(id);
  return {
    business: text(r.business, 400),
    audience: text(r.audience, 400),
    services: texts(r.services, 10, 80),
    conventions: texts(r.conventions, 10, 240),
    trust: texts(r.trust, 8, 120),
    palette: text(r.palette, 300),
    imagery: text(r.imagery, 300),
    tone: text(r.tone, 200),
    palettes: sanitizePalettes(r.palettes),
    motifs: texts(r.motifs, 6, 200),
    avoid: texts(r.avoid, 6, 160),
    prefer: sanitizePrefer(r.prefer),
    sections: sanitizeSections(r.sections),
    directions,
  };
}

function technicalInstructions() {
  return `

=== OUTPUT FORMAT (added automatically by the generator) ===
Reply with ONLY one valid JSON object (no markdown, no code fences, no text before or after it), written in Italian, with this shape:
{
  "business": "what the businesses of the category do (2–3 sentences)",
  "audience": "who their customers are and what they look for (2–3 sentences)",
  "services": ["up to 10 typical services"],
  "conventions": ["5–8 design conventions of the websites of this industry: hero, photos, icons, colors, typography, calls to action…"],
  "trust": ["4–6 trust signals the customers look for"],
  "palette": "colors typical of the industry, and colors to avoid",
  "imagery": "kind of photos and icons that work for the industry",
  "tone": "tone of voice typical of the industry",
  "palettes": [4 × { "name": "short evocative name", "primary": "#RRGGBB", "secondary": "#RRGGBB", "dark": "#RRGGBB" }],
  "motifs": ["4–6 distinctive visual and narrative ideas that make a site feel made for THIS industry (subjects of the photos, details, words, atmosphere)"],
  "avoid": ["3–5 clichés and mistakes of the websites of this industry that make them look cheap or generic"],
  "prefer": { "style": { ${PREFERABLE.style.map((k) => `"${k}": [1–2 values]`).join(', ')} }, "layout": { ${PREFERABLE.layout.map((k) => `"${k}": [1–3 values]`).join(', ')} } },
  "sections": ["ordered ids of the Home sections after the hero"],
  "directions": ["3–6 ids of the design directions that suit the industry, best first"]
}
Palettes: 4 elegant, clearly different palettes credible for the industry (e.g. one classic, one modern, one warm, one bold): a primary deep enough for white text, a secondary that makes it stand out for buttons and details, a very deep "dark" of the same mood. Harmonious and refined, never garish.
"prefer": the visual choices that suit the industry best, only among these values:
${PREFERABLE.style.map((k) => `- style.${k}: ${STYLE_OPTIONS[k].join(', ')}`).join('\n')}
${PREFERABLE.layout.map((k) => `- layout.${k}: ${LAYOUTS[k].join(', ')}`).join('\n')}
(photoTone: natural colors, mono = black and white, duotone = brand colors, faded; hero: center/left text over a photo, split = text beside the photo, card = text in a card over the photo, bottom = text at the bottom of a full photo, editorial = large title beside a tall photo, slideshow = several photos, color = text on the brand color with a framed photo.)
Section ids: required (always include them) ${REQUIRED_SECTIONS.map((s) => `"${s}" (${SECTION_NAMES_IT[s]})`).join(', ')}; optional ${OPTIONAL_SECTIONS.map((s) => `"${s}" (${SECTION_NAMES_IT[s]})`).join(', ')}.
Design directions (id: description):
${DIRECTIONS.map((d) => `- ${d.id}: ${d.brief}`).join('\n')}`;
}

export function buildProfilePrompt(category) {
  const vars = { CATEGORIA: category.name, DESCRIZIONE_CATEGORIA: category.description?.trim() || '(nessuna)' };
  const body = INDUSTRY_PROMPT.content.replace(/\{\{\s*([A-Z_]+)\s*\}\}/g, (m, name) => (name in vars ? vars[name] : m));
  return { prompt: body + technicalInstructions(), system: SYSTEM };
}

/** Ask the provider for the industry profile of a category. @returns {Promise<{ profile, tokens }>} */
export async function analyzeCategory(provider, category) {
  const { prompt, system } = buildProfilePrompt(category);
  let tokens = 0;
  let note = '';
  let lastError = null;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    const res = await provider.generate(prompt + note, { system, json: true, task: 'industry', context: { category: category.name } });
    tokens += (res.usage?.inputTokens || estimateTokens(prompt)) + (res.usage?.outputTokens || estimateTokens(res.text));
    try {
      if (res.finishReason === 'length') throw new Error('The answer was cut off (max tokens reached). Increase "max tokens" in the provider settings.');
      const parsed = extractJson(res.text);
      if (!parsed.business && !parsed.conventions) throw new Error('The JSON does not contain "business" or "conventions".');
      return { profile: sanitizeProfile(parsed), tokens };
    } catch (err) {
      lastError = err;
      note = `\n\nIMPORTANT: your previous answer could not be used (${err.message}). Reply with ONLY the JSON object.`;
    }
  }
  throw new AIError('invalid_output', `The AI did not return a usable analysis of the category after ${RETRIES + 1} attempts: ${lastError?.message}`);
}

/** Italian description of the profile for the template prompt. */
export function describeProfile(profile) {
  if (!profile) return '';
  const list = (items) => items.map((x) => `- ${x}`).join('\n');
  return [
    profile.business && `Attività: ${profile.business}`,
    profile.audience && `Clienti: ${profile.audience}`,
    profile.services.length && `Servizi tipici: ${profile.services.join(', ')}.`,
    profile.conventions.length && `Convenzioni di design dei siti del settore:\n${list(profile.conventions)}`,
    profile.trust.length && `Elementi di fiducia: ${profile.trust.join('; ')}.`,
    profile.palette && `Colori del settore: ${profile.palette}`,
    profile.imagery && `Immagini e icone: ${profile.imagery}`,
    profile.tone && `Tono tipico: ${profile.tone}`,
    profile.motifs?.length && `Idee distintive del settore (usale nei testi, nella descrizione e nelle scelte di colore):\n${list(profile.motifs)}`,
    profile.avoid?.length && `Da evitare (cliché che rendono il sito economico o generico):\n${list(profile.avoid)}`,
  ]
    .filter(Boolean)
    .join('\n');
}
