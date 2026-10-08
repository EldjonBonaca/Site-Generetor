/**
 * Elementor document analysis.
 *
 * An Elementor template JSON looks like:
 *   { "content": [ element, ... ], "page_settings": {...}, "type": "page", ... }
 * where every element is:
 *   { "id": "a1b2c3", "elType": "section|column|container|widget", "widgetType"?: "heading",
 *     "settings": {...}, "elements": [ ...children ] }
 *
 * This module walks that tree and returns:
 *   - text fields  -> every user-visible string we may ask the AI to rewrite
 *   - image slots  -> every image / background image we may replace
 * Each item carries its exact JSON path so values can be written back without
 * touching anything else (styles, IDs, settings stay intact).
 */

// ---------------------------------------------------------------------------
// Knowledge base: known text settings of core / Pro widgets
// ---------------------------------------------------------------------------
const KNOWN_TEXT_KEYS = {
  heading: ['title'],
  'text-editor': ['editor'],
  button: ['text'],
  'icon-box': ['title_text', 'description_text'],
  'image-box': ['title_text', 'description_text'],
  image: ['caption'],
  testimonial: ['testimonial_content', 'testimonial_name', 'testimonial_job'],
  counter: ['title'],
  progress: ['title', 'inner_text'],
  alert: ['alert_title', 'alert_description'],
  divider: ['text'],
  'star-rating': ['title'],
  'call-to-action': ['title', 'description', 'button', 'ribbon_title'],
  'price-table': ['heading', 'sub_heading', 'period', 'button_text', 'footer_additional_info', 'ribbon_title'],
  'flip-box': ['title_text_a', 'description_text_a', 'title_text_b', 'description_text_b', 'button_text'],
  'animated-headline': ['before_text', 'highlighted_text', 'rotating_text', 'after_text'],
  blockquote: ['blockquote_content', 'author_name'],
  'author-box': ['author_name', 'author_bio'],
  'theme-post-excerpt': [],
};

/** Repeater controls: array key -> text keys inside each item. */
const KNOWN_REPEATER_KEYS = {
  icon_list: ['text'],
  tabs: ['tab_title', 'tab_content'],
  features_list: ['item_text'],
  slides: ['heading', 'description', 'button_text', 'content', 'name', 'title'],
  price_list: ['title', 'item_description'],
  form_fields: ['field_label', 'placeholder'],
};

/** Widgets whose strings are code/config, never copy. */
const SKIP_WIDGETS = new Set([
  'html', 'shortcode', 'nav-menu', 'ekit-nav-menu', 'theme-site-logo', 'site-logo', 'template', 'global',
  'sidebar', 'menu-anchor', 'google_maps', 'video', 'audio', 'spacer', 'code-highlight', 'lottie',
]);

// Heuristics for unknown (3rd-party) widgets
const TEXTISH_KEY =
  /(^|_)(title|text|heading|headline|description|desc|content|subtitle|sub_title|subheading|caption|label|name|job|designation|position|quote|excerpt|message|editor|button|btn)(_|\d|$)/;
const NON_TEXT_KEY =
  /(colou?r|typography|font|size|align|_tag$|^tag|width|height|margin|padding|border|radius|shadow|spacing|gap|icon|animation|css|class|link|url|_id$|^_|style|hover|background|duration|layout|view|skin|_position$|transition|opacity|z_index|display|show|hide|enable|switch|_type$|effect|delay|speed|direction|orientation|overlay|blend|filter|media|image|video|lottie|svg|unit|offset|rotate|scale|indent|weight|transform|decoration|letter|stroke|selector|motion|sticky|responsive|separator|source|order)/;

const RESPONSIVE_SUFFIX = /_(tablet|mobile|laptop|widescreen|tablet_extra|mobile_extra)$/;

const IMAGE_KEY = /image|img|bg|background|logo|photo|picture|thumbnail|avatar/i;
const HAS_LETTER = /\p{L}/u;
const HTML_TAG = /<\/?[a-z][^>]*>/i;

export const EMAIL_IN_TEXT = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Phone-like sequences: start with + or ( or digit, 7–15 digits, with at least one separator.
export const PHONE_IN_TEXT = /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{1,5}\)[\s.-]?)?\d{2,5}(?:[\s.-]\d{2,5}){1,4}/g;

