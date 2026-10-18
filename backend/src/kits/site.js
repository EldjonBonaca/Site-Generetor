/**
 * The Elementor documents of a project built from a Template Kit: the same output as the template
 * builder (templates/builder.js) — { docs: { role: { doc, marks } }, globalStyles } — so generation,
 * preview, export and the WordPress plugin work the same way.
 *
 * The structure of the kit is never changed: every section, column, card and widget of a kit
 * template stays where it is, with its type, settings, plugins and styles (palette and fonts are the
 * global styles of the kit). Only the content changes:
 *  - texts: written by the AI for the business (hint = the section they belong to, from the kit
 *    analysis); service cards get the service names and links (cards beyond the services are
 *    written by the AI too); inner pages get their title in the page banner; texts that are only a
 *    phone, an email or a copyright line get the site ones;
 *  - images: the photos of the demo are replaced by the project images (hero, subheader, service,
 *    logo, photos), cropped to the proportions of the demo photo (kits/demo-images.js); the graphics
 *    of the design (transparent PNG / SVG ornaments, client logos) stay; avatars of demo reviews are emptied;
 *  - menus -> the menu of the site; maps -> the site address; a form that points to a form missing
 *    from the kit (form plugins, shortcodes) -> the Contact Form 7 form of the site, in the same place;
 *  - images in CSS / page settings -> removed.
 * What the generator cannot fix without changing the structure (demo videos, client logos, more
 * cards than services) is reported in the checks of the export, together with a comparison of every
 * page with its kit template (kits/structure.js).
 * Pages the kit does not have are composed from its sections (page title banner + matching sections,
 * + a photo gallery / the contact form when no section of the kit has one); a missing header, footer
 * or single post template is built by the template builder with the kit colors.
 */
import crypto from 'node:crypto';
import { analyzeDocument, getRoot, getAtPath, isGalleryArray, looksLikePhone, EMAIL_IN_TEXT } from '../elementor/analyze.js';
import { buildSite } from '../templates/builder.js';
import { sanitizeSpec } from '../templates/spec.js';
import { stripHtml } from '../lib/util.js';
import { loadKitTemplate } from './read.js';
import { SECTION_TYPES } from './analysis.js';

/** Options of analyzeDocument for kit documents (texts of HTML widgets, counters and prices are demo content too). */
export const KIT_ANALYZE_OPTIONS = Object.freeze({ htmlText: true, numbers: true });
/** Image placed where the kit had a dynamic image: always replaced by a project image. */
export const KIT_PLACEHOLDER = 'https://kit.invalid/placeholder.jpg';

const PAGE_ROLES = ['home', 'about', 'services', 'gallery', 'contact'];
const COPYRIGHT_RE = /©|&copy;|copyright|all rights reserved|tutti i diritti|todos los derechos|tous droits|alle rechte/i;
const LINK_KEY = /(^|_)link$|^url$/;
const isLink = (v) => v && typeof v === 'object' && !Array.isArray(v) && typeof v.url === 'string' && ('is_external' in v || 'nofollow' in v);
const newId = (seed) => crypto.createHash('md5').update(String(seed)).digest('hex').slice(0, 7);
const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Largest side of a crop: the photos are exported at most this wide. */
const MAX_CROP_WIDTH = 1920;

// ---------------------------------------------------------------------------
// Element helpers
// ---------------------------------------------------------------------------

function walkElements(list, fn, parent = null) {
  for (const el of list || []) {
    if (!el || typeof el !== 'object') continue;
    fn(el, parent);
    walkElements(el.elements, fn, el);
  }
}

function widgetsIn(el) {
  const out = [];
  walkElements([el], (e) => e.elType === 'widget' && out.push(e));
  return out;
}

function idsIn(el) {
  const out = new Set();
  walkElements([el], (e) => e.id && out.add(e.id));
  return out;
}

const settingsOf = (el) => (el.settings && typeof el.settings === 'object' && !Array.isArray(el.settings) ? el.settings : {});

/** Deep copy with new (deterministic) element and repeater item ids. */
function cloneWithNewIds(el, seed) {
  const copy = structuredClone(el);
  walkElements([copy], (e) => {
    if (e.id) e.id = newId(`${seed}:${e.id}`);
    for (const v of Object.values(e.settings || {})) {
      if (Array.isArray(v)) v.forEach((it) => it && typeof it === 'object' && '_id' in it && (it._id = newId(`${seed}:${it._id}`)));
    }
  });
  return copy;
}

const widget = (seed, widgetType, settings) => ({ id: newId(seed), elType: 'widget', widgetType, settings, elements: [], isInner: false });

