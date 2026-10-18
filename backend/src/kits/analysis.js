/**
 * AI analysis of an uploaded Template Kit: the AI reads the structure of every template (sections,
 * widgets, demo texts, images) and the global colors / fonts, and describes
 *  - the kit: original industry of the demo, layout, visual style, tone of the demo copy;
 *  - the role of each template in the site (home, about, services, gallery, contact, header, footer,
 *    single post, or not used);
 *  - the type and purpose of every section (hero, services, testimonials, pricing…).
 * The site generation uses it to tell the AI what each text is for, to map the images (hero,
 * subheader, service cards) and to compose the pages the kit does not have.
 * Every answer is validated; what the AI leaves out is filled by heuristics, so a kit is always usable
 * (also without AI: heuristicAnalysis).
 */
import { extractJson } from '../ai/json.js';
import { AIError } from '../ai/AIProvider.js';
import { estimateTokens } from '../generation/prompt-builder.js';
import { dedupeRoles, guessRole } from './read.js';

export const KIT_ROLES = ['home', 'about', 'services', 'gallery', 'contact', 'single_post', 'header', 'footer', 'ignore'];

/** Section types (English labels are also shown in the UI). */
export const SECTION_TYPES = {
  hero: 'Hero',
  page_title: 'Page title banner',
  about: 'About us',
  services: 'Services',
  features: 'Features / why choose us',
  stats: 'Key figures',
  process: 'How we work',
  testimonials: 'Testimonials',
  team: 'Team',
  pricing: 'Pricing',
  faq: 'FAQ',
  cta: 'Call to action',
  gallery: 'Gallery / portfolio',
  clients: 'Client logos',
  blog: 'Blog / news',
  contact: 'Contact',
  newsletter: 'Newsletter',
  other: 'Other',
};

const RETRIES = 2;
const BATCH_CHARS = 28000; // outline characters per AI call
export const KIT_SYSTEM_PROMPT =
  'You are a senior web designer analysing an Elementor Template Kit inside an automated site generator. ' +
  'You always answer with a single valid JSON object exactly as requested, without any extra text.';

// ---------------------------------------------------------------------------
// Heuristics (fallback, and the offline demo provider)
// ---------------------------------------------------------------------------

const has = (sec, re) => sec.widgets.some((w) => re.test(w));
const says = (sec, re) => sec.texts.some((t) => re.test(t));

/** Type of a section from its widgets and demo texts. */
export function guessSectionType(sec, role, index) {
  if (role === 'header' || role === 'footer') return 'other';
  if (index === 0 && role === 'home') return 'hero';
  if (index === 0 && role !== 'single_post' && sec.widgets.length <= 6 && has(sec, /heading/)) return 'page_title';
  if (has(sec, /testimonial|review/) || says(sec, /testimonial|review|what (our )?(clients|customers) say|recension/i)) return 'testimonials';
  if (has(sec, /price-table|price-list|pricing/) || says(sec, /pricing|price plans?|packages|prezzi/i)) return 'pricing';
  if (has(sec, /^form$|google_maps|contact|wpforms|cf7/) || says(sec, /contact us|get in touch|contatt/i)) return 'contact';
  if (has(sec, /counter/)) return 'stats';
  if (has(sec, /accordion|toggle|faq/) || says(sec, /faq|frequently asked|domande frequenti/i)) return 'faq';
  if (has(sec, /gallery|portfolio|carousel/) && !says(sec, /client|partner|brand/i)) return 'gallery';
  if (says(sec, /our team|meet the|experts|staff|il nostro team/i) || has(sec, /team/)) return 'team';
  if (has(sec, /^posts$|loop-grid|blog/) || says(sec, /blog|latest news|articles|news/i)) return 'blog';
  if (says(sec, /newsletter|subscribe/i)) return 'newsletter';
  if (sec.images >= 4 && sec.texts.length <= 2) return 'clients';
  if (says(sec, /partner|our clients|trusted by|brands/i) && sec.images >= 3) return 'clients';
  if (says(sec, /services|what we do|what we offer|servizi/i) || (has(sec, /image-box|flip-box/) && sec.images >= 2)) return 'services';
  if (says(sec, /how (it|we) work|our process|step|come lavoriamo/i)) return 'process';
  if (says(sec, /about|who we are|our story|chi siamo/i)) return 'about';
  if (has(sec, /icon-box/) || says(sec, /why choose|perché sceglierci/i)) return 'features';
  if (has(sec, /button/) && sec.texts.length <= 4) return 'cta';
  return 'other';
}

