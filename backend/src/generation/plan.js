/**
 * Project context + page plan shared by the generation runner, the exporter and the API.
 * The Elementor documents of a project are built from its template (templates/builder.js), or from
 * its Template Kit (kits/site.js).
 */
import path from 'node:path';
import { get, all, parseJson } from '../db/index.js';
import { config } from '../config.js';
import { canUseProvider } from '../lib/owner.js';
import { analyzeDocument } from '../elementor/analyze.js';
import { buildSite } from '../templates/builder.js';
import { buildKitSite } from '../kits/site.js';
import { effectiveRoles } from '../kits/analysis.js';
import { sanitizeSpec } from '../templates/spec.js';
import { isValidEmail, isValidPhone, slugify, telHref } from '../lib/util.js';
import { galleryPool } from '../lib/images.js';

/** The only pages of the site. Services are published as articles (role 'post'). */
export const SITE_PAGE_ROLES = ['home', 'about', 'services', 'gallery', 'contact'];
/** Documents built from the template: the 5 pages + the theme parts. */
export const TEMPLATE_ROLES = [...SITE_PAGE_ROLES, 'single_post', 'header', 'footer'];
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
const FORM_TITLE = { it: 'Modulo di contatto', en: 'Contact form', es: 'Formulario de contacto', fr: 'Formulaire de contact', de: 'Kontaktformular', pt: 'Formulário de contacto' };

export const pageTitle = (lang, role) => (PAGE_TITLES[lang] || PAGE_TITLES.en)[role];
export const servicesCategory = (lang) => SERVICES_CATEGORY[lang] || SERVICES_CATEGORY.en;
export const oneLine = (s) => String(s || '').replace(/\s*\n+\s*/g, ', ').trim();

/**
 * Contact form: always Contact Form 7. The contact page gets a placeholder shortcode (INSERIRE_ID)
 * that the WordPress plugin replaces with the form it creates.
 */
export function contactForm(ctx) {
  const title = FORM_TITLE[ctx.project.language] || FORM_TITLE.en;
  return { plugin: 'cf7', name: 'Contact Form 7', title, placeholder: `[contact-form-7 id="INSERIRE_ID" title="${title}"]` };
}

/** Exact size (px) of the Home hero and of the page subheader images: they are cropped to it. */
// carousel: the photos of the Home carousel, all of the same size so the slides line up
export const DEFAULT_CROP_SIZES = { hero: { width: 1920, height: 1080 }, subheader: { width: 1920, height: 600 }, carousel: { width: 900, height: 640 } };

export function defaultSettings(settings = {}) {
  return {
    subheaderPerPage: false,
    mapEmbed: true,
    menuName: '',
    ...settings,
    image: { seoRename: true, maxWidth: 1920, convertWebp: true, quality: 82, ...DEFAULT_CROP_SIZES, ...(settings.image || {}) },
    generation: { providerId: null, ...(settings.generation || {}) },
  };
}

/** A saved template with its category (null when missing). */
export function loadTemplateRow(id) {
  const row = id
    ? get(
        `SELECT t.*, c.name AS category_name, c.description AS category_description
         FROM site_templates t JOIN template_categories c ON c.id = t.category_id WHERE t.id = ?`,
        id
      )
    : null;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    language: row.language,
    category: { id: row.category_id, name: row.category_name, description: row.category_description },
    spec: sanitizeSpec(parseJson(row.spec_json, {})),
  };
}

/** A Template Kit with its analysis and the role of each template (null when missing). */
export function loadKitRow(id) {
  const row = id ? get('SELECT * FROM template_kits WHERE id = ?', id) : null;
  if (!row) return null;
  const info = parseJson(row.info_json, { templates: [] });
  const analysis = parseJson(row.analysis_json, null);
  return {
    id: row.id,
    name: row.name,
    version: row.updated_at,
    dir: path.join(config.storageDir, row.dir),
    info,
    analysis,
    roles: effectiveRoles(info, analysis, parseJson(row.roles_json, {})),
  };
}

export function loadContext(projectId) {
  const project = get('SELECT * FROM projects WHERE id = ?', projectId);
  if (!project) return null;
  const settings = defaultSettings(parseJson(project.settings_json, {}));
  const services = all('SELECT * FROM services WHERE project_id = ? ORDER BY position, id', projectId);
  const images = all('SELECT * FROM images WHERE project_id = ? ORDER BY id', projectId);
  // A Template Kit replaces the category template
  const kit = loadKitRow(project.template_kit_id);
  const template = kit ? null : loadTemplateRow(project.template_id);
  const menuName = settings.menuName || MENU_NAME[project.language] || MENU_NAME.en;
  return { project, settings, services, images, template, kit, menu: { name: menuName, slug: slugify(menuName) } };
}

