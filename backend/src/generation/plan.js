/**
 * Project context + page plan shared by the generation runner, the exporter and the API.
 */
import path from 'node:path';
import { get, all, parseJson } from '../db/index.js';
import { config } from '../config.js';
import { analyzeDocument, defaultSlotRoles, looksLikePhone, getAtPath, EMAIL_IN_TEXT } from '../elementor/analyze.js';
import { buildLayoutDoc, isBuiltinTemplate, BUILTIN_PREFIX, BUILTIN_ROLES } from '../elementor/layout.js';
import { prepareDocument } from '../elementor/prepare.js';
import { loadTemplate } from '../elementor/kit.js';
import { isValidEmail, isValidPhone, slugify, stripHtml, telHref } from '../lib/util.js';
import { galleryPool } from '../lib/images.js';

/** The only pages of the site. Services are published as articles (role 'post'). */
export const SITE_PAGE_ROLES = ['home', 'about', 'services', 'gallery', 'contact'];
export const PAGE_ROLES = [...SITE_PAGE_ROLES, 'single_post', 'header', 'footer', 'ignore'];
const ROLE_ORDER = { home: 0, about: 1, services: 2, gallery: 3, contact: 4, post: 5, single_post: 6, header: 7, footer: 8 };

/** Page titles in the site language (slugs are derived from them: /chi-siamo/, /contatti/ ...). */
const PAGE_TITLES = {
  it: { home: 'Home', about: 'Chi Siamo', services: 'Servizi', gallery: 'Galleria', contact: 'Contatti', single_post: 'Articolo singolo', header: 'Header', footer: 'Footer' },
  en: { home: 'Home', about: 'About Us', services: 'Services', gallery: 'Gallery', contact: 'Contact', single_post: 'Single post', header: 'Header', footer: 'Footer' },
  es: { home: 'Inicio', about: 'Quiénes somos', services: 'Servicios', gallery: 'Galería', contact: 'Contacto', single_post: 'Entrada individual', header: 'Header', footer: 'Footer' },
  fr: { home: 'Accueil', about: 'À propos', services: 'Services', gallery: 'Galerie', contact: 'Contact', single_post: 'Article', header: 'Header', footer: 'Footer' },
  de: { home: 'Startseite', about: 'Über uns', services: 'Leistungen', gallery: 'Galerie', contact: 'Kontakt', single_post: 'Beitrag', header: 'Header', footer: 'Footer' },
  pt: { home: 'Início', about: 'Sobre nós', services: 'Serviços', gallery: 'Galeria', contact: 'Contactos', single_post: 'Artigo', header: 'Header', footer: 'Footer' },
};
const RIGHTS = { it: 'Tutti i diritti riservati.', en: 'All rights reserved.', es: 'Todos los derechos reservados.', fr: 'Tous droits réservés.', de: 'Alle Rechte vorbehalten.', pt: 'Todos os direitos reservados.' };
const MENU_NAME = { it: 'Menu principale', en: 'Main menu', es: 'Menú principal', fr: 'Menu principal', de: 'Hauptmenü', pt: 'Menu principal' };
const SERVICES_CATEGORY = { it: 'Servizi', en: 'Services', es: 'Servicios', fr: 'Services', de: 'Leistungen', pt: 'Serviços' };

export const pageTitle = (lang, role) => (PAGE_TITLES[lang] || PAGE_TITLES.en)[role];
export const servicesCategory = (lang) => SERVICES_CATEGORY[lang] || SERVICES_CATEGORY.en;
export const oneLine = (s) => String(s || '').replace(/\s*\n+\s*/g, ', ').trim();

/** Exact size (px) of the Home hero and of the page subheader images: they are cropped to it. */
export const DEFAULT_CROP_SIZES = { hero: { width: 1920, height: 1080 }, subheader: { width: 1920, height: 600 } };

