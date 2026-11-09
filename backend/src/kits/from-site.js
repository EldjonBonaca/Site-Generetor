/**
 * A website built with Elementor turned into a Template Kit with the same structure.
 *
 * The published pages of an Elementor site still carry its structure: every section, container,
 * column and widget is an element with its Elementor id (data-id), its type (data-element_type,
 * data-widget_type) and part of its settings (data-settings); its design is in the Elementor CSS of
 * the site (post-<id>.css / inline), written against those ids. So:
 *   - each page (home + the pages of the menu) becomes an Elementor document with the same
 *     elements, the same ids and the content of each widget in its settings;
 *   - the Elementor CSS of the site is kept (scoped to the ids, so it styles the same elements),
 *     the global colors and fonts of the site become the global styles of the kit;
 *   - the photos (image widgets, background photos of the sections) are image settings: the kit
 *     pipeline replaces them with the photos of the project, and the AI rewrites every text.
 * The result is written as a Template Kit folder (manifest.json + templates/*.json + site-settings.json
 * + site.css) and registered like an uploaded kit: projects use it in their Template step and the
 * WordPress plugin builds the site as with any kit.
 * Only the structure and the design are taken: the texts and the photos are the ones of the project.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'node-html-parser';
import { referenceUrl, safeGet } from '../templates/reference.js';
import { badRequest } from '../lib/util.js';

const MAX_PAGES = 8;
const MAX_HTML = 3_000_000;
const MAX_CSS = 2_000_000;
const MAX_TOTAL_CSS = 4_000_000;

// ---------------------------------------------------------------------------------- crawling --

const sameSite = (a, b) => a.hostname.replace(/^www\./, '') === b.hostname.replace(/^www\./, '');

/** Internal pages linked by the menu of the home page (no anchors, files, admin, feeds), in menu order. */
export function menuPages(root, home) {
  const nav = root.querySelector('nav') || root.querySelector('header') || root;
  const out = [];
  for (const a of nav.querySelectorAll('a')) {
    const href = a.getAttribute('href');
    if (!href || /^(#|tel:|mailto:|javascript:)/i.test(href)) continue;
    let url;
    try {
      url = new URL(href, home);
    } catch {
      continue;
    }
    if (!['http:', 'https:'].includes(url.protocol) || !sameSite(url, home)) continue;
    if (/\.(pdf|jpe?g|png|gif|webp|zip|docx?|xml)$/i.test(url.pathname) || /\/(wp-admin|wp-login|feed|cart|checkout|my-account)\b/i.test(url.pathname)) continue;
    url.hash = '';
    url.search = '';
    if (url.pathname.replace(/\/+$/, '') === home.pathname.replace(/\/+$/, '')) continue;
    if (!out.some((p) => p.url.href === url.href)) out.push({ url, label: a.text.replace(/\s+/g, ' ').trim().slice(0, 60) });
  }
  return out;
}

/** Elementor CSS of a page: its stylesheets (post-<id>.css, global.css, local Google Fonts) and its inline Elementor styles. */
function cssSources(root, pageUrl) {
  const links = root
    .querySelectorAll('link')
    .filter((l) => /stylesheet/i.test(l.getAttribute('rel') || ''))
    .map((l) => l.getAttribute('href'))
    // Not the custom-*.css of Elementor Pro (its frontend for the breakpoints of that site: the new site has its own)
    .filter((h) => h && /\/elementor\/css\/(post-\d+|global)[^/]*\.css/i.test(h))
    .map((h) => new URL(h, pageUrl).href);
  const inline = root
    .querySelectorAll('style')
    .filter((s) => /elementor-(post|global|frontend-inline|kit)|^elementor/i.test(s.getAttribute('id') || '') || /\.elementor-element-[0-9a-f]{6,8}|--e-global-/.test(s.innerHTML))
    .map((s) => s.innerHTML);
  return { links, inline };
}

/**
 * Home + menu pages of the site (at most MAX_PAGES) and their Elementor CSS, with the safety limits
 * of the reference reader (public addresses only). opts: { fetchImpl, lookup } (tests).
 */
export async function crawlSite(address, opts = {}) {
  const start = referenceUrl(address);
  const first = await safeGet(start, { ...opts, maxBytes: MAX_HTML, accept: 'text/html' });
  const homeRoot = parse(first.text);
  const pages = [{ url: first.url, label: 'Home', html: first.text, root: homeRoot }];
  for (const p of menuPages(homeRoot, first.url).slice(0, MAX_PAGES - 1)) {
    try {
      const res = await safeGet(p.url, { ...opts, maxBytes: MAX_HTML, accept: 'text/html' });
      if (pages.some((x) => x.url.href === res.url.href)) continue;
      pages.push({ url: res.url, label: p.label, html: res.text, root: parse(res.text) });
    } catch {
      /* a page that cannot be read is left out */
    }
  }
  const seen = new Set();
  const css = [];
  let size = 0;
  const fontLinks = new Set();
  const vars = new Map();
  for (const page of pages) {
    const { links, inline } = cssSources(page.root, page.url);
    for (const block of inline) css.push({ base: page.url.href, text: block });
    for (const href of links) {
      if (seen.has(href) || size > MAX_TOTAL_CSS) continue;
      seen.add(href);
      try {
        const res = await safeGet(new URL(href), { ...opts, maxBytes: MAX_CSS, accept: 'text/css' });
        size += res.text.length;
        css.push({ base: href, text: res.text });
      } catch {
        /* skipped */
      }
    }
    // CSS variables of the theme and of WordPress (Astra, Kadence, global styles...) defined inline on
    // :root / body: the Elementor CSS of the site may use them (the new site has another theme)
    for (const s of page.root.querySelectorAll('style')) {
      for (const block of s.innerHTML.matchAll(/(?:^|[}\s,])(?::root|html|body)\s*\{([^{}]*)\}/g)) {
        for (const m of block[1].matchAll(/(--[a-zA-Z0-9_-]+)\s*:\s*([^;{}]+)/g)) if (!vars.has(m[1])) vars.set(m[1], m[2].trim());
      }
    }
    for (const l of page.root.querySelectorAll('link')) {
      const href = l.getAttribute('href') || '';
      if (/fonts\.googleapis\.com\/css/i.test(href)) fontLinks.add(href);
    }
  }
  return { url: first.url.href, pages, css, fontLinks: [...fontLinks], vars };
}

// -------------------------------------------------------------------------------- conversion --

const isElement = (n) => n?.nodeType === 1 && n.getAttribute?.('data-element_type');

/** The Elementor elements directly inside a node (the wrappers of Elementor between them are skipped). */
function childElements(node) {
  const out = [];
  for (const c of node.childNodes) {
    if (c.nodeType !== 1) continue;
    if (isElement(c)) out.push(c);
    else out.push(...childElements(c));
  }
  return out;
}

function jsonAttr(node, name) {
  const raw = node.getAttribute(name);
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** Real URL of an <img> (lazy loading puts it in data-src / data-lazy-src / srcset). */
function imgSrc(img, base) {
  if (!img) return '';
  const cands = [img.getAttribute('data-src'), img.getAttribute('data-lazy-src'), img.getAttribute('data-orig-src'), img.getAttribute('src')];
  let src = cands.find((s) => s && !/^data:/i.test(s)) || '';
  if (!src) src = (img.getAttribute('data-srcset') || img.getAttribute('srcset') || '').split(',')[0].trim().split(/\s+/)[0] || '';
  try {
    return src ? new URL(src, base).href : '';
  } catch {
    return '';
  }
}

const linkOf = (a, base) => {
  const href = a?.getAttribute('href');
  if (!href) return null;
  let url = href;
  try {
    url = /^(tel:|mailto:|#)/i.test(href) ? href : new URL(href, base).href;
  } catch {
    /* kept as it is */
  }
  return { url, is_external: a.getAttribute('target') === '_blank' ? 'on' : '', nofollow: /nofollow/i.test(a.getAttribute('rel') || '') ? 'on' : '' };
};

/** Font Awesome icon of a node: <i class="fas fa-phone"> or Elementor's inline SVG (e-fas-phone). */
function iconOf(node) {
  if (!node) return null;
  const i = node.querySelector('i[class*="fa-"]');
  if (i) {
    const cls = i.getAttribute('class');
    const name = /\bfa-(?!solid|regular|brands|fw|lg|\dx)([a-z0-9-]+)/.exec(cls)?.[1];
    const lib = /\b(fab|fa-brands)\b/.test(cls) ? 'fa-brands' : /\b(far|fa-regular)\b/.test(cls) ? 'fa-regular' : 'fa-solid';
    if (name) return { value: `${{ 'fa-brands': 'fab', 'fa-regular': 'far', 'fa-solid': 'fas' }[lib]} fa-${name}`, library: lib };
  }
  const svg = node.querySelector('svg[class*="e-fa"]');
  const m = svg && /\be-(fas|far|fab)-([a-z0-9-]+)/.exec(svg.getAttribute('class'));
  if (m) return { value: `${m[1]} fa-${m[2]}`, library: { fas: 'fa-solid', far: 'fa-regular', fab: 'fa-brands' }[m[1]] };
  return null;
}

const inner = (node, sel) => node.querySelector(sel)?.innerHTML.trim() ?? '';
const text = (node, sel) => (node.querySelector(sel)?.text ?? '').replace(/\s+/g, ' ').trim();
const image = (url) => ({ url, id: '' });

/** Content of a widget (what the settings of the widget hold) read from its rendered HTML. */
const WIDGET_CONTENT = {
  heading: (n, base) => {
    const t = n.querySelector('.elementor-heading-title');
    const a = t?.querySelector('a') || (t?.rawTagName === 'a' ? t : null);
    return { title: (a || t)?.innerHTML.trim() ?? '', header_size: t?.rawTagName?.toLowerCase() || 'h2', ...(a ? { link: linkOf(a, base) } : {}) };
  },
  'text-editor': (n) => ({ editor: inner(n, '.elementor-text-editor') || inner(n, '.elementor-widget-container') || n.innerHTML.trim() }),
  image: (n, base) => {
    const a = n.querySelector('a');
    const out = { image: image(imgSrc(n.querySelector('img'), base)), image_size: 'full' };
    const caption = text(n, 'figcaption');
    if (caption) out.caption = caption;
    if (a) Object.assign(out, { link_to: 'custom', link: linkOf(a, base) });
    return out;
  },
  button: (n, base) => ({ text: text(n, '.elementor-button-text') || text(n, '.elementor-button'), link: linkOf(n.querySelector('a'), base) || { url: '#' }, ...(iconOf(n.querySelector('.elementor-button-icon')) ? { selected_icon: iconOf(n.querySelector('.elementor-button-icon')) } : {}) }),
  icon: (n, base) => ({ selected_icon: iconOf(n) || { value: 'fas fa-star', library: 'fa-solid' }, ...(n.querySelector('a') ? { link: linkOf(n.querySelector('a'), base) } : {}) }),
  'icon-box': (n, base) => ({
    selected_icon: iconOf(n.querySelector('.elementor-icon')) || { value: 'fas fa-star', library: 'fa-solid' },
    title_text: text(n, '.elementor-icon-box-title'),
    description_text: inner(n, '.elementor-icon-box-description'),
    title_size: n.querySelector('.elementor-icon-box-title')?.rawTagName?.toLowerCase() || 'h3',
    ...(n.querySelector('.elementor-icon-box-title a') ? { link: linkOf(n.querySelector('.elementor-icon-box-title a'), base) } : {}),
  }),
  'image-box': (n, base) => ({
    image: image(imgSrc(n.querySelector('img'), base)),
    title_text: text(n, '.elementor-image-box-title'),
    description_text: inner(n, '.elementor-image-box-description'),
    title_size: n.querySelector('.elementor-image-box-title')?.rawTagName?.toLowerCase() || 'h3',
  }),
  'icon-list': (n, base) => ({
    icon_list: n.querySelectorAll('.elementor-icon-list-item').map((li, i) => ({
      _id: `il${i}`,
      text: text(li, '.elementor-icon-list-text'),
      selected_icon: iconOf(li.querySelector('.elementor-icon-list-icon')) || { value: '', library: '' },
      ...(li.querySelector('a') ? { link: linkOf(li.querySelector('a'), base) } : {}),
    })),
  }),
  counter: (n) => {
    const num = n.querySelector('.elementor-counter-number');
    return {
      starting_number: Number(num?.getAttribute('data-from-value')) || 0,
      ending_number: Number(num?.getAttribute('data-to-value')) || Number(num?.text.replace(/\D/g, '')) || 100,
      prefix: text(n, '.elementor-counter-number-prefix'),
      suffix: text(n, '.elementor-counter-number-suffix'),
      title: text(n, '.elementor-counter-title'),
      thousand_separator: num?.getAttribute('data-delimiter') ? 'yes' : '',
    };
  },
  testimonial: (n, base) => ({
    testimonial_content: inner(n, '.elementor-testimonial-content'),
    testimonial_name: text(n, '.elementor-testimonial-name'),
    testimonial_job: text(n, '.elementor-testimonial-job'),
    testimonial_image: image(imgSrc(n.querySelector('.elementor-testimonial-image img'), base)),
  }),
  'image-gallery': (n, base) => ({ wp_gallery: n.querySelectorAll('img').map((img) => image(imgSrc(img, base))).filter((x) => x.url) }),
  'image-carousel': (n, base) => ({ carousel: n.querySelectorAll('.swiper-slide:not(.swiper-slide-duplicate) img').map((img) => image(imgSrc(img, base))).filter((x) => x.url) }),
  google_maps: (n) => {
    const src = n.querySelector('iframe')?.getAttribute('src') || '';
    let q = '';
    try {
      q = new URL(src, 'https://maps.google.com').searchParams.get('q') || '';
    } catch {
      /* none */
    }
    return { address: q };
  },
  video: (n) => ({ youtube_url: n.querySelector('iframe')?.getAttribute('src') || '' }),
  accordion: (n) => tabs(n, '.elementor-tab-title', '.elementor-tab-content'),
  toggle: (n) => tabs(n, '.elementor-tab-title', '.elementor-tab-content'),
  tabs: (n) => tabs(n, '.elementor-tab-desktop-title', '.elementor-tab-content'),
  'star-rating': (n) => ({ rating: Number(n.querySelector('[itemprop="ratingValue"]')?.getAttribute('content')) || 5, title: text(n, '.elementor-star-rating__title') }),
  'social-icons': (n, base) => ({
    social_icon_list: n.querySelectorAll('a').map((a, i) => ({ _id: `si${i}`, social_icon: iconOf(a) || { value: 'fab fa-facebook', library: 'fa-brands' }, link: linkOf(a, base) })),
  }),
  divider: (n) => ({ text: text(n, '.elementor-divider__text') }),
  spacer: () => ({}),
  progress: (n) => ({ title: text(n, '.elementor-title'), percent: { unit: '%', size: Number(n.querySelector('.elementor-progress-bar')?.getAttribute('data-max')) || 80 } }),
  alert: (n) => ({ alert_title: text(n, '.elementor-alert-title'), alert_description: text(n, '.elementor-alert-description') }),
  html: (n) => ({ html: inner(n, '.elementor-widget-container') }),
  shortcode: (n) => ({ shortcode: '', _rendered: inner(n, '.elementor-widget-container') }),
};

function tabs(n, titleSel, contentSel) {
  const titles = n.querySelectorAll(titleSel);
  const contents = n.querySelectorAll(contentSel);
  return { tabs: titles.map((t, i) => ({ _id: `tb${i}`, tab_title: t.text.replace(/\s+/g, ' ').trim(), tab_content: contents[i]?.innerHTML.trim() || '' })) };
}

/**
 * One rendered Elementor element -> its Elementor JSON (same id, type and content).
 * notes: collects what could not be converted exactly.
 */
function convertElement(node, base, notes) {
  const elType = node.getAttribute('data-element_type');
  const id = node.getAttribute('data-id') || Math.random().toString(16).slice(2, 9);
  const cls = node.getAttribute('class') || '';
  const settings = jsonAttr(node, 'data-settings');
  if (elType === 'widget') {
    const widgetType = (node.getAttribute('data-widget_type') || 'html.default').split('.')[0];
    const read = WIDGET_CONTENT[widgetType];
    if (read) {
      const content = read(node, base);
      if (widgetType === 'shortcode') {
        // A shortcode of the other site (form, slider...) cannot work here: its output is kept as HTML
        notes.add('shortcode');
        return { id, elType: 'widget', widgetType: 'html', settings: { html: content._rendered }, elements: [] };
      }
      return { id, elType: 'widget', widgetType, settings: { ...settings, ...content }, elements: [] };
    }
    // Pro / addon widget (settings not readable from the page): its rendered HTML is kept, the same look
    notes.add(widgetType);
    const html = node.querySelector('.elementor-widget-container')?.innerHTML ?? node.innerHTML;
    return { id, elType: 'widget', widgetType: 'html', settings: { html }, elements: [] };
  }
  const children = childElements(node).map((c) => convertElement(c, base, notes));
  if (elType === 'container') {
    Object.assign(settings, {
      content_width: /\be-con-full\b/.test(cls) ? 'full' : 'boxed',
      ...(/\be-grid\b/.test(cls) ? { container_type: 'grid' } : {}),
    });
    if (node.querySelector(':scope > .elementor-background-overlay')) settings.background_overlay_background ||= 'classic';
    return { id, elType: 'container', isInner: /\be-child\b/.test(cls), settings, elements: children };
  }
  if (elType === 'section') {
    // The space between the columns is a class of the inner .elementor-container
    const gap = /\belementor-column-gap-([a-z]+)/.exec(`${cls} ${node.querySelector('.elementor-container')?.getAttribute('class') || ''}`)?.[1];
    Object.assign(settings, {
      layout: /\belementor-section-full_width\b/.test(cls) ? 'full_width' : 'boxed',
      ...(gap ? { gap } : {}),
      ...(/\belementor-section-height-full\b/.test(cls) ? { height: 'full' } : /\belementor-section-height-min-height\b/.test(cls) ? { height: 'min-height' } : {}),
      ...(/\belementor-section-content-middle\b/.test(cls) ? { content_position: 'middle' } : /\belementor-section-content-bottom\b/.test(cls) ? { content_position: 'bottom' } : {}),
    });
    if (node.querySelector('.elementor-background-overlay')) settings.background_overlay_background ||= 'classic';
    return { id, elType: 'section', isInner: /\belementor-inner-section\b/.test(cls), settings, elements: children };
  }
  if (elType === 'column') {
    const size = Number(/\belementor-col-(\d+)/.exec(cls)?.[1]) || 100;
    settings._column_size = size;
    settings._inline_size ??= null;
    if (node.querySelector('.elementor-background-overlay')) settings.background_overlay_background ||= 'classic';
    return { id, elType: 'column', isInner: false, settings, elements: children };
  }
  // Elements of newer Elementor versions (atomic e-div-block, e-flexbox...): a container; when their
  // content is not made of Elementor elements, it is kept as it is in an HTML widget (the same look)
  notes.add(elType);
  const own = children.length ? children : node.innerHTML.trim() ? [{ id: `${id.slice(0, 5)}h${(children.length + 1).toString(16)}`, elType: 'widget', widgetType: 'html', settings: { html: node.innerHTML.trim() }, elements: [] }] : [];
  return { id, elType: 'container', isInner: true, settings: { content_width: 'full', ...settings }, elements: own };
}

/** The Elementor documents of a page: its content, and the header / footer made with Elementor (theme builder or Header Footer plugins). */
export function pageDocuments(root, base) {
  const docs = root.querySelectorAll('[data-elementor-type]').filter((d) => !d.parentNode?.closest?.('[data-elementor-type]'));
  const PAGE_TYPES = ['wp-page', 'wp-post', 'page', 'single-page', 'single-post', 'single'];
  const kind = (d) => {
    const t = d.getAttribute('data-elementor-type');
    if (t === 'header' || d.closest('header') || /elementor-location-header|ehf-header|hfe-header/.test(d.getAttribute('class') || '')) return 'header';
    if (t === 'footer' || d.closest('footer') || /elementor-location-footer|ehf-footer|hfe-footer/.test(d.getAttribute('class') || '')) return 'footer';
    if (PAGE_TYPES.includes(t)) return 'page';
    // Popups, loop items, saved sections, mega-menu contents: parts of the site, not its pages
    return null;
  };
  const out = {};
  const convert = (d) => {
    const notes = new Set();
    const content = childElements(d).map((el) => convertElement(el, base, notes));
    return content.length ? { postId: d.getAttribute('data-elementor-id'), content, notes } : null;
  };
  for (const d of docs) {
    const k = kind(d);
    if (k && !out[k]) out[k] = convert(d) || undefined;
  }
  // A page built with the theme builder (no "wp-page" document): its largest other document inside <main> / the body
  if (!out.page) {
    const others = docs.filter((d) => !kind(d) && !['popup', 'loop-item'].includes(d.getAttribute('data-elementor-type')));
    const largest = others.sort((a, b) => b.querySelectorAll('[data-element_type]').length - a.querySelectorAll('[data-element_type]').length)[0];
    if (largest) out.page = convert(largest) || undefined;
  }
  for (const k of Object.keys(out)) if (!out[k]) delete out[k];
  return out;
}

// ---------------------------------------------------------------------------------------- CSS --

/** Ids of the elements of a document (to find their background photos in the CSS). */
function collectIds(elements, out = new Map()) {
  for (const el of elements) {
    out.set(el.id, el);
    collectIds(el.elements || [], out);
  }
  return out;
}

const URL_IN_CSS = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;

/**
 * Only the rules that style the copied elements: a selector naming an element (.elementor-element-<id>)
 * stays only for the ids of the kit; rules of other pages, popups and menus are dropped. The other
 * rules (kit, widgets, @font-face, @keyframes) stay. Nested @media / @supports blocks are filtered too.
 */
export function keepRulesFor(css, ids) {
  let out = '';
  let i = 0;
  const n = css.length;
  while (i < n) {
    const open = css.indexOf('{', i);
    if (open < 0) break;
    const head = css.slice(i, open).trim();
    // Matching closing brace (nested blocks)
    let depth = 1;
    let j = open + 1;
    while (j < n && depth) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') depth--;
      j++;
    }
    const body = css.slice(open + 1, j - 1);
    i = j;
    if (!head) continue;
    if (/^@(media|supports|container|layer)\b/i.test(head)) {
      const inner = keepRulesFor(body, ids);
      if (inner.trim()) out += `${head}{${inner}}`;
      continue;
    }
    if (head.startsWith('@')) {
      out += `${head}{${body}}`;
      continue;
    }
    const selectors = head
      .split(',')
      .map((s) => s.trim())
      .filter((s) => {
        const named = [...s.matchAll(/\.elementor-element-([0-9a-z]{6,8})\b/g)].map((m) => m[1]);
        return !named.length || named.every((id) => ids.has(id));
      });
    if (selectors.length) out += `${selectors.join(',')}{${body}}`;
  }
  return out;
}

/**
 * The Elementor CSS of the site for the new site:
 *  - the selectors scoped to a post of the other site (.elementor-123 …) apply to the same elements
 *    here (same ids), with a little more weight than the CSS Elementor writes for them;
 *  - the kit selectors (.elementor-kit-5) apply to the page body;
 *  - the background photos of the converted elements are moved to their settings (replaced by the
 *    photos of the project) and removed from the CSS; the other urls become absolute.
 * Returns { css, backgrounds: Map(id -> url) }.
 */
export function adaptCss(sources, ids) {
  const backgrounds = new Map();
  const parts = [];
  for (const { base, text } of sources) {
    let css = keepRulesFor(text.replace(/\/\*[\s\S]*?\*\//g, ''), ids);
    // Background photos of the converted elements: into their settings
    css = css.replace(/([^{}]+)\{([^{}]*)\}/g, (rule, selector, body) => {
      if (!/background(-image)?\s*:[^;]*url\(/i.test(body)) return rule;
      const id = /\.elementor-element-([0-9a-z]{6,8})\b/.exec(selector)?.[1];
      if (!id || !ids.has(id) || /::?(before|after)|background-overlay|elementor-background-slideshow/.test(selector)) return rule;
      const url = /url\(\s*(['"]?)([^'")]+)\1\s*\)/i.exec(body)?.[2];
      if (!url || /^data:/i.test(url) || /\.svg(\?|$)/i.test(url)) return rule;
      let abs = url;
      try {
        abs = new URL(url, base).href;
      } catch {
        /* kept */
      }
      if (!backgrounds.has(id)) backgrounds.set(id, abs);
      const rest = body.replace(/background-image\s*:\s*url\([^)]*\)\s*(!important)?\s*;?/gi, '').replace(/background\s*:\s*url\([^)]*\)[^;]*;?/gi, '');
      return `${selector}{${rest}}`;
    });
    css = css
      .replace(URL_IN_CSS, (m, q, u) => {
        if (/^data:/i.test(u)) return m;
        try {
          return `url("${new URL(u, base).href}")`;
        } catch {
          return m;
        }
      })
      .replace(/\.elementor-kit-\d+/g, 'body')
      .replace(/\.elementor-\d+(?=[\s.:>[{,])/g, 'body .elementor');
    parts.push(css.trim());
  }
  return { css: parts.filter(Boolean).join('\n'), backgrounds };
}

/** Background photos found in the CSS: set on the elements (classic background), so the project photos replace them. */
function applyBackgrounds(elements, backgrounds) {
  for (const el of elements) {
    const url = backgrounds.get(el.id);
    if (url && el.elType !== 'widget') Object.assign(el.settings, { background_background: el.settings.background_background || 'classic', background_image: { url, id: '' } });
    applyBackgrounds(el.elements || [], backgrounds);
  }
}

/** Global colors and fonts of the site (the CSS variables of its Elementor kit) as Elementor kit settings. */
export function globalStylesFromCss(css) {
  const colors = new Map();
  for (const m of css.matchAll(/--e-global-color-([a-z0-9]+)\s*:\s*([^;}]+)/gi)) if (!colors.has(m[1])) colors.set(m[1], m[2].trim());
  const fonts = new Map();
  for (const m of css.matchAll(/--e-global-typography-([a-z0-9]+)-(font-family|font-weight)\s*:\s*([^;}]+)/gi)) {
    const f = fonts.get(m[1]) || {};
    f[m[2]] = m[3].replace(/["']/g, '').split(',')[0].trim();
    fonts.set(m[1], f);
  }
  const SYSTEM = ['primary', 'secondary', 'text', 'accent'];
  const color = (id, value) => ({ _id: id, title: id[0].toUpperCase() + id.slice(1), color: value });
  const font = (id, f) => ({ _id: id, title: id[0].toUpperCase() + id.slice(1), typography_typography: 'custom', ...(f['font-family'] ? { typography_font_family: f['font-family'] } : {}), ...(f['font-weight'] ? { typography_font_weight: f['font-weight'] } : {}) });
  if (!colors.size && !fonts.size) return null;
  return {
    system_colors: SYSTEM.filter((id) => colors.has(id)).map((id) => color(id, colors.get(id))),
    custom_colors: [...colors].filter(([id]) => !SYSTEM.includes(id)).map(([id, v]) => color(id, v)),
    system_typography: SYSTEM.filter((id) => fonts.has(id)).map((id) => font(id, fonts.get(id))),
    custom_typography: [...fonts].filter(([id]) => !SYSTEM.includes(id)).map(([id, f]) => font(id, f)),
  };
}

/**
 * The CSS variables the copied CSS uses and does not define (theme / WordPress ones: --ast-global-color-0,
 * --wp--preset--color--primary...), with their values on the other site, followed when they point to
 * other variables. The Elementor globals are excluded: they come with the global styles of the kit.
 */
export function themeVariables(css, vars = new Map()) {
  const defined = new Set([...css.matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)].map((m) => m[1]));
  const wanted = new Map();
  const need = (name, depth = 0) => {
    if (depth > 4 || wanted.has(name) || defined.has(name) || name.startsWith('--e-global-') || !vars.has(name)) return;
    const value = vars.get(name);
    wanted.set(name, value);
    for (const m of value.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)/g)) need(m[1], depth + 1);
  };
  for (const m of css.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)/g)) need(m[1]);
  return wanted.size ? `:root{${[...wanted].map(([k, v]) => `${k}:${v}`).join(';')}}\n` : '';
}

/** Fonts used by the CSS, loaded from Google Fonts (one @import each: an unknown family does not stop the others). */
export function fontImports(css, fontLinks = []) {
  const families = new Set();
  for (const link of fontLinks) for (const m of link.matchAll(/family=([^&:]+)/g)) for (const f of decodeURIComponent(m[1]).split('|')) families.add(f.replace(/\+/g, ' ').split(':')[0].trim());
  for (const m of css.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
    const f = m[1].split(',')[0].replace(/["']/g, '').trim();
    if (f && !/^(var\(|inherit|initial|sans-serif|serif|monospace|-apple|system-ui|eicons|font ?awesome|fa-|dashicons|swiper|star|elementskit|icomoon|themify)/i.test(f)) families.add(f);
  }
  // Fonts of the computer (not on Google Fonts)
  const system = /^(helvetica|arial|georgia|times|times new roman|verdana|tahoma|trebuchet ms|courier|courier new|segoe ui|impact|garamond)$/i;
  // The first version of the Google Fonts API ignores the weights a family does not have (css2 refuses the whole request)
  return [...families]
    .filter((f) => !system.test(f))
    .slice(0, 8)
    .map((f) => `@import url("https://fonts.googleapis.com/css?family=${encodeURIComponent(f).replace(/%20/g, '+')}:300,400,500,600,700,800,400italic&display=swap");`);
}

// ------------------------------------------------------------------------------------ the kit --

/** Title of a page template, from which the kit reader guesses its role (home, about, services, contact, gallery). */
function pageTitle(page, index) {
  if (index === 0) return 'Home';
  const slug = decodeURIComponent(page.url.pathname).replace(/\/+$/, '').split('/').pop() || '';
  return `${page.label || slug} (${slug || page.url.pathname})`.slice(0, 120);
}

/**
 * Convert a crawled Elementor site and write it as a Template Kit folder.
 * @returns {{ title, pages: number, notes: string[], dir }}
 */
export function writeKitFromSite(site, dir) {
  const templates = [];
  const notes = new Set();
  let header = null;
  let footer = null;
  const docs = [];
  site.pages.forEach((page, i) => {
    const found = pageDocuments(page.root, page.url.href);
    header ||= found.header;
    footer ||= found.footer;
    if (found.page) docs.push({ title: pageTitle(page, i), doc: found.page });
  });
  if (!docs.length) {
    throw badRequest('This website is not built with Elementor: its structure cannot be copied exactly. Use "Similar" mode instead (it follows its colors, fonts and sections).');
  }
  const all = [...docs.map((d) => d.doc), header, footer].filter(Boolean);
  const ids = new Map();
  for (const d of all) collectIds(d.content, ids);
  const { css, backgrounds } = adaptCss(site.css, ids);
  for (const d of all) {
    applyBackgrounds(d.content, backgrounds);
    d.notes.forEach((n) => notes.add(n));
  }

  fs.mkdirSync(path.join(dir, 'templates'), { recursive: true });
  const write = (name, title, type, doc) => {
    const file = `templates/${name}.json`;
    fs.writeFileSync(path.join(dir, file), JSON.stringify({ version: '0.4', title, type, content: doc.content, page_settings: { hide_title: 'yes' } }));
    templates.push({ name: title, source: file, type, metadata: { template_type: type } });
  };
  docs.forEach((d, i) => write(`page-${i + 1}`, d.title, 'page', d.doc));
  if (header) write('header', 'Header', 'header', header);
  if (footer) write('footer', 'Footer', 'footer', footer);

  const styles = globalStylesFromCss(css);
  if (styles) fs.writeFileSync(path.join(dir, 'site-settings.json'), JSON.stringify({ settings: styles }));
  fs.writeFileSync(path.join(dir, 'site.css'), `${fontImports(css, site.fontLinks).join('\n')}\n${themeVariables(css, site.vars)}${css}`);
  const title = (site.pages[0].root.querySelector('title')?.text || new URL(site.url).hostname).replace(/\s+/g, ' ').trim().slice(0, 150);
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ title, source: site.url, templates }, null, 1));
  return { title, pages: docs.length, header: Boolean(header), footer: Boolean(footer), notes: [...notes], dir };
}

/** CSS of a kit made from a website (Elementor CSS of the site + its fonts), next to its manifest. */
export const KIT_SITE_CSS = 'site.css';