/** New top-level wrapper in the layout system of the kit (flexbox containers or sections / columns), for composed pages. */
function wrapper(elements, children, seed) {
  if (elements.some((e) => e.elType === 'container')) {
    return { id: newId(`${seed}:c`), elType: 'container', settings: { flex_direction: 'column', padding: { unit: 'px', top: '60', right: '20', bottom: '60', left: '20', isLinked: false } }, elements: children, isInner: false };
  }
  return {
    id: newId(`${seed}:s`),
    elType: 'section',
    settings: { padding: { unit: 'px', top: '60', right: '0', bottom: '60', left: '0', isLinked: false } },
    isInner: false,
    elements: [{ id: newId(`${seed}:col`), elType: 'column', settings: { _column_size: 100 }, elements: children, isInner: false }],
  };
}

// ---------------------------------------------------------------------------
// Service cards
// ---------------------------------------------------------------------------

const CARD_WIDGETS = new Set(['image-box', 'call-to-action', 'flip-box']);

/** A "card": exactly one card widget (image box, CTA, flip box; icon box inside service sections) or image + heading + link. */
function isCard(el, iconBoxes) {
  const ws = widgetsIn(el);
  const cardWidgets = ws.filter((w) => CARD_WIDGETS.has(w.widgetType) || (iconBoxes && w.widgetType === 'icon-box'));
  if (cardWidgets.length) return cardWidgets.length === 1;
  const has = (t) => ws.some((w) => w.widgetType === t);
  const hasLink = has('button') || ws.some((w) => isLink(w.settings?.link) && w.settings.link.url);
  return has('image') && has('heading') && hasLink && ws.length <= 6;
}

/** Groups of sibling cards in document order: [{ parent, holder }] (holder = the array containing parent). */
function findCardGroups(elements, roots, iconBoxes) {
  const groups = [];
  const walk = (el, holder) => {
    if (!el || typeof el !== 'object') return;
    const kids = el.elements || [];
    if (kids.length >= 2 && kids.every((k) => k.elType === kids[0].elType && isCard(k, iconBoxes))) {
      groups.push({ parent: el, holder });
      return;
    }
    kids.forEach((k) => walk(k, kids));
  };
  for (const el of elements) if (roots.includes(el)) walk(el, elements);
  return groups;
}

const TITLE_KEYS = { 'image-box': 'title_text', 'icon-box': 'title_text', 'call-to-action': 'title', 'flip-box': 'title_text_a', heading: 'title' };

/**
 * Card of a service: its name in the title and its URL in the links. A card beyond the services
 * keeps its texts for the AI and links to the services page. Returns the refs to mark as fixed.
 */
function fillCard(card, { name, url }) {
  const fixed = [];
  const ws = widgetsIn(card);
  const titled = name && ws.find((w) => TITLE_KEYS[w.widgetType] && typeof w.settings?.[TITLE_KEYS[w.widgetType]] === 'string');
  if (titled) {
    const key = TITLE_KEYS[titled.widgetType];
    titled.settings[key] = name;
    fixed.push(`${titled.id}:${key}`);
  }
  for (const w of ws) {
    for (const [key, value] of Object.entries(w.settings || {})) {
      if (!LINK_KEY.test(key) || !isLink(value)) continue;
      value.url = url;
      fixed.push(`${w.id}:${key}.url`);
    }
    if (w.widgetType === 'image' && w.settings?.link_to && w.settings.link_to !== 'none') {
      w.settings.link_to = 'custom';
      w.settings.link = { ...(isLink(w.settings.link) ? w.settings.link : { is_external: '', nofollow: '', custom_attributes: '' }), url };
      fixed.push(`${w.id}:link.url`);
    }
  }
  return fixed;
}

// ---------------------------------------------------------------------------
// Demo content: videos, forms, maps, logos, CSS images
// ---------------------------------------------------------------------------