export function defaultSettings(settings = {}) {
  return {
    subheaderPerPage: false,
    replaceAllEmails: true,
    replaceAllImages: true, // no demo image may remain in the site
    contactShortcode: '[contact-form-7 id="INSERIRE_ID" title="Modulo di contatto"]',
    mapEmbed: true,
    menuName: '',
    layout: 'builtin', // 'builtin' = clean layout built by the generator, 'kit' = rewrite a Template Kit
    reviews: [], // [{ name, role, text }] real customer reviews (Home reviews section)
    ...settings,
    design: { primaryColor: '', ...(settings.design || {}) }, // '' = color of the logo
    image: { seoRename: true, maxWidth: 1920, convertWebp: true, quality: 82, ...DEFAULT_CROP_SIZES, ...(settings.image || {}) },
    demoValues: { brand: '', address: '', ignored: [], custom: [], ...(settings.demoValues || {}) },
    generation: { providerId: null, ...(settings.generation || {}) },
  };
}

export function loadContext(projectId) {
  const project = get('SELECT * FROM projects WHERE id = ?', projectId);
  if (!project) return null;
  const settings = defaultSettings(parseJson(project.settings_json, {}));
  const services = all('SELECT * FROM services WHERE project_id = ? ORDER BY position, id', projectId);
  const images = all('SELECT * FROM images WHERE project_id = ? ORDER BY id', projectId);
  const kitRow = project.kit_id ? get('SELECT * FROM kits WHERE id = ?', project.kit_id) : null;
  const kit = kitRow
    ? {
        ...kitRow,
        manifest: parseJson(kitRow.manifest_json, {}),
        info: parseJson(kitRow.templates_json, { templates: [], contacts: { emails: [], phones: [] } }),
        dir: path.join(config.storageDir, kitRow.extracted_path),
      }
    : null;
  const mappings = kit ? all('SELECT * FROM kit_mappings WHERE project_id = ? AND kit_id = ?', projectId, kit.id) : [];
  const menuName = settings.menuName || MENU_NAME[project.language] || MENU_NAME.en;
  return { project, settings, services, images, kit, mappings, menu: { name: menuName, slug: slugify(menuName) } };
}

export const usesBuiltinLayout = (ctx) => ctx.settings.layout !== 'kit';

export function mappingFor(ctx, templateId) {
  if (isBuiltinTemplate(templateId)) return { role: templateId.slice(BUILTIN_PREFIX.length), slotOverrides: {}, options: { removedSections: [] } };
  const m = ctx.mappings.find((x) => x.template_id === templateId);
  const t = ctx.kit?.info.templates.find((x) => x.id === templateId);
  const role = m?.page_role ?? t?.suggestedRole ?? 'ignore';
  return {
    role: PAGE_ROLES.includes(role) ? role : 'ignore', // 'service' / 'other' pages of older projects are no longer generated
    slotOverrides: parseJson(m?.image_slots_json, {}),
    options: { removedSections: [], ...parseJson(m?.options_json, {}) },
  };
}

/** Copyright line: the one set by the user, or "© <year> <site>. All rights reserved." in the site language. */
export function copyrightText(project) {
  if (project.copyright?.trim()) return project.copyright.trim();
  return `© ${new Date().getFullYear()} ${project.site_name}. ${RIGHTS[project.language] || RIGHTS.en}`;
}

/** Slug of a site page in the site language ('' for the home page). */
export const pageSlug = (lang, role) => (role === 'home' ? '' : slugify(pageTitle(lang, role)));

/**
 * List the pages to generate from the kit mapping: one template per role (the 5 site pages,
 * header, footer, single post template) + one article per service.
 */
export function buildPages(ctx) {
  const builtin = usesBuiltinLayout(ctx);
  if (!builtin && !ctx.kit) return [];
  const lang = ctx.project.language;
  const pages = [];
  const seen = new Set();
  const templates = builtin ? BUILTIN_ROLES.map((role) => ({ id: BUILTIN_PREFIX + role, title: 'Built-in layout', valid: true })) : ctx.kit.info.templates;

  for (const t of templates) {
    if (!t.valid) continue;
    const { role } = mappingFor(ctx, t.id);
    if (role === 'ignore' || seen.has(role)) continue;
    seen.add(role);
    const key = role.replace('_', '-');
    const noUrl = role === 'header' || role === 'footer' || role === 'single_post';
    pages.push({
      key,
      role,
      title: pageTitle(lang, role),
      templateId: t.id,
      templateTitle: t.title,
      serviceId: null,
      prefix: key.replace(/-/g, '_'),
      slug: noUrl ? null : pageSlug(lang, role),
    });
  }

  for (const s of ctx.services) {
    pages.push({ key: `post-${s.slug || s.id}`, role: 'post', title: s.name, templateId: null, templateTitle: null, serviceId: s.id, prefix: 'post', slug: s.slug });
  }
  return pages.sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);
}

