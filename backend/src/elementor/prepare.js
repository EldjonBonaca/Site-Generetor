/**
 * Structural preparation of a template before analysis/export (always on a fresh copy):
 *  - remove the top-level sections the user excluded
 *  - service cards: one card per service (clone/trim) and remember the card index
 *  - contact page: form widget -> Shortcode widget (Contact Form 7 placeholder), map with the real address
 *  - gallery page: a gallery widget is added when the template has none
 *  - header/footer: nav-menu widgets point to the generated menu
 *
 * The same function runs for the AI analysis and for the export, so field ids and
 * slot ids match. Element ids of clones are derived deterministically.
 */
import crypto from 'node:crypto';
import { getRoot, isGalleryArray, CARD_WIDGETS } from './analyze.js';

const newId = (seed) => crypto.createHash('md5').update(seed).digest('hex').slice(0, 7);

function cloneWithNewIds(el, seed) {
  const copy = structuredClone(el);
  const walk = (e) => {
    if (!e || typeof e !== 'object') return;
    if (e.id) e.id = newId(`${seed}:${e.id}`);
    for (const v of Object.values(e.settings || {})) {
      if (Array.isArray(v)) v.forEach((it) => it && typeof it === 'object' && '_id' in it && (it._id = newId(`${seed}:${it._id}`)));
    }
    (e.elements || []).forEach(walk);
  };
  walk(copy);
  return copy;
}

function widgetsIn(el) {
  const out = [];
  const walk = (e) => {
    if (!e || typeof e !== 'object') return;
    if (e.elType === 'widget') out.push(e);
    (e.elements || []).forEach(walk);
  };
  walk(el);
  return out;
}

/** A "card": exactly one card widget (image-box, CTA, flip-box) or image + heading + link. */
function isCard(el) {
  const ws = widgetsIn(el);
  const cardWidgets = ws.filter((w) => CARD_WIDGETS.has(w.widgetType));
  if (cardWidgets.length) return cardWidgets.length === 1;
  const has = (t) => ws.some((w) => w.widgetType === t);
  const hasLink = has('button') || ws.some((w) => w.settings?.link?.url);
  return has('image') && has('heading') && hasLink && ws.length <= 6;
}

/** Groups of sibling cards in document order: [{ parent, holder }] (holder = array containing parent). */
export function findCardGroups(elements) {
  const groups = [];
  const walk = (el, holder) => {
    if (!el || typeof el !== 'object') return;
    const kids = el.elements || [];
    if (kids.length >= 2 && kids.every((k) => k.elType === kids[0].elType && isCard(k))) {
      groups.push({ parent: el, holder });
      return;
    }
    kids.forEach((k) => walk(k, kids));
  };
  elements.forEach((el) => walk(el, elements));
  return groups;
}

/** Make the number of cards equal to `needed` (clone only when allowed). Returns the cards. */
function adjustCards(elements, meta, needed, allowClone) {
  const groups = findCardGroups(elements);
  if (!groups.length || needed <= 0) return [];
  let count = groups.reduce((n, g) => n + g.parent.elements.length, 0);

  if (allowClone && count < needed) {
    const last = groups[groups.length - 1];
    if (last.parent.elType === 'container' || last.parent.elType === 'column') {
      // Flex container / column: add cards inside the same parent
      for (let n = 1; count < needed; n++, count++) {
        const src = last.parent.elements[last.parent.elements.length - 1];
        last.parent.elements.push(cloneWithNewIds(src, `card-${n}`));
      }
      if (last.parent.elType === 'container') last.parent.settings = { ...(last.parent.settings || {}), flex_wrap: 'wrap' };
    } else {
      // Legacy section row with columns: add whole rows after it
      const row = last.parent;
      const rowMeta = meta.get(row) || {};
      let at = last.holder.indexOf(row);
      for (let n = 1; count < needed; n++) {
        const clone = cloneWithNewIds(row, `row-${n}`);
        last.holder.splice(++at, 0, clone);
        if (rowMeta.origIndex != null) meta.set(clone, { origIndex: rowMeta.origIndex, cloneN: n });
        groups.push({ parent: clone, holder: last.holder });
        count += clone.elements.length;
      }
    }
  }

  // Remove surplus cards from the end (and rows left empty)
  while (count > needed) {
    const g = groups[groups.length - 1];
    g.parent.elements.pop();
    count--;
    if (!g.parent.elements.length) {
      g.holder.splice(g.holder.indexOf(g.parent), 1);
      groups.pop();
    }
  }

  const cards = groups.flatMap((g) => g.parent.elements);
  cards.forEach((c, i) => meta.set(c, { ...(meta.get(c) || {}), card: i }));
  return cards;
}