const mapIframe = (address) =>
  `<iframe src="https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed" width="100%" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
const MAP_HTML = /google\.[a-z.]+\/maps|maps\.google|openstreetmap/i;
const VIDEO_HTML = /<iframe[^>]+(youtube|youtu\.be|vimeo|wistia|dailymotion)/i;
// Forms of the form plugins (not search / login forms, not contact info boxes). The Elementor Pro
// "form" widget is handled apart: its fields are in the widget.
const isPluginForm = (type) =>
  type !== 'form' && (/(^|[-_])forms?($|[-_])|^rform$|^metform|contact-?form|wpforms|fluent-?form|gravity-?form|ninja-?form|cf7/.test(type) && !/search|login|register|password|comment|subscribe|mailchimp/.test(type));
const placeholderImage = () => ({ url: KIT_PLACEHOLDER, id: '', alt: '', source: 'library' });
const LOGO_WIDGET = /(^|-)site-logo$|^retina/;

/** CSS without demo images (url(...) of remote files). */
const cleanCss = (css) => css.replace(/url\(\s*(['"]?)(https?:)?\/\/[^)]*\)/gi, 'none');

/**
 * Demo content that is neither a text nor an image slot, in every document of the kit: images in
 * CSS and in the page settings are removed, a dynamic image (featured image of a demo post) becomes
 * an image slot. Every widget keeps its type and settings: dynamic site logo / title / page title
 * widgets show the data of the site, demo videos stay (they are counted for the checks).
 * @returns {number} demo videos (widgets, iframes, video backgrounds)
 */
function cleanDemo(doc) {
  let videos = 0;
  walkElements(getRoot(doc).elements, (el) => {
    const s = settingsOf(el);
    if (s.background_background === 'video' && s.background_video_link) videos++;
    if (typeof s.custom_css === 'string') s.custom_css = cleanCss(s.custom_css);
    if (el.elType !== 'widget') return;
    const type = el.widgetType || '';
    if (type === 'video' || (type === 'html' && VIDEO_HTML.test(s.html || ''))) videos++;
    // A dynamic image (featured image, ACF…) -> a project image; the site logo widgets stay dynamic
    if (s.__dynamic__ && typeof s.__dynamic__ === 'object' && !LOGO_WIDGET.test(type) && !(doc.type === 'single-post' || doc._role === 'single_post')) {
      for (const key of Object.keys(s.__dynamic__)) {
        if (/image/.test(key)) {
          delete s.__dynamic__[key];
          s[key] = placeholderImage();
        }
      }
    }
  });
  // Page settings: no demo background image or CSS image
  const ps = doc.page_settings;
  if (ps && typeof ps === 'object' && !Array.isArray(ps)) {
    for (const [k, v] of Object.entries(ps)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.url === 'string' && v.url) delete ps[k];
      else if (k === 'custom_css' && typeof v === 'string') ps[k] = cleanCss(v);
    }
  }
  return videos;
}

/**
 * Forms and maps of a page (a newsletter signup is not the contact form):
 *  - a form that points to a form of a plugin (RomethemeForm, WPForms, Fluent Forms, a form
 *    shortcode, an HTML form) cannot work on the site, because that form is not in the kit: the
 *    widget becomes the Contact Form 7 form of the site, in the same place, with its layout settings;
 *  - the Elementor Pro form widget has its fields in the widget and stays (the WordPress plugin
 *    shows the site form instead only when Elementor Pro is missing);
 *  - maps show the address of the site.
 * @returns {{ forms: number, swaps: string[] }}
 */
function prepareForms(doc, info, site) {
  let forms = 0;
  const swaps = [];
  for (const top of getRoot(doc).elements) {
    if (info.get(top)?.type === 'newsletter') continue;
    walkElements([top], (el) => {
      if (el.elType !== 'widget') return;
      const type = el.widgetType || '';
      const s = settingsOf(el);
      if (type === 'form') forms++;
      else if (isPluginForm(type) || (type === 'shortcode' && /form/i.test(s.shortcode || '')) || (type === 'html' && /<form\b/i.test(s.html || ''))) {
        swaps.push(type);
        el.widgetType = 'shortcode';
        el.settings = { shortcode: site.contactShortcode, ...Object.fromEntries(Object.entries(s).filter(([k]) => k.startsWith('_'))) };
        forms++;
      } else if (type === 'google_maps') s.address = site.address;
      else if (type === 'html' && MAP_HTML.test(s.html || '')) s.html = mapIframe(site.address);
    });
  }
  return { forms, swaps };
}

/** Navigation menus of any widget -> the menu of the site. */
function setMenus(doc, menuSlug) {
  walkElements(getRoot(doc).elements, (el) => {
    if (el.elType !== 'widget' || !/nav|menu/.test(el.widgetType || '')) return;
    const s = el.settings || (el.settings = {});
    if (/^(nav-menu|mega-menu|navigation-menu|hfe-nav-menu|uael-nav-menu)$/.test(el.widgetType)) s.menu = menuSlug;
    for (const [k, v] of Object.entries(s)) {
      if (/menu/.test(k) && typeof v === 'string' && v && !/color|typography|align|icon|toggle|layout|animation|pointer|indicator|dropdown|breakpoint|width|padding|margin|border|size|position|style|effect|type|text|label|title/.test(k)) s[k] = menuSlug;
    }
  });
}

/** Header / footer: the widget that shows the logo (a site logo widget, or the first image). Its id or null. */
function findLogo(doc, role) {
  const { elements } = getRoot(doc);
  let logo = null;
  walkElements(elements, (el) => {
    if (!logo && el.elType === 'widget' && LOGO_WIDGET.test(el.widgetType || '')) logo = el;
  });
  if (!logo) {
    walkElements(role === 'footer' ? elements.slice(0, 1) : elements, (el) => {
      if (!logo && el.elType === 'widget' && el.widgetType === 'image') logo = el;
    });
  }
  return logo?.id || null;
}

// ---------------------------------------------------------------------------
// Images: photos (replaced, cropped like the demo photo) and graphics of the design (kept)
// ---------------------------------------------------------------------------

/** Measured demo image of a URL (kits/demo-images.js), or null. */
const measured = (demo, url) => (demo?.[url] && !demo[url].error ? demo[url] : null);
const ELEMENTOR_PLACEHOLDER = /\/elementor\/assets\/images\/placeholder\.png(\?|$)/i;

/**
 * Is a demo image a graphic of the design (ornament, shape, icon, logo) rather than a photo?
 * Measured: an SVG or an image with transparent pixels. Not measured: SVG / GIF, images of client
 * logo strips, and PNGs repeated in the template or shown small.
 */
function isGraphic(url, { demo, settings, sectionType, repeated }) {
  if (!url || ELEMENTOR_PLACEHOLDER.test(url)) return false; // an empty slot of the demo: a photo goes there
  const m = measured(demo, url);
  if (m) return m.format === 'svg' || !m.opaque;
  if (/\.(svg|gif)(\?|$)/i.test(url) || sectionType === 'clients') return true;
  return /\.png(\?|$)/i.test(url) && (repeated || /^(thumbnail|medium)$/.test(settings.image_size || settings.thumbnail_size || ''));
}

/** Size of the demo image of a slot: its custom size in Elementor, else the measured demo image. Null when unknown. */
function demoSize(settings, key, m) {
  for (const prefix of [key, 'image', 'thumbnail']) {
    if (settings[`${prefix}_size`] !== 'custom') continue;
    const d = settings[`${prefix}_custom_dimension`] || {};
    const w = Number(d.width);
    const h = Number(d.height);
    if (w > 0 && h > 0) {
      const width = Math.min(MAX_CROP_WIDTH, Math.max(w, m?.width || 0));
      return { width, height: Math.round((width * h) / w) };
    }
  }
  if (!m?.width || !m?.height) return null;
  const width = Math.min(MAX_CROP_WIDTH, m.width);
  return { width, height: Math.round((width * m.height) / m.width) };
}

// ---------------------------------------------------------------------------
// Composition of missing pages + builder fallback
// ---------------------------------------------------------------------------

/** Section types a page the kit does not have is composed of (after the page title banner). */
const COMPOSE = {
  about: ['about', 'stats', 'features', 'team', 'testimonials'],
  services: ['services', 'process', 'pricing', 'cta'],
  gallery: ['gallery', 'cta'],
  contact: ['contact'],
};

/** Builder template with the colors and fonts of the kit (header, footer, single post or a page the kit cannot compose). */
export function fallbackSpec(globalStyles) {
  const gs = globalStyles || {};
  const color = (id) => {
    const v = (gs.system_colors || []).find((c) => c?._id === id)?.color || '';
    return /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v) ? v.slice(0, 7) : undefined;
  };
  const font = (id) => (gs.system_typography || []).find((f) => f?._id === id)?.typography_font_family;
  return sanitizeSpec({
    style: { colors: { primary: color('primary'), secondary: color('secondary'), accent: color('accent'), heading: color('primary') && color('text'), text: color('text') }, fonts: { heading: font('primary'), body: font('text') } },
  });
}

/**
 * Normalize a kit document: { version, title, type, content, page_settings }.
 * Website kits name the page settings "settings"; loose exports may be a bare element list.
 */
function normalizeDoc(raw, title) {
  const doc = Array.isArray(raw) ? { content: raw } : { ...raw };
  const ps = doc.page_settings && typeof doc.page_settings === 'object' && !Array.isArray(doc.page_settings) ? doc.page_settings : doc.settings && typeof doc.settings === 'object' && !Array.isArray(doc.settings) ? doc.settings : {};
  return { version: doc.version || '0.4', title: doc.title || title, type: doc.type || 'page', content: Array.isArray(doc.content) ? doc.content : [], page_settings: { ...ps } };
}

/** Does an element contain a gallery (a list of images)? */
const hasGallery = (el) => {
  let found = false;
  walkElements([el], (e) => Object.entries(e.settings || {}).some(([k, v]) => isGalleryArray(k, v)) && (found = true));
  return found;
};

const hasWidget = (doc, type) => {
  let found = false;
  walkElements(getRoot(doc).elements, (el) => el.widgetType === type && (found = true));
  return found;
};

// ---------------------------------------------------------------------------
// Sections of each page: the kit default or the choice made in the project
// ---------------------------------------------------------------------------

const THEME_ROLES = ['header', 'footer', 'single_post'];
const MAX_SECTIONS = 40;
const templateFor = (kit, role) => Object.keys(kit.roles).find((id) => kit.roles[id] === role) || null;
const analysisSections = (kit, id) => kit.analysis?.templates?.[id]?.sections || [];

/** Templates whose sections can be used in the pages of the site (not header, footer, single post). */
export function sectionTemplates(kit) {
  return kit.info.templates.filter((t) => t.valid && t.sections > 0 && !THEME_ROLES.includes(kit.roles[t.id]));
}

/** A list of sections chosen in the project, without the references that no longer exist in the kit (null when empty). */
export function validLayout(kit, list) {
  if (!Array.isArray(list)) return null;
  const usable = new Map(sectionTemplates(kit).map((t) => [t.id, t.sections]));
  const out = list
    .filter((e) => e && typeof e.template === 'string' && Number.isInteger(e.index) && e.index >= 0 && e.index < (usable.get(e.template) || 0))
    .slice(0, MAX_SECTIONS)
    .map((e) => ({ template: e.template, index: e.index }));
  return out.length ? out : null;
}

/** Sections a page the kit does not have is composed of: banner of an inner page + the matching sections of the other templates. */
function composedSections(kit, role) {
  const order = [...sectionTemplates(kit)].sort((a, b) => Number(kit.roles[b.id] === 'home') - Number(kit.roles[a.id] === 'home'));
  const pick = (type, from = order) => {
    for (const t of from) {
      const index = analysisSections(kit, t.id).findIndex((s) => s.type === type);
      if (index >= 0 && index < t.sections) return { template: t.id, index };
    }
    return null;
  };
  const banner = pick('page_title', [...order].reverse());
  const body = COMPOSE[role].map((type) => pick(type)).filter(Boolean);
  if (!body.length && (role === 'about' || role === 'services')) return []; // built by the template builder
  return [banner, ...body].filter(Boolean);
}

/**
 * Sections of each page of the site, as references { template, index } to the sections of the kit:
 * the choice made in the project (settings.kitLayout: remove, add from any template of the kit,
 * reorder), or the kit default (every section of the template of the page; for a page the kit does
 * not have, the composed sections; none = the page is built by the template builder).
 * @returns {Record<role, { custom: boolean, template: string|null, sections: { template, index }[] }>}
 */
export function kitLayouts(kit, custom = {}) {
  const out = {};
  for (const role of PAGE_ROLES) {
    const template = templateFor(kit, role);
    const own = template && kit.info.templates.find((t) => t.id === template && t.valid);
    const chosen = validLayout(kit, custom?.[role]);
    const sections = chosen || (own ? Array.from({ length: own.sections }, (_, index) => ({ template, index })) : composedSections(kit, role));
    out[role] = { custom: Boolean(chosen), template: own ? template : null, sections };
  }
  return out;
}

/** Short signature of the sections of each page: a generation must be made with the same sections. */
export function kitLayoutSignatures(kit, custom = {}) {
  return Object.fromEntries(
    Object.entries(kitLayouts(kit, custom)).map(([role, l]) => [role, crypto.createHash('md5').update(l.sections.map((s) => `${s.template}#${s.index}`).join('|')).digest('hex').slice(0, 12)])
  );
}

