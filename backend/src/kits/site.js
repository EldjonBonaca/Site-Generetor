/**
 * The Elementor documents of a project built from a Template Kit: the same output as the template
 * builder (templates/builder.js) — { docs: { role: { doc, marks } }, globalStyles } — so generation,
 * preview, export and the WordPress plugin work the same way.
 *
 * Each page keeps the design and the structure of its kit template. What belongs to the demo is
 * replaced or removed here, and everything else is marked for the AI:
 *  - service cards: one per service (cloned or removed), title = service name, link = its article,
 *    image = the service image;
 *  - inner pages: the title of the page banner is the page title;
 *  - header / footer: the logo (or the site name), the menu of the site;
 *  - forms -> the Contact Form 7 form of the site; maps -> the address of the site;
 *  - demo videos -> photos; client logo strips -> removed; images in CSS / page settings -> removed;
 *  - texts that are only a phone, an email or a copyright line -> the site ones (fixed);
 *  - every other text: written by the AI (hint = the section it belongs to, from the kit analysis);
 *  - every image slot: a project image (hero, subheader, service, logo, photos), avatars removed.
 * Pages the kit does not have are composed from its sections (page title banner + matching sections);
 * a missing header, footer or single post template is built by the template builder with the kit colors.
 */
import crypto from 'node:crypto';
import { analyzeDocument, getRoot, isGalleryArray, looksLikePhone, EMAIL_IN_TEXT } from '../elementor/analyze.js';
import { buildSite } from '../templates/builder.js';
import { sanitizeSpec } from '../templates/spec.js';
import { stripHtml } from '../lib/util.js';
import { loadKitTemplate } from './read.js';
import { SECTION_TYPES } from './analysis.js';

/** Options of analyzeDocument for kit documents (texts of HTML widgets, counters and prices are demo content too). */
export const KIT_ANALYZE_OPTIONS = Object.freeze({ htmlText: true, numbers: true });
/** Image placed where the kit had a video or a dynamic image: always replaced by a project image. */
export const KIT_PLACEHOLDER = 'https://kit.invalid/placeholder.jpg';

const PAGE_ROLES = ['home', 'about', 'services', 'gallery', 'contact'];
const COPYRIGHT_RE = /©|&copy;|copyright|all rights reserved|tutti i diritti|todos los derechos|tous droits|alle rechte/i;
const LINK_KEY = /(^|_)link$|^url$/;
const isLink = (v) => v && typeof v === 'object' && !Array.isArray(v) && typeof v.url === 'string' && ('is_external' in v || 'nofollow' in v);
const newId = (seed) => crypto.createHash('md5').update(String(seed)).digest('hex').slice(0, 7);
const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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

/** New top-level wrapper in the layout system of the kit (flexbox containers or sections / columns). */
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

/** Make the number of cards equal to `needed` (cloning only when allowed). Returns the cards in order. */
function adjustCards(elements, info, roots, needed, allowClone, iconBoxes) {
  const groups = findCardGroups(elements, roots, iconBoxes);
  if (!groups.length || needed <= 0) return [];
  let count = groups.reduce((n, g) => n + g.parent.elements.length, 0);

  if (allowClone && count < needed) {
    const last = groups[groups.length - 1];
    if (last.parent.elType === 'container' || last.parent.elType === 'column') {
      // Flex container / column: more cards in the same parent
      for (let n = 1; count < needed; n++, count++) {
        const src = last.parent.elements[last.parent.elements.length - 1];
        last.parent.elements.push(cloneWithNewIds(src, `card-${n}`));
      }
      if (last.parent.elType === 'container') last.parent.settings = { ...(last.parent.settings || {}), flex_wrap: 'wrap' };
    } else {
      // Section with columns: whole rows are added after it
      const row = last.parent;
      let at = last.holder.indexOf(row);
      for (let n = 1; count < needed; n++) {
        const clone = cloneWithNewIds(row, `row-${n}`);
        last.holder.splice(++at, 0, clone);
        if (info.has(row)) info.set(clone, info.get(row));
        groups.push({ parent: clone, holder: last.holder });
        count += clone.elements.length;
      }
    }
  }
  // Surplus cards removed from the end (and rows left empty)
  while (count > needed) {
    const g = groups[groups.length - 1];
    g.parent.elements.pop();
    count--;
    if (!g.parent.elements.length) {
      g.holder.splice(g.holder.indexOf(g.parent), 1);
      groups.pop();
    }
  }
  return groups.flatMap((g) => g.parent.elements).slice(0, needed);
}

