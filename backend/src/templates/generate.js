/**
 * AI generation of a category template: the built-in template prompt
 * (db/prompts/template-categoria-it.md) + the design direction chosen by the generator
 * (directions.js) + technical instructions describing the JSON answer.
 *
 * Variety between the templates of a category is guaranteed by the system, not left to the AI:
 * the direction, fonts, look and layouts are chosen among the ones the other templates of the
 * category use least, and the AI is told which palettes are already taken (an answer whose primary
 * color is of the same family as another template is asked again once).
 * The answer is sanitized (spec.js), so any usable JSON becomes a valid template.
 */
import { extractJson } from '../ai/json.js';
import { AIError } from '../ai/AIProvider.js';
import { estimateTokens, languageName } from '../generation/prompt-builder.js';
import { TEMPLATE_PROMPT } from '../generation/site-prompt.js';
import { COLOR_KEYS, COPY_KEYS, ICONS, MAX_FEATURES, SECTION_NAMES_IT, sanitizeSpec, similarColor } from './spec.js';
import { applyPlan, designPlan, pickDirection } from './directions.js';
import { describeProfile } from './industry.js';

const RETRIES = 2;

export const TEMPLATE_SYSTEM_PROMPT =
  'You are a senior web designer working inside an automated Elementor site generator. ' +
  'You always answer with a single valid JSON object exactly as requested, without any extra text.';

const LOOK_LABELS = {
  theme: 'page theme',
  buttons: 'button corners',
  cards: 'card style',
  titles: 'section title style',
  align: 'title alignment',
  scale: 'title size',
  images: 'image style',
  titleCase: 'title case',
  kicker: 'label above the titles',
  fill: 'colored bands',
  motion: 'entrance animation',
  hover: 'card hover effect',
  edges: 'shaped edges',
  rhythm: 'section backgrounds',
  highlight: 'highlighted last word of the titles',
  decor: 'signature detail',
  photoTone: 'photo treatment',
  photoRatio: 'proportion of the main photos',
};

/** Design direction block: what the generator decided and what the AI must avoid. */
function directionInstructions(category, direction, plan, existing, avoidColors, profile, library = []) {
  const st = plan.style;
  const look = Object.entries(LOOK_LABELS)
    .map(([k, label]) => `${label} "${st[k]}"`)
    .join(', ');
  const layout = Object.entries(plan.layout)
    .map(([k, v]) => `${k} "${v}"`)
    .join(', ');
  const others = existing.length
    ? `\nOther templates of this category — your design must look clearly different from each of them:\n${existing
        .map((s) => `- ${s.name ? `"${s.name}": ` : ''}direction "${s.direction || 'unknown'}", primary ${s.style.colors.primary}, secondary ${s.style.colors.secondary}, dark ${s.style.colors.dark}, fonts ${s.style.fonts.heading} / ${s.style.fonts.body}`)
        .join('\n')}`
    : '';
  const taken = [...new Set([...existing.map((s) => s.style.colors.primary), ...avoidColors])];
  const colors = taken.length
    ? `\nPrimary colors already taken in this category: ${taken.join(', ')}. Choose a "primary" of a clearly different color family (hue at least 40° away, or a neutral if they are all colorful), and a "secondary" that is different too — while staying credible for "${category.name}".`
    : '';
  // Palettes of the other categories: a soft hint, so the library does not look all the same
  const elsewhere = [...new Set(library.map((s) => s.style?.colors?.primary).filter(Boolean))].slice(0, 12);
  const libraryColors = elsewhere.length ? `\nPrimary colors of templates of other categories (prefer a different one when it is credible for "${category.name}"): ${elsewhere.join(', ')}.` : '';
  const industry = profile
    ? `

=== INDUSTRY ANALYSIS OF THE CATEGORY (use it as inspiration: follow the conventions of the industry, with an original visual identity) ===
${describeProfile(profile)}`
    : '';
  const sections = plan.sections.map((x) => `"${x}" (${SECTION_NAMES_IT[x]})`).join(', ');
  return `${industry}

=== DESIGN DIRECTION (chosen by the generator: every template of a category gets a different visual identity) ===
Direction: "${direction.name}" — ${direction.brief}
Palette mood: ${direction.palette}. The palette must suit the category "${category.name}"; the user's style instructions (if any) refine it.
Already decided by the generator, do not change: fonts ${plan.fonts.heading} (titles) / ${plan.fonts.body} (texts), ${look}, corner radius ${st.radius}px, spacing "${st.spacing}", title weight ${st.headingWeight}; layout of the sections: ${layout}.
Sections of the Home page after the hero, in this order: ${sections}.${
    st.theme === 'dark'
      ? '\nTheme "dark": the pages have a dark background ("dark" color, keep it very deep) with white texts; "heading" and "text" are only used on white elements (contact form), keep them dark.'
      : ''
  }${others}${colors}${libraryColors}
Write the "description" of the concept and the "tone" so that they match this direction.${signatureInstructions(plan.signatures)}`;
}