/** Does the page have a contact form (any form widget, form shortcode or HTML form)? */
const hasContactForm = (content) => {
  let found = false;
  walkElements(content, (el) => {
    const t = el.widgetType || '';
    const s = settingsOf(el);
    if (el.elType === 'widget' && (t === 'form' || isPluginForm(t) || (t === 'shortcode' && /form/i.test(s.shortcode || '')) || (t === 'html' && /<form\b/i.test(s.html || '')))) found = true;
  });
  return found;
};

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * @param {object} kit     { id, name, dir (absolute), info, analysis, roles: { templateId: role }, demoImages }
 * @param {object} site    siteInfo(ctx) (generation/plan.js)
 * @param {object} custom  sections chosen in the project for each page (settings.kitLayout), optional
 * @returns {{ docs: Record<role, { doc, marks: Map, sections, notes, origin, source, templateTitle }>, globalStyles, analyzeOptions }}
 *   source = 'kit' (the template of the page as it is), 'custom' (sections chosen in the project),
 *   'composed' (a page the kit does not have) or 'builder';
 *   origin = the document before the generator touched it (for the structure check of the export)
 */
export function buildKitSite(kit, site, custom = {}) {
  const cache = new Map();
  const load = (id) => {
    if (!cache.has(id)) {
      const t = kit.info.templates.find((x) => x.id === id);
      const raw = t?.valid ? loadKitTemplate(kit.dir, id) : null;
      cache.set(id, raw ? normalizeDoc(raw, t.title) : null);
    }
    const doc = cache.get(id);
    return doc ? structuredClone(doc) : null;
  };
  const titleOf = (id) => kit.info.templates.find((t) => t.id === id)?.title || null;
  let builder = null;
  const builderDoc = (role) => {
    builder ||= buildSite(fallbackSpec(kit.info.globalStyles), site);
    return builder.docs[role];
  };

  /**
   * A page made of sections of the kit, each one exactly as in the kit (the sections of the page's
   * own template keep their ids, the others get new ones). What a page needs and none of its
   * sections has is added in the layout system of the kit: the photo gallery, the contact form + map.
   */
  const assemble = (role, entries, own) => {
    const used = new Set();
    const content = [];
    const sections = [];
    entries.forEach((e, n) => {
      const el = load(e.template)?.content[e.index];
      if (!el) return;
      const keepIds = e.template === own && !used.has(e.index);
      if (keepIds) used.add(e.index);
      content.push(keepIds ? el : cloneWithNewIds(el, `${role}:${e.template}:${e.index}:${n}`));
      sections.push(analysisSections(kit, e.template)[e.index] || { type: 'other', description: '' });
    });
    if (!content.length) return null;
    if (role === 'gallery' && !content.some((el) => hasGallery(el))) {
      const gallery = widget('kit-gallery', 'image-gallery', { wp_gallery: [{ id: '', url: KIT_PLACEHOLDER }], thumbnail_size: 'medium_large', gallery_columns: '3', gallery_link: 'file', open_lightbox: 'yes', image_spacing: 'custom', image_spacing_custom: { unit: 'px', size: 12 } });
      content.splice(Math.min(1, content.length), 0, wrapper(content, [gallery], 'kit-gallery'));
      sections.splice(Math.min(1, sections.length), 0, { type: 'gallery', description: '' });
    }
    if (role === 'contact' && !hasContactForm(content)) {
      const added = [widget('kit-cf7', 'shortcode', { shortcode: site.contactShortcode })];
      if (site.address) added.push(widget('kit-map', 'html', { html: mapIframe(site.address) }));
      content.push(wrapper(content, added, 'kit-contact'));
      sections.push({ type: 'contact', description: '' });
    }
    const page = own ? load(own) : null;
    const doc = { version: page?.version || '0.4', title: page?.title || role, type: page?.type || 'page', content, page_settings: page ? page.page_settings : { hide_title: 'yes' } };
    return { doc, sections };
  };

  const layouts = kitLayouts(kit, custom);
  const docs = {};
  for (const role of [...PAGE_ROLES, ...THEME_ROLES]) {
    let doc = null;
    let sections = [];
    let source = 'kit';
    let id = null;
    const layout = layouts[role];
    if (layout && !layout.custom && layout.template) {
      // The template of the page as it is in the kit
      id = layout.template;
      doc = load(id);
      sections = analysisSections(kit, id);
    } else if (layout) {
      const built = assemble(role, layout.sections, layout.template);
      if (built) ({ doc, sections } = built);
      source = layout.custom ? 'custom' : 'composed';
      id = layout.template;
    } else {
      id = templateFor(kit, role);
      doc = id ? load(id) : null;
      sections = id ? analysisSections(kit, id) : [];
      // The single post template must show the article: without the post content widget the builder one is used
      if (doc && role === 'single_post' && !hasWidget(doc, 'theme-post-content')) doc = null;
    }
    if (!doc) {
      const b = builderDoc(role);
      docs[role] = { doc: b.doc, marks: b.marks, sections: [], notes: null, origin: null, source: 'builder', templateTitle: null };
      continue;
    }
    const origin = structuredClone(doc);
    doc._role = role;
    docs[role] = { ...prepareDocument(doc, role, sections, site, kit.demoImages), origin, source, templateTitle: id ? titleOf(id) : null };
    delete docs[role].doc._role;
  }
  return { docs, globalStyles: kit.info.globalStyles || null, analyzeOptions: KIT_ANALYZE_OPTIONS };
}

