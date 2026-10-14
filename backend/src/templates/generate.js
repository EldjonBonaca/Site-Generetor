/**
 * AI generation of a category template: the built-in template prompt
 * (db/prompts/template-categoria-it.md) + technical instructions describing the JSON spec.
 * The answer is sanitized (spec.js), so any usable JSON becomes a valid template.
 */
import { extractJson } from '../ai/json.js';
import { AIError } from '../ai/AIProvider.js';
import { estimateTokens, languageName } from '../generation/prompt-builder.js';
import { TEMPLATE_PROMPT } from '../generation/site-prompt.js';
import { COLOR_KEYS, COPY_KEYS, FONTS, ICONS, LAYOUTS, SPACINGS, WEIGHTS, sanitizeSpec } from './spec.js';

const RETRIES = 2;

export const TEMPLATE_SYSTEM_PROMPT =
  'You are a senior web designer working inside an automated Elementor site generator. ' +
  'You always answer with a single valid JSON object exactly as requested, without any extra text.';

function technicalInstructions(languageLabel) {
  const copyShape = Object.entries(COPY_KEYS)
    .map(([k, max]) => `    "${k}": "... (max ${max} chars)"`)
    .join(',\n');
  return `

=== OUTPUT FORMAT (added automatically by the generator — it overrides any output format requested above) ===
The generator builds the Elementor templates itself from your design decisions. Reply with ONLY one valid JSON object (no markdown, no code fences, no text before or after it) with this shape:
{
  "description": "concept of the design, 2–3 sentences",
  "tone": "tone of voice of the texts",
  "style": {
    "colors": { ${COLOR_KEYS.map((k) => `"${k}": "#RRGGBB"`).join(', ')} },
    "fonts": { "heading": "...", "body": "..." },
    "headingWeight": "${WEIGHTS.join('" | "')}",
    "radius": 0-30 (corner radius of buttons, cards and images in px),
    "spacing": "${SPACINGS.join('" | "')}",
    "uppercase": true | false (uppercase buttons and small labels)
  },
  "layout": {
${Object.entries(LAYOUTS)
  .map(([k, v]) => `    "${k}": "${v.join('" | "')}"`)
  .join(',\n')}
  },
  "icons": ["4 icons for the 4 strengths of \\"why choose us\\""],
  "copy": {
${copyShape},
    "features": [4 × { "title": "max 50 chars", "text": "max 160 chars" }],
    "reviews": [3 × { "name": "fictional customer", "role": "role or city", "text": "2–3 sentences" }]
  }
}
Rules:
- Colors: 6-digit hex. "background" is a light tint for alternate sections, "dark" a deep color for the footer and image overlays; white text must be readable on "primary" and "dark", and "heading" / "text" must be readable on white.
- Fonts: only from this list: ${FONTS.join(', ')}.
- Icons: only from this list (Font Awesome 5 solid): ${ICONS.join(', ')}.
- Layout values: only the listed ones. hero "center" / "left" = text over a full-width photo, "split" = text beside the photo. cta "none" = no call to action section.
- Texts of "copy": in ${languageLabel}. "aboutText", "storyText" and "missionText" may use simple HTML (<p>, <strong>, <ul>, <li>); every other text is plain text. No business names, phone numbers, emails or addresses.`;
}

const LABELS = { it: '(nessuna)', en: '(none)' };

/** Final prompt for a category template. */
export function buildTemplatePrompt({ category, instructions = '', language = 'it' }) {
  const none = LABELS[language] || LABELS.en;
  const languageLabel = languageName(language);
  const vars = {
    CATEGORIA: category.name,
    DESCRIZIONE_CATEGORIA: category.description?.trim() || none,
    ISTRUZIONI_STILE: instructions.trim() || none,
    LINGUA: languageLabel,
  };
  const body = TEMPLATE_PROMPT.content.replace(/\{\{\s*([A-Z_]+)\s*\}\}/g, (m, name) => (name in vars ? vars[name] : m));
  return { prompt: body + technicalInstructions(languageLabel), system: TEMPLATE_SYSTEM_PROMPT };
}

/**
 * Ask the provider for a template spec. Invalid JSON is retried; any parsed object is sanitized.
 * @returns {Promise<{ spec: object, tokens: number }>}
 */
export async function generateTemplateSpec(provider, { category, instructions = '', language = 'it' }) {
  const { prompt, system } = buildTemplatePrompt({ category, instructions, language });
  let tokens = 0;
  let note = '';
  let lastError = null;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    const res = await provider.generate(prompt + note, { system, json: true, task: 'template', context: { category: category.name, language, instructions } });
    tokens += (res.usage?.inputTokens || estimateTokens(prompt)) + (res.usage?.outputTokens || estimateTokens(res.text));
    try {
      if (res.finishReason === 'length') throw new Error('The answer was cut off (max tokens reached). Increase "max tokens" in the provider settings.');
      const parsed = extractJson(res.text);
      if (!parsed.style && !parsed.layout && !parsed.copy) throw new Error('The JSON does not contain "style", "layout" or "copy".');
      return { spec: sanitizeSpec(parsed), tokens };
    } catch (err) {
      lastError = err;
      note = `\n\nIMPORTANT: your previous answer could not be used (${err.message}). Reply with ONLY the JSON object.`;
    }
  }
  throw new AIError('invalid_output', `The AI did not return a usable template after ${RETRIES + 1} attempts: ${lastError?.message}`);
}