const TITLE_KEYS = { 'image-box': 'title_text', 'icon-box': 'title_text', 'call-to-action': 'title', 'flip-box': 'title_text_a', heading: 'title' };

/** Service name in the title of the card and service URL in its links. Returns the refs to mark as fixed. */
function fillCard(card, service) {
  const fixed = [];
  const ws = widgetsIn(card);
  const titled = ws.find((w) => TITLE_KEYS[w.widgetType] && typeof w.settings?.[TITLE_KEYS[w.widgetType]] === 'string');
  if (titled) {
    const key = TITLE_KEYS[titled.widgetType];
    titled.settings[key] = service.name;
    fixed.push(`${titled.id}:${key}`);
  }
  for (const w of ws) {
    for (const [key, value] of Object.entries(w.settings || {})) {
      if (!LINK_KEY.test(key) || !isLink(value)) continue;
      value.url = service.url;
      fixed.push(`${w.id}:${key}.url`);
    }
    if (w.widgetType === 'image' && w.settings?.link_to && w.settings.link_to !== 'none') {
      w.settings.link_to = 'custom';
      w.settings.link = { url: service.url, is_external: '', nofollow: '', custom_attributes: '' };
      fixed.push(`${w.id}:link.url`);
    }
  }
  return fixed;
}

// ---------------------------------------------------------------------------
// Demo content: forms, maps, videos, logos, CSS images
// ---------------------------------------------------------------------------