export function looksLikePhone(s) {
  const digits = s.replace(/\D/g, '');
  if (/^\s*(19|20)\d{2}\s*[-.]\s*(19|20)\d{2}\s*$/.test(s)) return false; // year range, not a phone
  return digits.length >= 7 && digits.length <= 15 && /[\s.()+-]/.test(s.trim());
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return the root element list and its JSON path, whatever the export flavour. */
export function getRoot(doc) {
  if (Array.isArray(doc)) return { elements: doc, basePath: [] };
  if (doc && Array.isArray(doc.content)) return { elements: doc.content, basePath: ['content'] };
  return { elements: [], basePath: [] };
}

export function getAtPath(obj, path) {
  return path.reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function setAtPath(obj, path, value) {
  const parent = getAtPath(obj, path.slice(0, -1));
  if (parent == null) return false;
  parent[path[path.length - 1]] = value;
  return true;
}

const slugKey = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

function isGenericTextValue(v) {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  if (s.length < 2 || !HAS_LETTER.test(s)) return false;
  if (/^(https?:|mailto:|tel:|#|\/|www\.)/i.test(s)) return false;
  if (/^[a-z0-9_-]+$/.test(s)) return false; // slug-like config value: "yes", "left", "h2", "fa-check"
  if (/^(fa[srb]?|eicon|icon)[ -]/.test(s)) return false;
  if (/^(rgba?|hsla?)\(|^#[0-9a-f]{3,8}$/i.test(s)) return false;
  if (/^\d+(\.\d+)?(px|em|rem|%|vh|vw)$/.test(s)) return false;
  return true;
}

function isKnownTextValue(v) {
  // Letters, or a phone number (kept as a field so it is shown as auto-filled contact data)
  return typeof v === 'string' && v.trim().length > 0 && (HAS_LETTER.test(v) || looksLikePhone(v));
}

function isImageValue(key, v) {
  return (
    v &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    typeof v.url === 'string' &&
    v.url.trim() !== '' &&
    !('is_external' in v) &&
    !('nofollow' in v) &&
    ('id' in v || IMAGE_KEY.test(key))
  );
}

export function isGalleryArray(key, v) {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.every((it) => it && typeof it === 'object' && typeof it.url === 'string' && 'id' in it && !('_id' in it))
  );
}

/** Is a setting driven by dynamic tags (site title, ACF...)? Then it is not static copy. */
const isDynamic = (settings, key) => Boolean(settings?.__dynamic__?.[key]);

// ---------------------------------------------------------------------------
// Main analysis
// ---------------------------------------------------------------------------

const LINK_KEY = /(^|_)(link|url)$/;
const IMAGE_FILE = /\.(jpe?g|png|webp|gif|svg|avif)(\?|$)/i;
// Elementor link controls save { url, is_external, nofollow }, but kits often keep only { url }
const isLinkValue = (v) =>
  v && typeof v === 'object' && !Array.isArray(v) && typeof v.url === 'string' && ('is_external' in v || 'nofollow' in v || (!('id' in v) && !IMAGE_FILE.test(v.url)));

/**
 * Analyse a template document.
 * @param {object|Array} doc  parsed template JSON (possibly prepared by prepare.js)
 * @param {object} opts
 *   - prefix:   field id prefix (e.g. "home")
 *   - heroName: label for the 1st section ("hero")
 *   - meta:     WeakMap(element -> { origIndex, cloneN, card }) written by prepare.js, so that
 *               field ids stay stable when sections are removed and cards are known
 * @returns {{ fields: Field[], slots: Slot[], widgets: Record<string, number>, contacts: {emails:string[], phones:string[]} }}
 *
 * Field = { id, path, original, format: 'text'|'html'|'link', widget, key, section, card, label, maxLength }
 * Slot  = { id, path, key, kind: 'background'|'image'|'gallery', url, section, card, elType, widget, label }
 *   Slot ids are "<elementId>:<settings path>" so they survive section removal / reordering.
 *   A gallery slot is a whole array of images (gallery widgets).
 */
export function analyzeDocument(doc, { prefix = 'page', heroName = null, meta = null } = {}) {
  const fields = [];
  const slots = [];
  const widgets = {};
  const emails = new Set();
  const phones = new Set();
  const usedIds = new Set();
  const { elements, basePath } = getRoot(doc);

  const uniqueId = (base, set = usedIds) => {
    let id = base;
    let n = 2;
    while (set.has(id)) id = `${base}_${n++}`;
    set.add(id);
    return id;
  };
  const usedSlotIds = new Set();

  const collectContacts = (value) => {
    if (typeof value !== 'string') return;
    for (const m of value.match(EMAIL_IN_TEXT) || []) emails.add(m);
    const plain = value.replace(/<[^>]+>/g, ' ');
    for (const m of plain.match(PHONE_IN_TEXT) || []) if (looksLikePhone(m)) phones.add(m.trim());
  };

  elements.forEach((top, topIndex) => {
    const m = meta?.get(top) || {};
    const idx = m.origIndex ?? topIndex;
    let sectionName = idx === 0 && heroName ? heroName : `s${idx + 1}`;
    if (m.cloneN) sectionName += `_${m.cloneN}`;
    const counters = {};

    const walk = (el, elPath, card) => {
      if (!el || typeof el !== 'object') return;
      const elCard = meta?.get(el)?.card ?? card;
      const widget = el.elType === 'widget' ? el.widgetType || 'widget' : null;
      const settings = el.settings && typeof el.settings === 'object' && !Array.isArray(el.settings) ? el.settings : {};
      const sPath = [...elPath, 'settings'];
      const elKey = el.id || elPath.join('.');

      if (widget) {
        widgets[widget] = (widgets[widget] || 0) + 1;
        const wslug = slugKey(widget);
        counters[wslug] = (counters[wslug] || 0) + 1;
      }

      const addField = (path, original, key, labelSuffix, format) => {
        const wslug = slugKey(widget || 'el');
        const plainLen = original.replace(/<[^>]+>/g, '').trim().length;
        fields.push({
          id: uniqueId(`${prefix}.${sectionName}.${wslug}${counters[wslug]}.${labelSuffix}`),
          path,
          original,
          format: format || (HTML_TAG.test(original) || key === 'editor' ? 'html' : 'text'),
          widget,
          key,
          section: topIndex,
          card: elCard ?? null,
          label: `${widget} · ${key.replace(/_/g, ' ')}`,
          maxLength: format === 'link' ? 200 : Math.max(20, Math.round(plainLen * 1.4)),
        });
        if (format !== 'link') collectContacts(original);
      };

      const addSlot = (path, key, kind, url) => {
        const rel = path.slice(sPath.length).join('.');
        slots.push({
          id: uniqueId(`${elKey}:${rel}`, usedSlotIds),
          path,
          key,
          kind,
          url,
          section: topIndex,
          card: elCard ?? null,
          elType: el.elType,
          widget: el.widgetType || null,
          label: `${el.widgetType || el.elType} · ${key.replace(/_/g, ' ')}${kind === 'gallery' ? ` (${getAtPath(doc, path).length} images)` : ''}`,
        });
      };

      // A link value is a candidate link field (tel:/mailto: are handled as contacts instead)
      const maybeLink = (path, key, value, labelSuffix) => {
        if (!isLinkValue(value) || !LINK_KEY.test(key)) return;
        const url = value.url.trim();
        // An empty button link renders as "#": it gets a page of the site too
        if ((!url && !/button|btn/.test(widget || '')) || /^(tel:|mailto:)/i.test(url)) return;
        if (widget === 'image' && settings.link_to !== 'custom') return;
        addField([...path, 'url'], url, key, labelSuffix, 'link');
      };

      // --- text + link fields (widgets only) --------------------------------
      if (widget && !SKIP_WIDGETS.has(widget)) {
        const known = KNOWN_TEXT_KEYS[widget];
        for (const [key, value] of Object.entries(settings)) {
          if (RESPONSIVE_SUFFIX.test(key) || isDynamic(settings, key)) continue;

          // Repeaters: arrays of objects with an _id
          if (Array.isArray(value) && value.length && value.every((it) => it && typeof it === 'object' && '_id' in it)) {
            const knownItemKeys = KNOWN_REPEATER_KEYS[key];
            value.forEach((item, i) => {
              for (const [ik, iv] of Object.entries(item)) {
                const ok = knownItemKeys
                  ? knownItemKeys.includes(ik) && isKnownTextValue(iv)
                  : TEXTISH_KEY.test(ik) && !NON_TEXT_KEY.test(ik) && isGenericTextValue(iv);
                if (ok && !isDynamic(item, ik)) addField([...sPath, key, i, ik], iv, ik, `${slugKey(key)}${i + 1}_${slugKey(ik)}`);
                else if (!isDynamic(item, ik)) maybeLink([...sPath, key, i, ik], ik, iv, `${slugKey(key)}${i + 1}_${slugKey(ik)}`);
              }
            });
            continue;
          }

          const ok = known
            ? known.includes(key) && isKnownTextValue(value)
            : TEXTISH_KEY.test(key) && !NON_TEXT_KEY.test(key) && isGenericTextValue(value);
          if (ok) addField([...sPath, key], value, key, slugKey(key));
          else maybeLink([...sPath, key], key, value, slugKey(key));
        }
      }

      // --- image slots (any element: backgrounds on sections/containers too) --
      const scanImages = (obj, path) => {
        for (const [key, value] of Object.entries(obj)) {
          if (RESPONSIVE_SUFFIX.test(key) || key === '__globals__' || key === '__dynamic__') continue;
          if (isImageValue(key, value)) {
            addSlot([...path, key], key, /background|bg/i.test(key) ? 'background' : 'image', value.url);
          } else if (isGalleryArray(key, value)) {
            addSlot([...path, key], key, 'gallery', value[0].url);
          } else if (Array.isArray(value)) {
            value.forEach((item, i) => {
              if (item && typeof item === 'object' && '_id' in item) scanImages(item, [...path, key, i]);
            });
          }
        }
      };
      scanImages(settings, sPath);

      // Link values can hold demo phone/email (tel:/mailto:)
      const scanContactLinks = (obj) => {
        for (const value of Object.values(obj)) {
          if (value && typeof value === 'object' && typeof value.url === 'string') {
            if (value.url.startsWith('mailto:')) emails.add(value.url.slice(7).split('?')[0]);
            if (value.url.startsWith('tel:')) phones.add(value.url.slice(4));
          } else if (Array.isArray(value)) value.forEach((it) => it && typeof it === 'object' && scanContactLinks(it));
        }
      };
      scanContactLinks(settings);

      (el.elements || []).forEach((child, i) => walk(child, [...elPath, 'elements', i], elCard));
    };

    walk(top, [...basePath, topIndex], null);
  });

  return {
    fields,
    slots,
    widgets,
    contacts: { emails: [...emails], phones: [...phones] },
  };
}

/**
 * Summary of the top-level sections (for the "remove sections" UI):
 * [{ id, index, label, widgets }]
 */
export function listSections(doc) {
  return getRoot(doc).elements.map((el, index) => {
    const texts = [];
    const types = new Set();
    const walk = (e) => {
      if (!e || typeof e !== 'object') return;
      if (e.elType === 'widget') {
        types.add(e.widgetType);
        const s = e.settings || {};
        const t = s.title || s.title_text || s.heading || (typeof s.editor === 'string' ? s.editor : '');
        if (typeof t === 'string' && t.trim()) texts.push(t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
      }
      (e.elements || []).forEach(walk);
    };
    walk(el);
    return { id: el.id || String(index), index, label: texts[0]?.slice(0, 80) || `${el.elType} #${index + 1}`, widgets: [...types].slice(0, 6) };
  });
}

// ---------------------------------------------------------------------------
// Default image-slot roles
// ---------------------------------------------------------------------------

const CARD_WIDGETS = new Set(['image-box', 'call-to-action', 'flip-box']);
const PERSON_WIDGETS = /testimonial|team|author|reviews/;
export { CARD_WIDGETS };

export const isPersonSlot = (s) => PERSON_WIDGETS.test(s.widget || '') || /avatar|author|testimonial/i.test(s.key);

/**
 * Suggest which slot receives which project image, depending on the page role.
 * Roles: hero | subheader | service_list | logo | gallery | keep | remove
 *  - home:     first background (or image) of the first section -> hero
 *  - inner pages: first background of the first section -> subheader
 *  - service cards (home / services) -> service_list (image of the card's service)
 *  - header/footer: first image widget -> logo
 *  - testimonial / team photos -> keep (replaced/removed when "replace all images" is on)
 *  - gallery widgets -> gallery (all photos)
 *  - every other slot -> gallery (filled round-robin with the photos)
 */
export function defaultSlotRoles(slots, pageRole) {
  const roles = {};
  for (const s of slots) roles[s.id] = 'gallery';
  if (!slots.length) return roles;

  const firstSection = slots.filter((s) => s.section === 0 && s.kind !== 'gallery');
  const firstBg = firstSection.find((s) => s.kind === 'background');

  if (pageRole === 'header' || pageRole === 'footer') {
    const logo = slots.find((s) => s.kind === 'image');
    if (logo) roles[logo.id] = 'logo';
    return roles;
  }

  for (const s of slots) if (isPersonSlot(s)) roles[s.id] = 'keep';
  // Cards: either detected by prepare.js (card index) or card widgets
  const cardSlots = (except) => slots.filter((s) => s.id !== except && s.kind !== 'gallery' && (s.card != null || CARD_WIDGETS.has(s.widget)));

  if (pageRole === 'home') {
    const hero = firstBg || firstSection[0] || slots.find((s) => s.kind === 'background') || slots[0];
    roles[hero.id] = 'hero';
    for (const s of cardSlots(hero.id)) roles[s.id] = 'service_list';
    return roles;
  }

  if (firstBg) roles[firstBg.id] = 'subheader';
  if (pageRole === 'services') for (const s of cardSlots(firstBg?.id)) roles[s.id] = 'service_list';
  return roles;
}

export const SLOT_ROLES = ['hero', 'subheader', 'service_list', 'logo', 'gallery', 'keep', 'remove'];