/** Copyright line: the one set by the user, or "© <year> <site>. All rights reserved." in the site language. */
export function copyrightText(project) {
  if (project.copyright?.trim()) return project.copyright.trim();
  return `© ${new Date().getFullYear()} ${project.site_name}. ${RIGHTS[project.language] || RIGHTS.en}`;
}

/** Slug of a site page in the site language ('' for the home page). */
export const pageSlug = (lang, role) => (role === 'home' ? '' : slugify(pageTitle(lang, role)));

/** Data of the site the template is applied to (input of templates/builder.js). */
export function siteInfo(ctx) {
  const { project } = ctx;
  const lang = project.language;
  return {
    lang,
    siteName: project.site_name,
    phone: project.phone,
    email: project.email,
    address: oneLine(project.address),
    copyright: copyrightText(project),
    hasLogo: ctx.images.some((i) => i.role === 'logo'),
    mapEmbed: ctx.settings.mapEmbed !== false,
    contactShortcode: contactForm(ctx).placeholder,
    menuSlug: ctx.menu.slug,
    pages: Object.fromEntries(SITE_PAGE_ROLES.map((r) => [r, { title: pageTitle(lang, r), url: r === 'home' ? '/' : `/${pageSlug(lang, r)}/` }])),
    services: ctx.services.map((s) => ({ name: s.name || s.slug, url: `/${s.slug}/` })),
  };
}

/** The Elementor documents of the project (built once per context), from its template or its Template Kit. */
export function builtSite(ctx) {
  if (ctx.kit) ctx.built ||= buildKitSite(ctx.kit, siteInfo(ctx));
  else if (ctx.template) ctx.built ||= buildSite(ctx.template.spec, siteInfo(ctx));
  return ctx.built || null;
}

/** Does the project have a design (a category template or a Template Kit)? */
export const hasDesign = (ctx) => Boolean(ctx.template || ctx.kit);

/** What a generation is made with: the export checks that the project still uses the same design. */
export function designInfo(ctx) {
  if (ctx.kit) return { kitId: ctx.kit.id, kitName: ctx.kit.name, kitVersion: ctx.kit.version };
  return ctx.template ? { templateId: ctx.template.id, templateName: ctx.template.name } : {};
}

/** Where a kit page comes from (shown in the preview). */
function kitPageTitle(kit, entry) {
  if (entry?.source === 'kit') return `${kit.name} – ${entry.templateTitle}`;
  if (entry?.source === 'composed') return `${kit.name} – composed from its sections`;
  return `${kit.name} – built with the kit colors`;
}

/** The pages to generate: the template documents (5 pages, single post, header, footer) + one article per service. */
export function buildPages(ctx) {
  if (!hasDesign(ctx)) return [];
  const docs = ctx.kit ? builtSite(ctx).docs : null;
  const lang = ctx.project.language;
  const pages = TEMPLATE_ROLES.map((role) => {
    const key = role.replace('_', '-');
    const noUrl = role === 'header' || role === 'footer' || role === 'single_post';
    return {
      key,
      role,
      title: pageTitle(lang, role),
      templateId: ctx.kit ? `kit-${ctx.kit.id}` : ctx.template.id,
      templateTitle: ctx.kit ? kitPageTitle(ctx.kit, docs[role]) : ctx.template.name,
      serviceId: null,
      prefix: key.replace(/-/g, '_'),
      slug: noUrl ? null : pageSlug(lang, role),
    };
  });
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

/** Best internal URL for a link / button text when no valid one is available. */
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
      label: 'Article text',
      maxLength: 2500,
      minLength: 300,
      hint: `full article about the service: what it includes, who it is for, benefits (SEO). At least 300 characters of text (ideally 1200–2000). HTML with <h2>, <p>, <ul>/<li>. The last paragraph is a call to action linking to the contact page: <a href="${cUrl}">…</a>`,
    },
    { id: 'post.excerpt', path: null, original: '', format: 'text', widget: 'post', key: 'excerpt', section: 0, label: 'Excerpt', maxLength: 160, hint: 'short summary of the article (used in service grids)' },
  ];
}

/**
 * Build and analyse the document of a page. Returns a fresh document every call, its fields
 * (with the builder marks: fixed / hint / limits / share) and the role of each image slot.
 */