/** Internal links the AI may use (and the export checks against). */
export function siteLinks(ctx, pages = buildPages(ctx)) {
  const links = [];
  for (const p of pages) {
    if (p.slug === null || p.role === 'post') continue;
    links.push({ url: p.slug ? `/${p.slug}/` : '/', label: p.title, role: p.role });
  }
  for (const s of ctx.services) links.push({ url: `/${s.slug}/`, label: s.name, role: 'service', serviceId: s.id });
  if (ctx.project.phone) links.push({ url: `tel:${telHref(ctx.project.phone)}`, label: ctx.project.phone, role: 'phone' });
  if (ctx.project.email) links.push({ url: `mailto:${ctx.project.email}`, label: ctx.project.email, role: 'email' });
  return links;
}

/** Best internal URL for a demo link / button text when the AI did not provide a valid one. */
export function fallbackLink(text, links) {
  const s = String(text || '').toLowerCase();
  const find = (role) => links.find((l) => l.role === role)?.url;
  if (/contact|contatt|preventiv|quote|book|prenot|chiam|call/.test(s)) return find('contact') || '/';
  if (/about|chi[\s-]?siamo|who|storia|story|team/.test(s)) return find('about') || '/';
  if (/galler|portfolio|foto|photo|lavori|works|project/.test(s)) return find('gallery') || '/';
  if (/servic|serviz/.test(s)) return find('services') || '/';
  return find('home') || '/';
}

export const contactUrl = (ctx, pages) => siteLinks(ctx, pages).find((l) => l.role === 'contact')?.url || '/';

/** Virtual fields of a service article (no template). */
function postFields(ctx) {
  const cUrl = contactUrl(ctx);
  return [
    {
      id: 'post.content',
      path: null,
      original: '',
      format: 'html',
      widget: 'post',
      key: 'content',
      section: 0,
      card: null,
      label: 'Article text',
      maxLength: 2500,
      minLength: 300,
      hint: `full article about the service: what it includes, who it is for, benefits (SEO). At least 300 characters of text (ideally 1200–2000). HTML with <h2>, <p>, <ul>/<li>. The last paragraph is a call to action linking to the contact page: <a href="${cUrl}">…</a>`,
    },
    { id: 'post.excerpt', path: null, original: '', format: 'text', widget: 'post', key: 'excerpt', section: 0, card: null, label: 'Excerpt', maxLength: 160, hint: 'short summary of the article (used in service grids)' },
  ];
}

/** Load, prepare and analyse the template of a page. Returns a fresh document every call. */
export function analyzePage(ctx, page) {
  if (!page.templateId) return { doc: null, fields: postFields(ctx), slots: [], slotRoles: {}, widgets: {}, contacts: { emails: [], phones: [] }, cardCount: 0 };
  if (isBuiltinTemplate(page.templateId)) return analyzeBuiltin(ctx, page);
  const raw = loadTemplate(ctx.kit.dir, page.templateId);
  if (!raw) throw new Error(`Template "${page.templateId}" cannot be read.`);
  const { slotOverrides, options } = mappingFor(ctx, page.templateId);
  const { doc, meta, cardCount } = prepareDocument(raw, {
    role: page.role,
    removedSections: options.removedSections,
    serviceCount: ctx.services.length,
    ensureGallery: galleryPool(ctx.images).length > 0,
    contact: { shortcode: ctx.settings.contactShortcode, mapEmbed: ctx.settings.mapEmbed, address: oneLine(ctx.project.address) },
    menuSlug: ctx.menu.slug,
  });
  const heroName = page.role === 'home' ? 'hero' : ['header', 'footer', 'single_post'].includes(page.role) ? null : 'intro';
  const analysis = analyzeDocument(doc, { prefix: page.prefix, heroName, meta });
  const slotRoles = { ...defaultSlotRoles(analysis.slots, page.role), ...slotOverrides };
  return { doc, ...analysis, slotRoles, cardCount };
}