const mapIframe = (address) =>
  `<iframe src="https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed" width="100%" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;

/** New top-level wrapper in the same layout system as the template (containers or sections). */
function wrapper(elements, widget, seed) {
  const usesContainers = elements.some((e) => e.elType === 'container');
  if (usesContainers) return { id: newId(`${seed}:c`), elType: 'container', settings: { flex_direction: 'column' }, elements: [widget], isInner: false };
  return {
    id: newId(`${seed}:s`),
    elType: 'section',
    settings: {},
    isInner: false,
    elements: [{ id: newId(`${seed}:col`), elType: 'column', settings: { _column_size: 100 }, elements: [widget], isInner: false }],
  };
}

function prepareContact(elements, { shortcode, mapEmbed, address }) {
  let hasForm = false;
  let hasMap = false;
  const walk = (e) => {
    if (!e || typeof e !== 'object') return;
    if (e.elType === 'widget') {
      const type = e.widgetType || '';
      const s = e.settings || {};
      if (shortcode && /form/.test(type) && !/search|login/.test(type)) {
        e.widgetType = 'shortcode';
        e.settings = { shortcode };
        hasForm = true;
      } else if (shortcode && type === 'shortcode' && /form/i.test(s.shortcode || '')) {
        s.shortcode = shortcode;
        hasForm = true;
      } else if (type === 'google_maps') {
        s.address = address;
        hasMap = true;
      } else if (type === 'html' && /google\.[a-z.]+\/maps|maps\.google/i.test(s.html || '')) {
        s.html = mapIframe(address);
        hasMap = true;
      }
    }
    (e.elements || []).forEach(walk);
  };
  elements.forEach(walk);

  if (shortcode && !hasForm) elements.push(wrapper(elements, { id: newId('cf7'), elType: 'widget', widgetType: 'shortcode', settings: { shortcode }, elements: [] }, 'cf7'));
  if (mapEmbed && address && !hasMap) elements.push(wrapper(elements, { id: newId('map'), elType: 'widget', widgetType: 'html', settings: { html: mapIframe(address) }, elements: [] }, 'map'));
}

const GALLERY_PLACEHOLDER = 'https://gallery.placeholder/photo.jpg';

/**
 * Gallery page: it must show every photo, so when the template has no gallery widget
 * (e.g. a grid of single images) an Elementor "Image Gallery" is added after the subheader.
 * Its placeholder item is replaced by all the photos like any other gallery slot.
 */
function ensureGalleryWidget(elements) {
  const hasGallery = (e) => e && typeof e === 'object' && (Object.entries(e.settings || {}).some(([k, v]) => isGalleryArray(k, v)) || (e.elements || []).some(hasGallery));
  if (elements.some(hasGallery)) return;
  const widget = {
    id: newId('gallery'),
    elType: 'widget',
    widgetType: 'image-gallery',
    settings: { wp_gallery: [{ id: '', url: GALLERY_PLACEHOLDER }], thumbnail_size: 'medium_large', gallery_columns: '3', gallery_link: 'file', open_lightbox: 'yes' },
    elements: [],
  };
  elements.splice(Math.min(1, elements.length), 0, wrapper(elements, widget, 'gallery'));
}

/**
 * @param {object} doc  template document (mutated: pass a fresh copy)
 * @param {object} opts { role, removedSections: string[], serviceCount, ensureGallery, contact: { shortcode, mapEmbed, address }, menuSlug }
 * @returns {{ doc, meta: WeakMap, cardCount: number }}
 */
export function prepareDocument(doc, opts = {}) {
  const meta = new WeakMap();
  const { elements } = getRoot(doc);
  elements.forEach((el, i) => meta.set(el, { origIndex: i }));

  // 1. Excluded sections
  const removed = new Set(opts.removedSections || []);
  if (removed.size) {
    for (let i = elements.length - 1; i >= 0; i--) if (removed.has(elements[i].id || String(i))) elements.splice(i, 1);
  }

  // 2. Service cards (home: up to N featured, services page: exactly N)
  let cardCount = 0;
  if ((opts.role === 'home' || opts.role === 'services') && opts.serviceCount > 0) {
    const allowClone = opts.role === 'services';
    const total = findCardGroups(elements).reduce((n, g) => n + g.parent.elements.length, 0);
    const needed = allowClone ? opts.serviceCount : Math.min(total, opts.serviceCount);
    cardCount = adjustCards(elements, meta, needed, allowClone).length;
  }

  // 3. Contact page
  if (opts.role === 'contact' && opts.contact) prepareContact(elements, opts.contact);

  // 4. Gallery page: a gallery widget for all the photos
  if (opts.role === 'gallery' && opts.ensureGallery) ensureGalleryWidget(elements);

  // 5. Navigation menus -> generated menu
  if (opts.menuSlug) {
    const walk = (e) => {
      if (!e || typeof e !== 'object') return;
      if (e.elType === 'widget' && /nav-menu|mega-menu/.test(e.widgetType || '')) e.settings = { ...(e.settings || {}), menu: opts.menuSlug };
      (e.elements || []).forEach(walk);
    };
    elements.forEach(walk);
  }

  return { doc, meta, cardCount };
}
