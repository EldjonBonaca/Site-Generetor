/**
 * Prompt construction: variable substitution + automatic technical instructions
 * that force a strict JSON answer.
 */
import { LANGUAGES, stripHtml } from '../lib/util.js';
import { exportNames, galleryPool } from '../lib/images.js';
import { copyrightText } from './plan.js';

/** Variables available in user prompts (also shown in the UI). */
export const PROMPT_VARIABLES = [
  { name: 'site_name', alias: 'NOME_SITO', description: 'Site name' },
  { name: 'phone', alias: 'TELEFONO', description: 'Phone number' },
  { name: 'email', alias: 'EMAIL', description: 'Email' },
  { name: 'address', alias: 'INDIRIZZO', description: 'Address' },
  { name: 'address_url_encoded', alias: 'INDIRIZZO_URL_ENCODED', description: 'Address encoded for URLs (Google Maps)' },
  { name: 'copyright', alias: 'TESTO_COPYRIGHT', description: 'Copyright text (footer)' },
  { name: 'city', alias: 'CITTA', description: 'City / service area' },
  { name: 'industry', alias: 'SETTORE', description: 'Industry' },
  { name: 'language', alias: 'LINGUA', description: 'Language' },
  { name: 'services', alias: 'SERVIZI', description: 'List of services (name + description)' },
  { name: 'service_1', alias: 'SERVIZIO_1', description: 'Service #1 (also _2, _3… and _N = one line per remaining service)' },
  { name: 'service_image_1', alias: 'IMG_SERVIZIO_1', description: 'Image file of service #1 (also _2, _3… _N)' },
  { name: 'service_name', alias: 'NOME_SERVIZIO', description: 'Current service name (service pages / articles)' },
  { name: 'service_description', alias: 'DESCRIZIONE_SERVIZIO', description: 'Current service description' },
  { name: 'logo', alias: 'LOGO', description: 'Logo file name' },
  { name: 'hero_image', alias: 'IMG_HOME_HERO', description: 'Home hero image file name' },
  { name: 'subheader_image', alias: 'IMG_SUBHEADER', description: 'Subheader image file name' },
  { name: 'gallery_images', alias: 'ELENCO_IMMAGINI_GALLERIA', description: 'Gallery image file names' },
  { name: 'kit_name', alias: 'NOME_FILE_TEMPLATE_KIT', description: 'Template Kit name' },
  { name: 'template_structure', alias: 'STRUTTURA_TEMPLATE', description: 'List of text fields to fill, extracted from the template' },
  { name: 'notes', alias: 'NOTE', description: 'Additional notes' },
  { name: 'page_title', alias: 'TITOLO_PAGINA', description: 'Title of the page being generated' },
];
const ALIASES = Object.fromEntries(PROMPT_VARIABLES.map((v) => [v.alias.toLowerCase(), v.name]));

export const languageName = (code) => LANGUAGES[code] || code || 'English';
const NONE = { it: '(non fornita)', en: '(not provided)' };

export function formatServices(services) {
  if (!services.length) return '(no services listed)';
  return services.map((s) => `- ${s.name}${s.description ? `: ${s.description}` : ''}`).join('\n');
}

/** Human/AI readable list of fields: id, format, length limits, hint or demo text. */
export function formatTemplateStructure(fields) {
  if (!fields.length) return '(no fields)';
  return fields
    .map((f) => {
      const demo = stripHtml(f.original || '').replace(/\s+/g, ' ').slice(0, 140);
      const limits = f.format === 'link' ? '' : `, max ~${f.maxLength || 160} chars${f.minLength ? `, min ${f.minLength} chars` : ''}`;
      const hint = [f.hint, demo && `demo ${f.format === 'link' ? 'link' : 'text'}: "${demo}"`].filter(Boolean).join(' — ');
      return `- ${f.id} [${f.format || 'text'}${limits}] ${f.label || ''}${hint ? ` — ${hint}` : ''}`;
    })
    .join('\n');
}

/**
 * Expand indexed variables:
 *  - a line containing {{SERVIZIO_N}} / {{service_N}} is repeated for every service after the
 *    highest explicit index used in the same block (e.g. 1–4 written by hand, N -> 5, 6, …)
 *  - lines referring to a service index that does not exist are removed
 */
export function expandIndexedLines(content, count) {
  const INDEXED = /\{\{\s*(servizio|img_servizio|service|service_image)_(\d+|n)\s*\}\}/gi;
  const lines = String(content || '').split('\n');
  const out = [];
  let blockMax = 0;
  for (const line of lines) {
    if (!line.trim()) blockMax = 0;
    const matches = [...line.matchAll(INDEXED)];
    if (!matches.length) {
      out.push(line);
      continue;
    }
    const explicit = matches.filter((m) => m[2].toLowerCase() !== 'n').map((m) => Number(m[2]));
    if (explicit.length) {
      blockMax = Math.max(blockMax, ...explicit);
      if (explicit.some((k) => k > count)) continue; // service does not exist
      out.push(line);
      continue;
    }
    for (let k = blockMax + 1; k <= count; k++) {
      out.push(
        line
          .replace(/_n(\s*\}\})/gi, `_${k}$1`)
          .replace(/^(\s*)\d+\./, `$1${k}.`)
          .replace(/(^|[^\w{])N(?=[^\w}]|$)/g, `$1${k}`)
      );
    }
  }
  return out.join('\n');
}

/**
 * All variables for a page. `ctx` (project context) enables image / kit variables.
 */