/** What each signature detail looks like on the site (the AI chooses one to express its concept). */
const SIGNATURE_LABELS = {
  none: 'no signature detail: the design speaks through its layouts and colors alone',
  numbers: 'large outlined numbers (01, 02, 03…) above the titles of the sections, like the chapters of a magazine',
  tilted: 'the main photos slightly tilted, as if laid on the page, straightening under the mouse',
  vertical: 'the small labels of the section titles written vertically beside them',
  stamp: 'a round stamp with the business name, slowly turning in a corner of the hero',
};

/** Signature details offered by the generator: the AI chooses the one that best expresses its concept. */
function signatureInstructions(options = []) {
  if (!options.length) return '';
  return `
Signature detail, repeated on every page: choose ONE of these, the one that best expresses your concept, and put its id in "style"."signature":
${options.map((id) => `- "${id}": ${SIGNATURE_LABELS[id]}`).join('\n')}
Mention it in the "description".`;
}

/** Copy keys of optional sections: only asked when the template has the section. */
const SECTION_COPY = { stats: [], process: ['processKicker', 'processTitle', 'processText'], faq: ['faqKicker', 'faqTitle'] };
const SECTION_LISTS = {
  stats: '"stats": [4 × { "value": "short figure, e.g. 20+ or 24h (max 12 chars)", "label": "max 40 chars" }]',
  process: '"steps": [4 × { "title": "max 50 chars", "text": "max 160 chars" }]',
  faq: '"faq": [4 × { "q": "question typical of the customers of the category (max 120 chars)", "a": "answer, max 400 chars" }]',
  highlights: '"highlights": [4 short guarantees typical of the category, max 40 chars each]',
};

function technicalInstructions(languageLabel, sections = null, signatures = null) {
  const optionalKeys = Object.values(SECTION_COPY).flat();
  const copyShape = Object.entries(COPY_KEYS)
    .filter(([k]) => !optionalKeys.includes(k) || Object.entries(SECTION_COPY).some(([sec, keys]) => keys.includes(k) && (!sections || sections.includes(sec))))
    .map(([k, max]) => `    "${k}": "... (max ${max} chars)"`)
    .join(',\n');
  const lists = Object.entries(SECTION_LISTS)
    .filter(([sec]) => !sections || sections.includes(sec))
    .map(([, shape]) => `,\n    ${shape}`)
    .join('');
  return `

=== OUTPUT FORMAT (added automatically by the generator — it overrides any output format requested above) ===
The generator builds the Elementor templates itself from the design decisions above and from your answer. Reply with ONLY one valid JSON object (no markdown, no code fences, no text before or after it) with this shape:
{
  "description": "concept of the design, 2–3 sentences",
  "tone": "tone of voice of the texts",
  "style": {
    "colors": { ${COLOR_KEYS.map((k) => `"${k}": "#RRGGBB"`).join(', ')} }${signatures?.length ? `,\n    "signature": "${signatures.join('" | "')}"` : ''}
  },
  "icons": ["${MAX_FEATURES} icons, one for each strength of \\"why choose us\\", in the same order"],
  "copy": {
${copyShape},
    "features": [${MAX_FEATURES} × { "title": "max 50 chars", "text": "max 160 chars" }],
    "heroPhrases": [3 short phrases, max 40 chars each],
    "aboutPoints": [3 key points, max 60 chars each],
    "reviews": [3 × { "name": "fictional customer", "role": "role or city", "text": "2–3 sentences" }]${lists}
  }
}
Rules:
- Colors: 6-digit hex. "background" is a light tint for alternate sections, "dark" a deep color for the footer and image overlays; white text must be readable on "primary" and "dark", and "heading" / "text" must be readable on white.
- Icons: only from this list (Font Awesome 5 solid): ${ICONS.join(', ')}.
- Texts of "copy": in ${languageLabel}. "aboutText", "aboutPageText" and "aboutPageText2" may use simple HTML (<p>, <strong>, <ul>, <li>); every other text is plain text. No business names, phone numbers, emails or addresses, no placeholder text.
- The About page shows its text in two rows (text beside a photo, then a photo beside the text), without sub-titles: "aboutPageText" = who we are, history and experience (2 paragraphs); "aboutPageText2" = values, method and commitment to the customers (2 paragraphs, may include a short list).
- "features": ${MAX_FEATURES} real strengths of a business of this category (short title + concrete explanation), the most important first: the site shows the first 3 to 6 of them, depending on the layout.
- "heroPhrases": 3 short benefits or services of a business of this category (2–5 words each), shown one after the other under the hero title.
- "aboutPoints": 3 key points of a business of this category for the "about us" section (3–7 words each, e.g. experience, team, materials).
- Reviews have no photo of the customer.`;
}

const LABELS = { it: '(nessuna)', en: '(none)' };

/**
 * Final prompt for a category template.
 * @param {object} p  { category, instructions, language, direction, plan, existing: spec[], avoidColors: string[] }
 */