/**
 * Page of the built-in layout: its links and contact/structural texts are set by the generator,
 * the AI only writes the remaining texts (with a hint and a length limit for each one).
 */
function analyzeBuiltin(ctx, page) {
  const { doc, meta, fixed, hints, limits, slotRoles: byElement } = buildLayoutDoc(ctx, page.role);
  const heroName = page.role === 'home' ? 'hero' : ['header', 'footer'].includes(page.role) ? null : 'intro';
  const analysis = analyzeDocument(doc, { prefix: page.prefix, heroName, meta });
  const elementOf = (path) => getAtPath(doc, path.slice(0, path.lastIndexOf('settings')));
  const fields = [];
  for (const f of analysis.fields) {
    const id = elementOf(f.path)?.id;
    if (f.format === 'link' || fixed.has(id)) continue;
    fields.push({ ...f, hint: hints[id], maxLength: limits[id] || f.maxLength });
  }
  const slotRoles = {};
  for (const slot of analysis.slots) slotRoles[slot.id] = byElement[slot.id.split(':')[0]] || 'gallery';
  return { doc, ...analysis, fields, slotRoles, cardCount: ctx.services.length };
}

/** Demo value -> project value replacement pairs. */
export function buildReplacements(ctx) {
  const { project, settings, kit } = ctx;
  const ignored = new Set(settings.demoValues.ignored || []);
  const pairs = [];
  if (settings.demoValues.brand) pairs.push({ from: settings.demoValues.brand, to: project.site_name });
  if (settings.demoValues.address) pairs.push({ from: settings.demoValues.address, to: oneLine(project.address) });
  for (const p of kit?.info.contacts?.phones || []) if (!ignored.has(p) && project.phone) pairs.push({ from: p, to: project.phone });
  for (const e of kit?.info.contacts?.emails || []) if (!ignored.has(e) && project.email) pairs.push({ from: e, to: project.email });
  for (const c of settings.demoValues.custom || []) if (c?.from) pairs.push({ from: c.from, to: c.to ?? '' });
  return pairs;
}

const COPYRIGHT_RE = /©|&copy;|copyright|all rights reserved|tutti i diritti|todos los derechos|tous droits|alle rechte/i;
const keepWrapper = (original, plain, value) => (original.includes(plain) && plain ? original.replace(plain, value) : /<[a-z]/i.test(original) ? `<p>${value}</p>` : value);

/**
 * Fields filled deterministically instead of by the AI:
 *  - pure phone / email / demo values, copyright line
 *  - subheader title of inner pages = page title
 *  - service cards: title = service name, link = service URL
 * `state` tracks per-page "first heading" decisions. Returns { source: 'auto', value } or { source: 'ai' }.
 */
export function classifyField(field, ctx, replacements, page = null, state = {}) {
  const { project } = ctx;
  const service = field.card != null ? ctx.services[field.card] : null;

  if (field.format === 'link') {
    if (service) return { source: 'auto', value: `/${service.slug}/` };
    return { source: 'ai' };
  }

  const plain = stripHtml(field.original).trim();
  if (COPYRIGHT_RE.test(plain)) return { source: 'auto', value: keepWrapper(field.original, plain, copyrightText(project)) };
  const exact = replacements.find((r) => r.from.trim() === plain);
  if (exact) return { source: 'auto', value: keepWrapper(field.original, plain, exact.to) };
  if (project.email && plain.match(EMAIL_IN_TEXT)?.[0] === plain) return { source: 'auto', value: project.email };
  if (project.phone && /^[+\d\s().-]+$/.test(plain) && looksLikePhone(plain)) return { source: 'auto', value: project.phone };

  // Service card title
  if (service && (field.key === 'title_text' || field.widget === 'heading' || field.key === 'title') && !state[`card${field.card}`]) {
    state[`card${field.card}`] = true;
    return { source: 'auto', value: service.name };
  }

  // Subheader title of inner pages = page title
  const inner = page && !['home', 'header', 'footer', 'single_post', 'post'].includes(page.role);
  if (inner && field.section === 0 && field.widget === 'heading' && !state.subheader) {
    state.subheader = true;
    return { source: 'auto', value: page.title };
  }
  return { source: 'ai' };
}