/** Analysis without AI: roles from the titles, section types from widgets and texts. */
export function heuristicAnalysis(templates, outlines) {
  const roles = templates.map((t) => ({ id: t.id, role: t.valid ? t.suggestedRole || guessRole(t) : 'ignore' }));
  return {
    summary: '',
    industry: '',
    style: '',
    tone: '',
    ai: false,
    templates: Object.fromEntries(
      roles.map(({ id, role }) => [
        id,
        { role, purpose: '', sections: (outlines[id] || []).map((sec, i) => ({ type: guessSectionType(sec, role, i), description: '' })) },
      ])
    ),
  };
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

/** Colors and fonts of the kit, in words (from its global styles). */
export function describeGlobalStyles(styles) {
  if (!styles) return '';
  const colors = [...(styles.system_colors || []), ...(styles.custom_colors || [])]
    .filter((c) => c?.color)
    .slice(0, 12)
    .map((c) => `${c.title || c._id}: ${c.color}`);
  const fonts = [...new Set([...(styles.system_typography || []), ...(styles.custom_typography || [])].map((f) => f?.typography_font_family).filter(Boolean))].slice(0, 6);
  return [colors.length && `colors ${colors.join(', ')}`, fonts.length && `fonts ${fonts.join(', ')}`].filter(Boolean).join('; ');
}

function outlineText(ref, t, outline) {
  const lines = [`${ref} "${t.title}" (type ${t.type}, file ${t.id})`];
  for (const sec of outline) {
    const texts = sec.texts.length ? ` texts: ${sec.texts.map((x) => JSON.stringify(x)).join(' | ')}` : '';
    lines.push(`  S${sec.index + 1}: widgets [${sec.widgets.join(', ') || 'none'}], ${sec.images} image(s), ${sec.fields} text(s).${texts}`);
  }
  return lines.join('\n');
}

export function buildKitPrompt({ name, globalStyles, batch }) {
  const styles = describeGlobalStyles(globalStyles);
  return `Analyse this Elementor Template Kit. Its pages will be reused for the website of another business: the design and the structure stay, while every text is rewritten by an AI for the new business and every image is replaced with the business's own photos. Your analysis tells the generator what each template and each section is for.

Kit: "${name}"${styles ? `\nGlobal styles of the kit: ${styles}` : ''}

The generated website has exactly these parts (role of a template):
- "home": home page · "about": about us page · "services": page listing the services · "gallery": photo gallery / portfolio page · "contact": contact page
- "header", "footer": shown on every page · "single_post": template of a single blog article (the services are published as articles)
- "ignore": not used (e.g. single service detail, blog archive, 404, popups, shop, team or pricing pages, a second home page).
Give each role to one template at most (the most suitable one).

Section types: ${Object.keys(SECTION_TYPES).map((k) => `"${k}"`).join(', ')}.
("page_title" = banner with the title of an inner page; "clients" = strip of partner / client logos; "other" = anything else.)

Templates of the kit, section by section (S1 = first section from the top):
${batch.map((b) => outlineText(b.ref, b.template, b.outline)).join('\n\n')}

Reply with ONLY this JSON object:
{
  "kit": {
    "industry": "industry / kind of business of the demo content",
    "summary": "2 sentences: what the kit offers and how its pages are organised",
    "style": "visual style in one sentence: colors, typography, shapes, imagery, mood",
    "tone": "tone of voice of the demo texts"
  },
  "templates": [
    { "ref": "T1", "role": "home", "purpose": "one sentence", "sections": [ { "s": "S1", "type": "hero", "description": "what this section shows, in max 15 words" } ] }
  ]
}
List every template (${batch.map((b) => b.ref).join(', ')}) and, for each template, every section in order.`;
}

/** Split the templates into batches whose outline fits in one AI call. */
function batches(templates, outlines) {
  const out = [];
  let current = [];
  let size = 0;
  templates.forEach((t, i) => {
    const item = { ref: `T${i + 1}`, template: t, outline: outlines[t.id] || [] };
    const len = outlineText(item.ref, t, item.outline).length;
    if (current.length && size + len > BATCH_CHARS) {
      out.push(current);
      current = [];
      size = 0;
    }
    current.push(item);
    size += len;
  });
  if (current.length) out.push(current);
  return out;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const str = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/**
 * Merge the AI answer into the heuristic analysis: valid roles, section types and descriptions win.
 * @param {object} raw     parsed AI answers merged: { kit, templates: [{ ref, role, purpose, sections }] }
 * @param {Array} refs     [{ ref, template, outline }]
 */
export function sanitizeAnalysis(raw, refs, outlines) {
  const base = heuristicAnalysis(refs.map((r) => r.template), outlines);
  const kit = raw?.kit && typeof raw.kit === 'object' ? raw.kit : {};
  const out = { ...base, industry: str(kit.industry, 120), summary: str(kit.summary, 500), style: str(kit.style, 400), tone: str(kit.tone, 150), ai: true };
  const answers = Array.isArray(raw?.templates) ? raw.templates : [];
  const ordered = [];
  for (const r of refs) {
    const a = answers.find((x) => x && (x.ref === r.ref || x.id === r.ref || x.file === r.template.id));
    const entry = out.templates[r.template.id];
    if (a && r.template.valid) {
      if (KIT_ROLES.includes(a.role)) entry.role = a.role;
      entry.purpose = str(a.purpose, 200);
      const secs = Array.isArray(a.sections) ? a.sections : [];
      entry.sections = entry.sections.map((sec, i) => {
        const s = secs.find((x) => x && String(x.s || x.section || '').toUpperCase() === `S${i + 1}`) || (secs.length === entry.sections.length ? secs[i] : null);
        return {
          type: s && SECTION_TYPES[s.type] ? s.type : sec.type,
          description: s ? str(s.description, 160) : '',
        };
      });
    }
    ordered.push({ id: r.template.id, role: entry.role });
  }
  dedupeRoles(ordered, 'role');
  for (const o of ordered) out.templates[o.id].role = o.role;
  return out;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Ask the AI to analyse a kit.
 * @param {object} kit  { name, globalStyles, templates: KitTemplate[] (kits/read.js) }
 * @param {object} outlines  templateId -> outlineDocument()
 * @returns {Promise<{ analysis, tokens }>}
 */
export async function analyzeKit(provider, { name, globalStyles, templates }, outlines) {
  const valid = templates.filter((t) => t.valid);
  const refs = valid.map((t, i) => ({ ref: `T${i + 1}`, template: t, outline: outlines[t.id] || [] }));
  const merged = { kit: null, templates: [] };
  let tokens = 0;

  for (const batch of batches(valid, outlines)) {
    const prompt = buildKitPrompt({ name, globalStyles, batch });
    let note = '';
    let lastError = null;
    let done = false;
    for (let attempt = 0; attempt <= RETRIES && !done; attempt++) {
      const res = await provider.generate(prompt + note, {
        system: KIT_SYSTEM_PROMPT,
        json: true,
        temperature: 0.2,
        task: 'kit-analysis',
        context: { kit: name, templates: batch.map((b) => ({ ref: b.ref, title: b.template.title, role: b.template.suggestedRole, sections: b.outline.length })) },
      });
      tokens += (res.usage?.inputTokens || estimateTokens(prompt)) + (res.usage?.outputTokens || estimateTokens(res.text));
      try {
        if (res.finishReason === 'length') throw new Error('The answer was cut off (max tokens reached). Increase "max tokens" in the provider settings.');
        const parsed = extractJson(res.text);
        if (!Array.isArray(parsed.templates)) throw new Error('The JSON does not contain "templates".');
        if (!merged.kit && parsed.kit) merged.kit = parsed.kit;
        merged.templates.push(...parsed.templates);
        done = true;
      } catch (err) {
        lastError = err;
        note = `\n\nIMPORTANT: your previous answer could not be used (${err.message}). Reply with ONLY the JSON object.`;
      }
    }
    if (!done) throw new AIError('invalid_output', `The AI did not return a usable analysis after ${RETRIES + 1} attempts: ${lastError?.message}`);
  }
  return { analysis: sanitizeAnalysis(merged, refs, outlines), tokens };
}

/** Role of each template: the user's choice, else the analysis, else the guess from the title. */
export function effectiveRoles(info, analysis, overrides = {}) {
  const list = info.templates.map((t) => {
    const role = overrides[t.id] ?? analysis?.templates?.[t.id]?.role ?? t.suggestedRole ?? 'ignore';
    return { id: t.id, role: t.valid && KIT_ROLES.includes(role) ? role : 'ignore' };
  });
  // The user's choices win over the analysis when two templates get the same role
  const sorted = [...list].sort((a, b) => Number(b.id in overrides) - Number(a.id in overrides));
  dedupeRoles(sorted, 'role');
  return Object.fromEntries(list.map((x) => [x.id, x.role]));
}

/** The kit described for the site prompt ({{STILE_TEMPLATE}}). */
export function describeKit(kit) {
  const a = kit.analysis || {};
  return [
    a.summary,
    a.style && `Visual style: ${a.style}`,
    a.tone && `Tone of the demo texts (keep the register, not the words): ${a.tone}`,
    describeGlobalStyles(kit.info.globalStyles) && `Global styles: ${describeGlobalStyles(kit.info.globalStyles)}`,
  ]
    .filter(Boolean)
    .join('\n') || `Elementor Template Kit "${kit.name}".`;
}