export function buildTemplatePrompt({ category, instructions = '', language = 'it', direction = null, plan = null, existing = [], avoidColors = [], profile = null, library = [], clientNotes = '' }) {
  const none = LABELS[language] || LABELS.en;
  const languageLabel = languageName(language);
  const vars = {
    CATEGORIA: category.name,
    DESCRIZIONE_CATEGORIA: category.description?.trim() || none,
    ISTRUZIONI_STILE: instructions.trim() || none,
    LINGUA: languageLabel,
  };
  const body = TEMPLATE_PROMPT.content.replace(/\{\{\s*([A-Z_]+)\s*\}\}/g, (m, name) => (name in vars ? vars[name] : m));
  const design = direction && plan ? directionInstructions(category, direction, plan, existing, avoidColors, profile, library) : '';
  return { prompt: body + design + clientDesignNotes(clientNotes) + technicalInstructions(languageLabel, plan?.sections, plan?.signatures), system: TEMPLATE_SYSTEM_PROMPT };
}

/**
 * Template generated from a project: the "Additional notes for the AI" of that site. Only what
 * concerns the design and the tone applies (the template is reused by other sites of the category).
 */
function clientDesignNotes(notes) {
  const text = String(notes || '').trim();
  if (!text) return '';
  return `

=== INSTRUCTIONS OF THE CLIENT THIS TEMPLATE IS DESIGNED FOR (mandatory) ===
${text}
=== END OF THE INSTRUCTIONS OF THE CLIENT ===
Follow every instruction above that concerns the design and the texts of the template: colors, mood, style, tone of voice, strengths and themes to highlight or avoid. They take priority over the palette mood of the direction, but not over the decisions of the generator or the output format. Do not put business names, phone numbers, emails or addresses in the sample texts.`;
}

/**
 * Generate a template spec for a category.
 * @param {object} opts
 *   - category        { name, description }
 *   - instructions    style instructions of the user
 *   - language        language of the sample texts
 *   - existing        specs of the saved templates of the category (each may carry `name`)
 *   - direction       id of a direction chosen by the user (otherwise the least used one)
 *   - exclude         directions to avoid (e.g. the drafts just generated and discarded)
 *   - avoidColors     primary colors to avoid (same reason)
 *   - profile         industry analysis of the category (industry.js), if any
 *   - library         specs of the templates of the other categories (variety across the library)
 *   - clientNotes     notes for the AI of the site the template is generated for (not saved)
 *   - rng            random source (tests)
 * @returns {Promise<{ spec, tokens, direction }>}
 */
export async function generateTemplateSpec(provider, { category, instructions = '', language = 'it', existing = [], direction: requested = '', exclude = [], avoidColors = [], profile = null, library = [], clientNotes = '', rng = Math.random }) {
  const direction = pickDirection(existing, { requested, exclude, suitable: profile?.directions, library, rng });
  const plan = designPlan(direction, existing, rng, profile, library);
  const { prompt, system } = buildTemplatePrompt({ category, instructions, language, direction, plan, existing, avoidColors, profile, library, clientNotes });
  const taken = [...existing.map((s) => s.style.colors.primary), ...avoidColors];
  let tokens = 0;
  let note = '';
  let lastError = null;
  let fallback = null;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    const res = await provider.generate(prompt + note, {
      system,
      json: true,
      temperature: 1,
      task: 'template',
      context: { category: category.name, language, instructions, direction: direction.id, avoidColors: taken, sections: plan.sections },
    });
    tokens += (res.usage?.inputTokens || estimateTokens(prompt)) + (res.usage?.outputTokens || estimateTokens(res.text));
    try {
      if (res.finishReason === 'length') throw new Error('The answer was cut off (max tokens reached). Increase "max tokens" in the provider settings.');
      const parsed = extractJson(res.text);
      if (!parsed.style && !parsed.copy) throw new Error('The JSON does not contain "style" or "copy".');
      const spec = applyPlan(sanitizeSpec(parsed), direction, plan);
      const clash = taken.find((c) => similarColor(c, spec.style.colors.primary));
      // Same color family as another template: ask once more, then accept (fonts, look and layouts already differ)
      if (clash && !fallback && attempt < RETRIES) {
        fallback = spec;
        note = `\n\nIMPORTANT: your "primary" color ${spec.style.colors.primary} is too similar to ${clash}, already used by another template of this category. Answer again with a primary of a clearly different color family.`;
        continue;
      }
      return { spec, tokens, direction };
    } catch (err) {
      lastError = err;
      if (fallback) return { spec: fallback, tokens, direction };
      note = `\n\nIMPORTANT: your previous answer could not be used (${err.message}). Reply with ONLY the JSON object.`;
    }
  }
  if (fallback) return { spec: fallback, tokens, direction };
  throw new AIError('invalid_output', `The AI did not return a usable template after ${RETRIES + 1} attempts: ${lastError?.message}`);
}