/**
 * Prepare one kit document for the site (the document is a fresh copy and is changed in place;
 * its elements are never added, removed, moved or changed into other widgets, except a plugin form).
 * @param {object} demo  measured demo images of the kit (kits/demo-images.js), optional
 * @returns {{ doc, marks: Map, sections: [{ type, description }], notes }}
 *   notes = what the checks of the export report: { videos, clientLogos, extraCards, hiddenServices, forms, formSwaps, keptGraphics }
 */
export function prepareDocument(doc, role, sectionInfo, site, demo = null) {
  const { elements } = getRoot(doc);
  // Kit analysis of each top-level section
  const info = new Map(elements.map((el, i) => [el, sectionInfo[i] || { type: 'other', description: '' }]));
  const sections = elements.map((el) => info.get(el));
  const fixedRefs = new Set();
  const isPage = PAGE_ROLES.includes(role);
  const notes = { videos: 0, clientLogos: 0, extraCards: 0, hiddenServices: 0, forms: 0, formSwaps: [], keptGraphics: 0 };

  notes.videos = cleanDemo(doc);
  if (isPage) notes.clientLogos = sections.filter((s) => s.type === 'clients').length;
  setMenus(doc, site.menuSlug);

  // 1. Service cards (every card of the kit stays): the first ones get the services, in order; the
  //    others are written by the AI and link to the services page
  const cardOf = new Map(); // element id -> service index (-1 = card beyond the services)
  if ((role === 'home' || role === 'services') && site.services.length) {
    const typed = elements.filter((e) => info.get(e)?.type === 'services');
    const roots = typed.length ? typed : elements;
    const cards = findCardGroups(elements, roots, typed.length > 0).flatMap((g) => g.parent.elements);
    cards.forEach((card, i) => {
      const svc = site.services[i];
      fillCard(card, svc || { name: null, url: site.pages.services?.url || '/' }).forEach((r) => fixedRefs.add(r));
      for (const elId of idsIn(card)) cardOf.set(elId, svc ? i : -1);
    });
    if (cards.length) {
      notes.extraCards = Math.max(0, cards.length - site.services.length);
      if (role === 'services') notes.hiddenServices = Math.max(0, site.services.length - cards.length);
    }
  }

  // 2. Forms and maps (pages only: a newsletter form in the footer stays)
  if (isPage) {
    const forms = prepareForms(doc, info, site);
    notes.forms = forms.forms;
    notes.formSwaps = forms.swaps;
  }

  // 3. Inner pages: the banner title is the page title
  const pageTitle = site.pages[role]?.title;
  if (isPage && role !== 'home' && pageTitle && elements.length) {
    const first = info.get(elements[0])?.type === 'page_title' && widgetsIn(elements[0]).find((w) => w.widgetType === 'heading' && typeof w.settings?.title === 'string');
    if (first) {
      first.settings.title = pageTitle;
      fixedRefs.add(`${first.id}:title`);
    }
  }

  // 4. Header / footer: the logo widget shows the logo of the site; a heading with the site name is fixed
  const logoId = role === 'header' || role === 'footer' ? findLogo(doc, role) : null;
  if (logoId) {
    walkElements(elements, (el) => {
      if (el.elType === 'widget' && el.widgetType === 'heading' && el.settings?.title === site.siteName) fixedRefs.add(`${el.id}:title`);
    });
  }

  // 5. Fields: phone / email / copyright only -> the site ones (fixed); the rest is for the AI
  const marks = new Map();
  const analysis = analyzeDocument(doc, KIT_ANALYZE_OPTIONS);
  for (const f of analysis.fields) {
    const plain = stripHtml(f.original).trim();
    // The value replaces the demo one, inside the same HTML wrapper when there is one
    const set = (value) => {
      const html = /<[a-z]/i.test(f.original);
      const v = !html ? value : plain && f.original.includes(plain) ? f.original.replace(plain, escapeHtml(value)) : `<p>${escapeHtml(value)}</p>`;
      setValue(doc, f.path, v);
      marks.set(f.ref, { fixed: true });
    };
    if (f.format === 'link' || f.format === 'number') {
      if (fixedRefs.has(f.ref)) marks.set(f.ref, { fixed: true });
      continue;
    }
    if (fixedRefs.has(f.ref)) marks.set(f.ref, { fixed: true });
    else if (COPYRIGHT_RE.test(plain) && plain.length < 200) set(site.copyright);
    else if (site.email && plain.match(EMAIL_IN_TEXT)?.[0] === plain) set(site.email);
    else if (site.phone && /^[+\d\s().-]+$/.test(plain) && looksLikePhone(plain)) set(site.phone);
  }

  // 6. Hints for the AI: the section each text belongs to
  const where = (index) => {
    if (role === 'header') return 'site header (shown on every page)';
    if (role === 'footer') return 'site footer (shown on every page)';
    const s = sections[index] || { type: 'other' };
    return `section ${index + 1} of the page, "${SECTION_TYPES[s.type] || 'Other'}"${s.description ? ` (${s.description})` : ''}`;
  };
  const listed = site.services.map((s) => `"${s.name}"`).join(', ');
  for (const f of analysis.fields) {
    const m = marks.get(f.ref) || {};
    if (m.fixed) continue;
    const card = cardOf.get(f.ref.split(':')[0]);
    const svc = card != null && card >= 0 ? site.services[card] : null;
    const extra = card === -1 && `card beyond the listed services: present another real aspect of the offer of this business (a speciality, a package, a benefit), not one of ${listed}`;
    m.hint = [where(f.section), svc && `card of the service "${svc.name}"`, extra, f.hint].filter(Boolean).join('; ');
    marks.set(f.ref, m);
  }

  // 7. Image slots. Photos -> hero / subheader / service / photos, cropped to the size of the demo
  //    photo; graphics of the design -> kept; logo -> the site logo; avatars of demo reviews -> emptied
  const urlCount = {};
  for (const s of analysis.slots) if (s.kind !== 'gallery') urlCount[s.url] = (urlCount[s.url] || 0) + 1;
  const firstBg = analysis.slots.find((s) => s.section === 0 && s.kind === 'background') || null;
  const heroSlot = role === 'home' ? firstBg || analysis.slots.find((s) => s.section === 0 && s.kind !== 'gallery') : null;
  for (const s of analysis.slots) {
    const elId = s.id.split(':')[0];
    const type = sections[s.section]?.type;
    const settings = getAtPath(doc, s.path.slice(0, -1)) || {};
    const graphic = (url) => isGraphic(url, { demo, settings, sectionType: type, repeated: urlCount[url] > 1 });
    const mark = {};
    if (s.kind === 'gallery') {
      const urls = (getAtPath(doc, s.path) || []).map((it) => it?.url).filter(Boolean);
      if (urls.length && urls.filter(graphic).length * 2 > urls.length) {
        Object.assign(mark, { slot: 'keep', urls });
      } else {
        mark.slot = role === 'home' && s.section === 0 ? 'slideshow' : 'gallery';
        // A carousel outside the Gallery page: every photo cropped like the first demo photo
        const size = role !== 'gallery' && mark.slot === 'gallery' ? demoSize({}, s.key, measured(demo, urls[0])) : null;
        if (size) mark.crop = size;
      }
    } else if (heroSlot && s.id === heroSlot.id) mark.slot = 'hero';
    else if (role !== 'home' && isPage && firstBg && s.id === firstBg.id) mark.slot = 'subheader';
    else if (logoId && elId === logoId) mark.slot = 'logo';
    else if (graphic(s.url)) Object.assign(mark, { slot: 'keep', urls: [s.url] });
    else if (/testimonial|review|author|avatar/i.test(`${s.widget} ${s.key}`) || (type === 'testimonials' && s.kind === 'image')) mark.slot = 'remove';
    else {
      const card = cardOf.get(elId);
      if (card != null && card >= 0) Object.assign(mark, { slot: 'service_list', service: card });
      else mark.slot = 'photo';
      const size = demoSize(settings, s.key, measured(demo, s.url));
      if (size) mark.crop = size;
    }
    if (mark.slot === 'keep') notes.keptGraphics += mark.urls.length;
    marks.set(s.id, { ...(marks.get(s.id) || {}), ...mark });
  }

  return { doc, marks, sections, notes };
}

/** Set a value at a JSON path (the path comes from analyzeDocument on the same document). */
function setValue(doc, path, value) {
  const parent = path.slice(0, -1).reduce((o, k) => (o == null ? undefined : o[k]), doc);
  if (parent != null) parent[path[path.length - 1]] = value;
}

/** Sections of a kit page described for the site prompt. */
export function describePageSections(entry) {
  if (!entry?.sections?.length) return '';
  return entry.sections.map((s, i) => `${i + 1}. ${SECTION_TYPES[s.type] || 'Other'}${s.description ? ` – ${s.description}` : ''}`).join('\n');
}