export function analyzePage(ctx, page) {
  if (!page.templateId) return { doc: null, fields: postFields(ctx), slots: [], slotRoles: {}, widgets: {}, contacts: { emails: [], phones: [] } };
  const entry = builtSite(ctx)?.docs[page.role];
  if (!entry) throw new Error(`The template has no "${page.role}" document.`);
  const doc = structuredClone(entry.doc);
  const heroName = page.role === 'home' ? 'hero' : ['header', 'footer', 'single_post'].includes(page.role) ? null : 'intro';
  // Kit projects: the texts of HTML widgets, counters and prices are fields too (also in the fallback builder documents)
  const analysis = analyzeDocument(doc, { prefix: page.prefix, heroName, ...(builtSite(ctx).analyzeOptions || {}) });
  for (const f of analysis.fields) {
    const m = entry.marks.get(f.ref) || {};
    if (m.fixed) f.fixed = true;
    if (m.hint) f.hint = m.hint;
    if (m.max) f.maxLength = m.max;
    if (m.min) f.minLength = m.min;
    if (m.share) f.share = m.share;
  }
  const slotRoles = {};
  for (const s of analysis.slots) {
    const m = entry.marks.get(s.id) || {};
    slotRoles[s.id] = m.slot || 'photo';
    if (m.service != null) s.service = m.service;
  }
  return { doc, ...analysis, slotRoles };
}

/**
 * Fields the template builder already filled with their final value (page titles, menus, service
 * names, contact data, copyright, links) are not sent to the AI.
 * Returns { source: 'auto', value } or { source: 'ai' }.
 */
export function classifyField(field) {
  if (field.fixed) return { source: 'auto', value: field.original };
  return { source: 'ai' };
}

/** What is missing before generation? Errors block generation, warnings don't. */
export function checkReadiness(ctx, user = null) {
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
  // The "plain" page banner of a template has no photo
  if (!byRole('subheader').length && ctx.template?.spec?.layout?.subheader !== 'plain') add('images', 'warning', 'Subheader image is missing.');
  if (!byRole('logo').length) add('images', 'warning', 'Logo is missing: header and footer show the site name instead.');
  for (const s of ctx.services) {
    if (!ctx.images.some((i) => i.role === 'service' && i.service_id === s.id)) add('images', 'warning', `Service "${s.name || '?'}" has no image.`);
  }
  if (ctx.images.some((i) => i.role && !i.alt_text.trim())) add('images', 'warning', 'Some assigned images have no ALT text.');
  if (!galleryPool(ctx.images).length) add('images', 'warning', 'Upload some photos: the Gallery page shows all of them and they fill the images of every section.');
  for (const [role, kind, label] of [['hero_home', 'hero', 'Home hero'], ['subheader', 'subheader', 'Subheader']]) {
    const { width, height } = { ...DEFAULT_CROP_SIZES[kind], ...ctx.settings.image[kind] };
    for (const img of byRole(role).filter((i) => i.mime !== 'image/svg+xml' && i.width && (i.width < width || i.height < height))) {
      add('images', 'warning', `${label} image "${img.file_name}" is ${img.width}×${img.height}px: it is cropped to ${width}×${height}px, so it will be enlarged and may look blurry. Use a photo of at least ${width}×${height}px.`);
    }
  }

  if (!hasDesign(ctx)) add('template', 'error', 'Choose a category and one of its saved templates (or generate a new one), or a Template Kit.');
  if (ctx.kit) {
    // The demo of the kit is about another business: the AI needs the business category of the site
    if (!p.industry.trim()) add('site', 'error', 'Industry is required with a Template Kit: the AI rewrites every text of the kit for this business category.');
    if (!ctx.kit.analysis?.ai) add('template', 'warning', 'The Template Kit has not been analyzed by the AI yet: analyze it in Template Kit, so the texts fit each section better.');
    if (!Object.values(ctx.kit.roles).includes('home')) add('template', 'warning', 'No template of the kit is used as Home page: the Home page is composed from the sections of the kit.');
  }

  // Each user generates with their own AI provider (the project is shared, the API keys are not)
  const providerId = ctx.settings.generation.providerId;
  const provider = providerId ? get('SELECT id, owner FROM ai_providers WHERE id = ?', providerId) : null;
  if (!provider) add('ai', 'error', 'Select an AI provider (Settings → AI Providers to add one).');
  else if (!canUseProvider(provider, user)) add('ai', 'error', 'The AI provider of this project belongs to another user: choose one of yours in the AI step.');

  return { ready: !items.some((i) => i.level === 'error'), items };
}