export function buildVariables({ project, services, service, fields, pageTitle, ctx = null }) {
  const lang = project.language;
  const none = NONE[lang] || NONE.en;
  const names = ctx ? exportNames(ctx.images, ctx.settings.image) : new Map();
  const imgName = (img) => (img ? `${names.get(img.id) || img.file_name}${img.alt_text ? ` (ALT: ${img.alt_text})` : ''}` : none);
  const byRole = (r) => ctx?.images.find((i) => i.role === r);
  const address = String(project.address || '').replace(/\s*\n+\s*/g, ', ').trim();

  const vars = {
    site_name: project.site_name,
    phone: project.phone,
    email: project.email,
    address,
    address_url_encoded: encodeURIComponent(address),
    copyright: copyrightText(project),
    city: project.city || '(not specified)',
    industry: project.industry || '(not specified)',
    language: languageName(lang),
    services: formatServices(services),
    service_name: service?.name || '',
    service_description: service?.description || '(not provided: write it based on the service name)',
    template_structure: formatTemplateStructure(fields || []),
    notes: project.notes || '(none)',
    page_title: pageTitle || '',
    logo: imgName(byRole('logo')),
    hero_image: imgName(byRole('hero_home')),
    subheader_image: imgName(byRole('subheader')),
    gallery_images: ctx ? galleryPool(ctx.images).map((i) => names.get(i.id)).join(', ') || none : none,
    kit_name: ctx?.kit?.name || '',
  };
  services.forEach((s, i) => {
    vars[`service_${i + 1}`] = `${s.name}${s.description ? ` – ${s.description}` : ''}`;
    vars[`service_image_${i + 1}`] = imgName(ctx?.images.find((img) => img.role === 'service' && img.service_id === s.id));
  });
  return vars;
}

/** Replace {{ variable }} placeholders (English names or Italian aliases); unknown variables are left untouched. */
export function renderTemplate(content, vars, serviceCount = 0) {
  return expandIndexedLines(content, serviceCount).replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (m, raw) => {
    let name = raw.toLowerCase();
    name = ALIASES[name] || name.replace(/^img_servizio_/, 'service_image_').replace(/^servizio_/, 'service_');
    return name in vars ? String(vars[name] ?? '') : m;
  });
}

const ROLE_DESCRIPTION = {
  home: 'home page',
  about: 'about page',
  services: 'services overview page',
  post: 'blog article (WordPress post) dedicated to one service',
  gallery: 'gallery page',
  contact: 'contact page',
  header: 'site header (shown on every page)',
  footer: 'site footer (shown on every page)',
  single_post: 'template of the single article (shared by all service articles)',
};

/** Instructions appended after the user prompt so the output is machine-readable. */
export function technicalInstructions({ fields, languageLabel, pageTitle, role, links = [], includeStructure, extra = '' }) {
  const shape = `{\n${fields.map((f) => `  ${JSON.stringify(f.id)}: "..."`).join(',\n')}\n}`;
  const hasLinks = fields.some((f) => f.format === 'link');
  const pages = links.filter((l) => !['phone', 'email'].includes(l.role));
  return `

=== OUTPUT FORMAT (added automatically by the generator — it overrides any output format requested above) ===
The generator itself builds the Elementor JSON templates, header/footer, the articles XML, the menu and the import guide.
Your only task now is to write the texts of ONE part of the site: "${pageTitle}" (${ROLE_DESCRIPTION[role] || 'page'}).
${pages.length ? `Site structure: ${pages.map((l) => `${l.label} (${l.url})`).join(', ')}.\n` : ''}Reply with ONLY one valid JSON object: no markdown, no code fences, no comments, no text before or after it.
- Keys: exactly the field ids listed below — all of them and no others.
- Values: strings written in ${languageLabel}.
- Fields marked [html] may use simple HTML only (<p>, <h2>, <h3>, <strong>, <em>, <ul>, <li>, <br>, <a>). Fields marked [text] are plain text without HTML.
- Stay within the indicated maximum length of each field so the design does not break; respect the minimum length when indicated.
- Use the real business data (name, phone, email, address) wherever contact details are needed. Never output placeholders like "Lorem ipsum" or "[your phone]".${
    hasLinks
      ? `\n- Fields marked [link]: the value must be exactly one of these URLs (choose the one matching the button/link text): ${links.map((l) => l.url).join(' , ')}`
      : ''
  }
- "_seo.title" (if present): SEO title for this page, max 60 characters. "_seo.description" (if present): meta description, max 155 characters.${extra}
${includeStructure ? `\nFields:\n${formatTemplateStructure(fields)}\n` : ''}
Expected JSON shape:
${shape}`;
}

export const SYSTEM_PROMPT =
  'You are a professional website copywriter working inside an automated site generator. ' +
  'You always answer with a single valid JSON object exactly as requested, without any extra text.';

/**
 * Build the final prompt for (a chunk of) a page.
 * @returns {{ prompt: string, system: string, vars: object }}
 */
export function buildPagePrompt({ promptContent, project, services, service, fields, pageTitle, role = 'generic', links = [], ctx = null, extra }) {
  const vars = buildVariables({ project, services, service, fields, pageTitle, ctx });
  const userPart = renderTemplate(promptContent, vars, services.length);
  const usesStructure = /\{\{\s*(template_structure|STRUTTURA_TEMPLATE)\s*\}\}/i.test(promptContent || '');
  const prompt =
    userPart + technicalInstructions({ fields, languageLabel: vars.language, pageTitle, role, links, includeStructure: !usesStructure, extra });
  return { prompt, system: SYSTEM_PROMPT, vars };
}

/** Rough token estimate (≈ 4 characters per token for Latin languages). */
export const estimateTokens = (text) => Math.ceil(String(text || '').length / 4);