/** What is missing before generation? Errors block generation, warnings don't. */
export function checkReadiness(ctx) {
  const items = [];
  const add = (step, level, message) => items.push({ step, level, message });
  const p = ctx.project;

  if (!p.site_name.trim()) add('site', 'error', 'Site name is required.');
  if (!isValidPhone(p.phone)) add('site', 'error', 'A valid phone number is required.');
  if (!isValidEmail(p.email)) add('site', 'error', 'A valid email is required.');
  if (!p.address.trim()) add('site', 'error', 'Address is required.');

  if (!ctx.services.length) add('services', 'warning', 'No services added: no service articles will be generated.');
  ctx.services.forEach((s, i) => {
    if (!s.name.trim()) add('services', 'error', `Service #${i + 1} has no name.`);
  });
  const slugs = ctx.services.map((s) => s.slug);
  if (new Set(slugs).size !== slugs.length) add('services', 'error', 'Two services have the same slug.');

  const byRole = (r) => ctx.images.filter((i) => i.role === r);
  if (!byRole('hero_home').length) add('images', 'warning', 'Home hero image (hero_home) is missing.');
  if (!byRole('subheader').length) add('images', 'warning', 'Subheader image is missing.');
  for (const s of ctx.services) {
    if (!ctx.images.some((i) => i.role === 'service' && i.service_id === s.id)) add('images', 'warning', `Service "${s.name || '?'}" has no image.`);
  }
  if (ctx.images.some((i) => i.role && !i.alt_text.trim())) add('images', 'warning', 'Some assigned images have no ALT text.');
  if (!galleryPool(ctx.images).length) add('images', 'warning', 'Upload some photos: the Gallery page shows all of them.');
  for (const [role, kind, label] of [['hero_home', 'hero', 'Home hero'], ['subheader', 'subheader', 'Subheader']]) {
    const { width, height } = { ...DEFAULT_CROP_SIZES[kind], ...ctx.settings.image[kind] };
    for (const img of byRole(role).filter((i) => i.mime !== 'image/svg+xml' && i.width && (i.width < width || i.height < height))) {
      add('images', 'warning', `${label} image "${img.file_name}" is ${img.width}×${img.height}px: it is cropped to ${width}×${height}px, so it will be enlarged and may look blurry. Use a photo of at least ${width}×${height}px.`);
    }
  }

  if (usesBuiltinLayout(ctx)) {
    if (!byRole('logo').length) add('images', 'warning', 'Logo is missing: set it later in WordPress (Appearance → Customize → Site Identity → Logo). The footer shows the site name and the default color is used.');
  } else if (!ctx.kit) add('kit', 'error', 'Select or upload an Elementor Template Kit, or use the clean built-in layout.');
  else {
    const pages = buildPages(ctx);
    const roles = ctx.kit.info.templates.map((t) => mappingFor(ctx, t.id).role);
    if (!pages.some((pg) => pg.role === 'home')) add('kit', 'error', 'Map a template to the Home page.');
    if (!roles.includes('gallery')) add('kit', 'warning', 'No template mapped to the Gallery page: the WordPress plugin creates it with a standard WordPress gallery of all photos.');
    for (const role of ['about', 'services', 'contact'].filter((r) => !roles.includes(r))) {
      add('kit', 'warning', `No template mapped to the ${pageTitle('en', role)} page: the WordPress plugin creates it empty.`);
    }
    if ((roles.includes('header') || roles.includes('footer')) && !byRole('logo').length) add('images', 'warning', 'Logo is missing (used in header and footer).');
  }

  const providerId = ctx.settings.generation.providerId;
  const provider = providerId ? get('SELECT id FROM ai_providers WHERE id = ?', providerId) : null;
  if (!provider) add('ai', 'error', 'Select an AI provider (Settings → AI Providers to add one).');

  return { ready: !items.some((i) => i.level === 'error'), items };
}