const mapIframe = (address) =>
  `<iframe src="https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed" width="100%" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
const MAP_HTML = /google\.[a-z.]+\/maps|maps\.google|openstreetmap/i;
const VIDEO_HTML = /<iframe[^>]+(youtube|youtu\.be|vimeo|wistia|dailymotion)/i;
// Contact forms of Elementor Pro and of the form plugins (not search / login forms, not contact info boxes)
const isFormWidget = (type) => /(^|[-_])forms?($|[-_])|contact-?form|wpforms|fluent-?form|gravity-?form|ninja-?form|cf7/.test(type) && !/search|login|register|password|comment|subscribe|mailchimp/.test(type);
const placeholderImage = () => ({ url: KIT_PLACEHOLDER, id: '', alt: '', source: 'library' });

/** Image widget keeping the layout settings (advanced tab, size, alignment) of the widget it replaces. */
function toImageWidget(el) {
  const keep = Object.fromEntries(Object.entries(el.settings || {}).filter(([k]) => k.startsWith('_') || /^(align|width|height|image_size|object_fit)/.test(k)));
  el.widgetType = 'image';
  el.settings = { ...keep, image: placeholderImage(), image_size: 'large' };
}

/** CSS without demo images (url(...) of remote files). */
const cleanCss = (css) => css.replace(/url\(\s*(['"]?)(https?:)?\/\/[^)]*\)/gi, 'none');

/**
 * Remove or replace the demo content that is not text: videos, CSS images, dynamic demo data.
 * Applied to every document of the kit.
 */
function cleanDemo(doc, site) {
  walkElements(getRoot(doc).elements, (el) => {
    const s = el.settings && typeof el.settings === 'object' && !Array.isArray(el.settings) ? el.settings : (el.settings = {});
    // Video backgrounds -> photo backgrounds
    if (s.background_video_link || s.background_background === 'video') {
      delete s.background_video_link;
      if (s.background_background === 'video') s.background_background = 'classic';
      if (!s.background_image?.url) s.background_image = placeholderImage();
    }
    if (typeof s.custom_css === 'string') s.custom_css = cleanCss(s.custom_css);
    if (el.elType !== 'widget') return;
    const type = el.widgetType || '';
    if (type === 'video' || (type === 'html' && VIDEO_HTML.test(s.html || ''))) toImageWidget(el);
    // Dynamic demo widgets of Elementor Pro / addons -> static widgets with the site data
    else if (/^(theme-site-title|site-title|hfe-site-title)$/.test(type)) {
      el.widgetType = 'heading';
      el.settings = { ...s, title: site.siteName };
    } else if (/^(theme-site-logo|site-logo|hfe-site-logo|retina)$/.test(type)) {
      toImageWidget(el);
      el.settings._kitLogo = 'yes';
    } else if (/^(theme-page-title|page-title|hfe-page-title|theme-archive-title)$/.test(type)) {
      el.widgetType = 'heading';
      el.settings = { ...s, title: '', _kitPageTitle: 'yes', header_size: s.header_size || 'h1' };
    } else if (type === 'post-comments') {
      el.widgetType = 'spacer';
      el.settings = { space: { unit: 'px', size: 0 } };
    }
    if (s.__dynamic__ && typeof s.__dynamic__ === 'object') {
      // A dynamic image (featured image, site logo) -> a project image
      for (const key of Object.keys(s.__dynamic__)) {
        if (/image/.test(key) && !(doc.type === 'single-post' || doc._role === 'single_post')) {
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
      if ((v && typeof v === 'object' && !Array.isArray(v) && typeof v.url === 'string' && v.url) || /background_video/.test(k)) delete ps[k];
      else if (k === 'custom_css' && typeof v === 'string') ps[k] = cleanCss(v);
    }
  }
}

/** Forms -> the Contact Form 7 form of the site; maps -> the address of the site (or removed). */
function prepareForms(doc, info, site, { ensure }) {
  const { elements } = getRoot(doc);
  let hasForm = false;
  let hasMap = false;
  const remove = [];
  for (const top of elements) {
    if (info.get(top)?.type === 'newsletter') continue; // a newsletter signup is not the contact form
    walkElements([top], (el, parent) => {
      if (el.elType !== 'widget') return;
      const type = el.widgetType || '';
      const s = el.settings || {};
      if (isFormWidget(type) || (type === 'shortcode' && /form/i.test(s.shortcode || '')) || (type === 'html' && /<form\b/i.test(s.html || ''))) {
        el.widgetType = 'shortcode';
        el.settings = { shortcode: site.contactShortcode, ...Object.fromEntries(Object.entries(s).filter(([k]) => k.startsWith('_'))) };
        hasForm = true;
      } else if (type === 'google_maps' || (type === 'html' && MAP_HTML.test(s.html || ''))) {
        if (!site.mapEmbed) remove.push({ el, parent });
        else if (type === 'google_maps') s.address = site.address;
        else s.html = mapIframe(site.address);
        hasMap = true;
      }
    });
  }
  for (const { el, parent } of remove) {
    const list = parent ? parent.elements : elements;
    list.splice(list.indexOf(el), 1);
  }
  if (!ensure) return;
  const contact = elements.findIndex((e) => info.get(e)?.type === 'contact');
  const at = contact >= 0 ? contact + 1 : elements.length;
  const added = [];
  if (!hasForm) added.push(widget('kit-cf7', 'shortcode', { shortcode: site.contactShortcode }));
  if (site.mapEmbed && site.address && !hasMap) added.push(widget('kit-map', 'html', { html: mapIframe(site.address) }));
  if (added.length) {
    const box = wrapper(elements, added, 'kit-contact');
    info.set(box, { type: 'contact', description: '' });
    elements.splice(at, 0, box);
  }
}

/** The Gallery page shows every photo: an Image Gallery widget is added when the page has none. */
function ensureGallery(doc, info) {
  const { elements } = getRoot(doc);
  let found = false;
  walkElements(elements, (el) => {
    if (Object.entries(el.settings || {}).some(([k, v]) => isGalleryArray(k, v))) found = true;
  });
  if (found) return;
  const gallery = widget('kit-gallery', 'image-gallery', { wp_gallery: [{ id: '', url: KIT_PLACEHOLDER }], thumbnail_size: 'medium_large', gallery_columns: '3', gallery_link: 'file', open_lightbox: 'yes', image_spacing: 'custom', image_spacing_custom: { unit: 'px', size: 12 } });
  const box = wrapper(elements, [gallery], 'kit-gallery');
  info.set(box, { type: 'gallery', description: '' });
  elements.splice(Math.min(1, elements.length), 0, box);
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

/** Header / footer: the logo of the site, or its name when the project has no logo. Returns refs of fixed fields. */
function prepareBrand(doc, role, site) {
  const fixed = [];
  const { elements } = getRoot(doc);
  let logo = null;
  walkElements(role === 'footer' ? elements.slice(0, 1) : elements, (el) => {
    if (!logo && el.elType === 'widget' && el.widgetType === 'image') logo = el;
  });
  walkElements(elements, (el) => {
    if (el.elType === 'widget' && el.settings?._kitLogo === 'yes' && !logo) logo = el;
  });
  if (logo && !site.hasLogo) {
    const align = logo.settings?.align;
    logo.widgetType = 'heading';
    logo.settings = { title: site.siteName, header_size: 'div', ...(align ? { align } : {}), typography_typography: 'custom', typography_font_size: { unit: 'px', size: 24 }, typography_font_weight: '700' };
    fixed.push(`${logo.id}:title`);
  }
  walkElements(elements, (el) => {
    if (el.elType === 'widget' && el.widgetType === 'heading' && el.settings?.title === site.siteName) fixed.push(`${el.id}:title`);
  });
  return { fixed, logoId: logo && site.hasLogo ? logo.id : null };
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

const hasWidget = (doc, type) => {
  let found = false;
  walkElements(getRoot(doc).elements, (el) => el.widgetType === type && (found = true));
  return found;
};

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * @param {object} kit   { id, name, dir (absolute), info, analysis, roles: { templateId: role } }
 * @param {object} site  siteInfo(ctx) (generation/plan.js)
 * @returns {{ docs: Record<role, { doc, marks: Map, sections, source, templateTitle }>, globalStyles, analyzeOptions }}
 */
export function buildKitSite(kit, site) {
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
  const sectionsOf = (id) => kit.analysis?.templates?.[id]?.sections || [];
  const templateFor = (role) => Object.keys(kit.roles).find((id) => kit.roles[id] === role) || null;
  let builder = null;
  const builderDoc = (role) => {
    builder ||= buildSite(fallbackSpec(kit.info.globalStyles), site);
    return builder.docs[role];
  };

  /** A page the kit does not have: banner of an inner page + the matching sections of the other templates. */
  const compose = (role) => {
    const usable = kit.info.templates.filter((t) => t.valid && !['header', 'footer', 'single_post'].includes(kit.roles[t.id]));
    const order = [...usable].sort((a, b) => Number(kit.roles[b.id] === 'home') - Number(kit.roles[a.id] === 'home'));
    const pickSection = (type, from = order) => {
      for (const t of from) {
        const i = sectionsOf(t.id).findIndex((s) => s.type === type);
        const doc = i >= 0 ? load(t.id) : null;
        if (doc && doc.content[i]) return { el: doc.content[i], info: sectionsOf(t.id)[i], seed: `${role}:${t.id}:${i}` };
      }
      return null;
    };
    // The banner comes from an inner page (any template that has a page title banner)
    const banner = pickSection('page_title', [...order].reverse());
    const body = COMPOSE[role].map((type) => pickSection(type)).filter(Boolean);
    if (!body.length && (role === 'about' || role === 'services')) return null;
    const parts = [banner, ...body].filter(Boolean);
    const doc = { version: '0.4', title: role, type: 'page', content: parts.map((p) => cloneWithNewIds(p.el, p.seed)), page_settings: { hide_title: 'yes' } };
    return { doc, sections: parts.map((p) => p.info) };
  };

  const docs = {};
  for (const role of [...PAGE_ROLES, 'single_post', 'header', 'footer']) {
    let id = templateFor(role);
    let doc = id ? load(id) : null;
    let sections = id ? sectionsOf(id) : [];
    let source = 'kit';
    // The single post template must show the article: without the post content widget the builder one is used
    if (doc && role === 'single_post' && !hasWidget(doc, 'theme-post-content')) doc = null;
    if (!doc && PAGE_ROLES.includes(role)) {
      const composed = compose(role);
      if (composed) ({ doc, sections } = composed);
      source = 'composed';
      id = null;
    }
    if (!doc) {
      const b = builderDoc(role);
      docs[role] = { doc: b.doc, marks: b.marks, sections: [], source: 'builder', templateTitle: null };
      continue;
    }
    doc._role = role;
    docs[role] = { ...prepareDocument(doc, role, sections, site), source, templateTitle: id ? kit.info.templates.find((t) => t.id === id)?.title || null : null };
    delete docs[role].doc._role;
  }
  return { docs, globalStyles: kit.info.globalStyles || null, analyzeOptions: KIT_ANALYZE_OPTIONS };
}

/**
 * Prepare one kit document for the site (the document is a fresh copy and is changed in place).
 * @returns {{ doc, marks: Map, sections: [{ type, description }] }}
 */
export function prepareDocument(doc, role, sectionInfo, site) {
  const { elements } = getRoot(doc);
  // Kit analysis of each top-level section, kept with the element while sections move
  const info = new Map(elements.map((el, i) => [el, sectionInfo[i] || { type: 'other', description: '' }]));
  const fixedRefs = new Set();
  const isPage = PAGE_ROLES.includes(role);

  // 1. Strips of demo client / partner logos: removed (they would show other companies)
  for (let i = elements.length - 1; i >= 0; i--) if (isPage && info.get(elements[i])?.type === 'clients' && elements.length > 1) elements.splice(i, 1);

  cleanDemo(doc, site);
  setMenus(doc, site.menuSlug);

  // 2. Service cards: services page = one card per service, home = up to the number of services
  const cardOf = new Map(); // element id -> service index
  if ((role === 'home' || role === 'services') && site.services.length) {
    const typed = elements.filter((e) => info.get(e)?.type === 'services');
    const roots = typed.length ? typed : elements;
    const total = findCardGroups(elements, roots, typed.length > 0).reduce((n, g) => n + g.parent.elements.length, 0);
    const needed = role === 'services' ? site.services.length : Math.min(total, site.services.length);
    adjustCards(elements, info, roots, needed, role === 'services', typed.length > 0).forEach((card, i) => {
      fillCard(card, site.services[i]).forEach((r) => fixedRefs.add(r));
      for (const id of idsIn(card)) cardOf.set(id, i);
    });
  }

  // 3. Forms and maps (pages only: a newsletter form in the footer stays), gallery widget
  if (isPage) prepareForms(doc, info, site, { ensure: role === 'contact' });
  if (role === 'gallery') ensureGallery(doc, info);

  // 4. Inner pages: the banner title is the page title
  const pageTitle = site.pages[role]?.title;
  if (isPage && role !== 'home' && pageTitle && elements.length) {
    walkElements(elements, (el) => {
      if (el.settings?._kitPageTitle === 'yes') {
        delete el.settings._kitPageTitle;
        el.settings.title = pageTitle;
        fixedRefs.add(`${el.id}:title`);
      }
    });
    const first = info.get(elements[0])?.type === 'page_title' && widgetsIn(elements[0]).find((w) => w.widgetType === 'heading' && typeof w.settings?.title === 'string');
    if (first) {
      first.settings.title = pageTitle;
      fixedRefs.add(`${first.id}:title`);
    }
  } else {
    walkElements(elements, (el) => el.settings?._kitPageTitle && delete el.settings._kitPageTitle);
  }

  // 5. Header / footer: logo or site name
  let logoId = null;
  if (role === 'header' || role === 'footer') {
    const brand = prepareBrand(doc, role, site);
    brand.fixed.forEach((r) => fixedRefs.add(r));
    logoId = brand.logoId;
  }
  walkElements(elements, (el) => el.settings?._kitLogo && delete el.settings._kitLogo);

  // 6. Fields: phone / email / copyright only -> the site ones (fixed); the rest is for the AI
  const marks = new Map();
  const sections = elements.map((el) => info.get(el) || { type: 'other', description: '' });
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

  // 7. Hints for the AI: the section each text belongs to
  const where = (index) => {
    if (role === 'header') return 'site header (shown on every page)';
    if (role === 'footer') return 'site footer (shown on every page)';
    const s = sections[index] || { type: 'other' };
    return `section ${index + 1} of the page, "${SECTION_TYPES[s.type] || 'Other'}"${s.description ? ` (${s.description})` : ''}`;
  };
  for (const f of analysis.fields) {
    const m = marks.get(f.ref) || {};
    if (m.fixed) continue;
    const card = cardOf.get(f.ref.split(':')[0]);
    const svc = card != null ? site.services[card] : null;
    m.hint = [where(f.section), svc && `card of the service "${svc.name}"`, f.hint].filter(Boolean).join('; ');
    marks.set(f.ref, m);
  }

  // 8. Image slots: hero / subheader / service / logo / photos; avatars of demo people are removed
  const firstBg = analysis.slots.find((s) => s.section === 0 && s.kind === 'background') || null;
  const heroSlot = role === 'home' ? firstBg || analysis.slots.find((s) => s.section === 0 && s.kind !== 'gallery') : null;
  for (const s of analysis.slots) {
    const elId = s.id.split(':')[0];
    const type = sections[s.section]?.type;
    let slot = 'photo';
    if (s.kind === 'gallery') slot = role === 'home' && s.section === 0 ? 'slideshow' : 'gallery';
    else if (heroSlot && s.id === heroSlot.id) slot = 'hero';
    else if (role !== 'home' && isPage && firstBg && s.id === firstBg.id) slot = 'subheader';
    else if (cardOf.has(elId)) slot = 'service_list';
    else if (logoId && elId === logoId) slot = 'logo';
    else if (/testimonial|review|team|author|avatar|person/i.test(`${s.widget} ${s.key}`) || (['testimonials', 'team'].includes(type) && s.kind === 'image')) slot = 'remove';
    marks.set(s.id, { ...(marks.get(s.id) || {}), slot, ...(slot === 'service_list' ? { service: cardOf.get(elId) } : {}) });
  }

  return { doc, marks, sections };
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
