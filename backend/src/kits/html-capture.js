/**
 * Any web page turned into Elementor sections that look the same (kits/from-site.js uses it for the
 * pages, or parts of pages, that are not made of Elementor elements: other page builders, themes,
 * hand-written sites).
 *
 * The markup of the page is kept as it is, because its CSS is written for it: every block of the
 * page becomes a top-level Elementor container holding one HTML widget with that block, inside
 * copies of the wrappers it had on the page (so the selectors and the widths of the site still
 * apply). The texts, images and links of each block are taken out as parts (elementor/html-parts.js):
 * the AI rewrites the texts for the client and the photos of the project replace the images.
 *
 * Not copied: scripts (sliders stay on their first slide, animations made by scripts do not run),
 * the site header (its menu belongs to the other site and needs its scripts on phones: the generator
 * builds the header with the colors and fonts of the site) and search / newsletter forms.
 */
import crypto from 'node:crypto';
import { extractParts, PARTS_KEY } from '../elementor/html-parts.js';

const isElement = (n) => n?.nodeType === 1;
const tagOf = (n) => (n.rawTagName || '').toLowerCase();
const HAS_LETTER = /\p{L}/u;
const MEDIA = 'img, picture, video, iframe, svg, canvas, form';

/** Elementor-like id (7 hex characters), stable for the same page and position. */
export const stableId = (...keys) => crypto.createHash('md5').update(keys.join('|')).digest('hex').slice(0, 7);

/** An HTML widget with a piece of copied markup; its texts, images and links become parts. */
export function htmlWidget(id, html, classes = '') {
  const { html: template, parts } = extractParts(html, { prefix: id });
  const settings = { html: parts.length ? template : html };
  if (parts.length) settings[PARTS_KEY] = parts;
  if (classes) settings._css_classes = classes;
  return { id, elType: 'widget', widgetType: 'html', settings, elements: [] };
}

/** What a script removes or reveals on the real site and would cover or clutter the copy; and code. */
const JUNK =
  'script, noscript, template, style, link, meta, base, #wpadminbar, ' +
  '[id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i], [id*="gdpr" i], [class*="gdpr" i], .cky-consent-container, .cmplz-cookiebanner, #iubenda-cs-banner, ' +
  '[id*="preloader" i], [class*="preloader" i], [class*="page-loader" i], [id*="page-loader" i], [class*="loading-screen" i], .pace, ' +
  '[class*="chat-widget" i], #chat-widget-container, .joinchat, .ht-ctc, [id*="tidio" i], [class*="intercom" i], .grecaptcha-badge';

/**
 * A parsed page without what must not be copied: code, cookie banners, preloaders, chat bubbles, and
 * the forms that are not contact forms (search, newsletter: one or two fields). In place.
 */
export function cleanPage(root) {
  for (const el of root.querySelectorAll(JUNK)) {
    // A whole section is never dropped for a word in its class ("cookie-policy-page"...)
    if (/^(script|noscript|template|style|link|meta|base)$/.test(tagOf(el)) || el.text.length < 1500) el.remove();
  }
  for (const form of root.querySelectorAll('form')) {
    const fields = form.querySelectorAll('input, textarea, select').filter((f) => !/^(hidden|submit|button|image|reset)$/i.test(f.getAttribute('type') || ''));
    if (form.getAttribute('role') === 'search' || fields.length <= 2) form.remove();
  }
  // Inline event handlers of the other site
  for (const el of root.querySelectorAll('*')) {
    for (const name of Object.keys(el.attributes || {})) if (/^on[a-z]+$/i.test(name)) el.removeAttribute(name);
  }
  return root;
}

const textLength = (el) => el.text.replace(/\s+/g, ' ').trim().length;
const meaningful = (el) => HAS_LETTER.test(el.text) || tagOf(el) === 'img' || Boolean(el.querySelector(MEDIA));

/** The header of the site (logo + menu at the top of every page), or null: a <header> holding the hero is content. */
export function findSiteHeader(root) {
  const candidates = [...root.querySelectorAll('header'), ...root.querySelectorAll('[role="banner"], #header, #masthead, #site-header, .site-header, .main-header, .navbar, .header')];
  for (const el of candidates) {
    if (el.closest('main, article, section, footer') && tagOf(el) !== 'header') continue;
    if (el.parentNode?.closest?.('main, article, footer')) continue;
    const hasMenu = Boolean(el.querySelector('nav, [class*="menu" i], [class*="nav" i], ul li a'));
    if (hasMenu && !el.querySelector('h1') && textLength(el) < 2500) return el;
  }
  // A menu bar that is not in a <header>
  const nav = root.querySelector('body > nav, body > div > nav');
  return nav && textLength(nav) < 2500 ? nav : null;
}

/** The footer of the site (the last one, outside the articles), or null. */
export function findSiteFooter(root) {
  const candidates = [...root.querySelectorAll('footer'), ...root.querySelectorAll('[role="contentinfo"], #footer, #colophon, .site-footer, .main-footer, .footer')].filter((el) => !el.parentNode?.closest?.('main, article, section, header, footer'));
  return candidates[candidates.length - 1] || null;
}

/** Opening tag of a wrapper kept around a copied block (same tag, id and classes; never its own vertical spacing: CSS of from-site). */
function shellOpen(el) {
  const tag = /^(div|main|article|section|aside)$/.test(tagOf(el)) ? tagOf(el) : 'div';
  const cls = `${el.getAttribute('class') || ''} esg-shell`.trim();
  const id = el.getAttribute('id');
  return { open: `<${tag}${id ? ` id="${id.replace(/"/g, '')}"` : ''} class="${cls.replace(/"/g, '')}">`, close: `</${tag}>` };
}

/** Tags that are blocks of their own; the others (paragraphs, titles, lists...) are grouped with their neighbours. */
const BLOCK = /^(section|div|article|aside|main|header|footer|nav|form|figure|table)$/;

/**
 * The blocks of a page region, top to bottom, each with the wrappers it sits in.
 * Wrappers with a single meaningful child are walked through (#page > #content > main > article...),
 * until the element whose children are the sections of the page.
 */
export function splitBlocks(region) {
  const shells = [];
  let node = region;
  for (let depth = 0; depth < 10; depth++) {
    const kids = node.childNodes.filter((c) => isElement(c) && meaningful(c));
    if (!kids.length) break;
    // One child holds (nearly) everything: go inside it; the tiny ones beside it (skip links...) are left out
    const total = kids.reduce((n, k) => n + textLength(k) + 200 * k.querySelectorAll('img').length, 0) || 1;
    const main = kids.find((k) => (textLength(k) + 200 * k.querySelectorAll('img').length) / total >= 0.92);
    const single = kids.length === 1 ? kids[0] : main && kids.every((k) => k === main || (textLength(k) < 120 && !k.querySelector(MEDIA))) ? main : null;
    if (!single || !BLOCK.test(tagOf(single))) break;
    // Its children must be blocks themselves: a wrapper holding titles and paragraphs is a section, not a list of sections
    const inner = single.childNodes.filter((c) => (isElement(c) && meaningful(c)) || (c.nodeType === 3 && c.rawText.trim()));
    if (!inner.length || !inner.every((c) => isElement(c) && BLOCK.test(tagOf(c)))) break;
    shells.push(shellOpen(single));
    node = single;
  }
  // Children of the list node: a block element is a section; runs of loose elements (titles, paragraphs) are one.
  // A few very large blocks: the largest ones are opened too (their children are sections, inside one more wrapper)
  const blocks = [];
  const list = (parent, extra, depth) => {
    let run = [];
    const flush = () => {
      const html = run.map((n) => n.toString()).join('');
      if (run.some((n) => isElement(n) && meaningful(n))) blocks.push({ html, shells: extra });
      else if (run.length && blocks.length) blocks[blocks.length - 1].html += html;
      run = [];
    };
    const kids = parent.childNodes.filter((c) => isElement(c) && BLOCK.test(tagOf(c)) && meaningful(c));
    for (const child of parent.childNodes) {
      if (isElement(child) && BLOCK.test(tagOf(child)) && meaningful(child)) {
        flush();
        const inner = child.childNodes.filter((c) => isElement(c) && BLOCK.test(tagOf(c)) && meaningful(c));
        const loose = child.childNodes.some((c) => (c.nodeType === 3 && c.rawText.trim()) || (isElement(c) && !BLOCK.test(tagOf(c)) && meaningful(c)));
        if (depth < 2 && kids.length < 4 && inner.length >= 3 && !loose && textLength(child) > 600) list(child, [...extra, shellOpen(child)], depth + 1);
        else blocks.push({ html: child.toString(), shells: extra });
      } else if (isElement(child) || (child.nodeType === 3 && child.rawText.trim())) run.push(child);
    }
    flush();
  };
  list(node, [], 0);
  return { shells, blocks };
}

/** One copied block as a top-level Elementor container: no padding or gap of its own, one HTML widget. */
function sectionElement(id, html) {
  return {
    id,
    elType: 'container',
    isInner: false,
    settings: {
      content_width: 'full',
      css_classes: 'esg-sec',
      flex_gap: { unit: 'px', size: 0, column: '0', row: '0', isLinked: true },
      padding: { unit: 'px', top: '0', right: '0', bottom: '0', left: '0', isLinked: true },
    },
    elements: [htmlWidget(stableId(id, 'w'), html)],
  };
}

/** Classes of the <body> of the page, kept on a wrapper of every copied block (the CSS of the site: body.home .x). */
function bodyWrapper(root) {
  const body = root.querySelector('body');
  const cls = `${body?.getAttribute('class') || ''}`.replace(/"/g, '').trim();
  return { open: `<div class="esg-body${cls ? ` ${cls}` : ''}">`, close: '</div>' };
}

/**
 * The content of a page (everything of its <body> but the header, the footer and the nodes in
 * `exclude`) as Elementor sections. key: unique per page (stable ids).
 * @returns {{ content: object[], notes: Set<string> } | null}
 */
export function captureContent(root, key, exclude = []) {
  const body = root.querySelector('body') || root;
  const wrapper = bodyWrapper(root);
  for (const el of exclude) el?.remove?.();
  const { shells, blocks } = splitBlocks(body);
  if (!blocks.length) return null;
  const content = blocks.map((b, i) => {
    const around = [...shells, ...b.shells];
    return sectionElement(stableId(key, i), `${wrapper.open}${around.map((s) => s.open).join('')}${b.html}${around.map((s) => s.close).reverse().join('')}${wrapper.close}`);
  });
  return { content, notes: new Set(), html: true };
}

/** One element of the page (its footer) as a single Elementor section, inside the wrappers it had. */
export function captureElement(root, el, key) {
  if (!el || !meaningful(el)) return null;
  const wrapper = bodyWrapper(root);
  const shells = [];
  for (let p = el.parentNode; p && isElement(p) && tagOf(p) !== 'body' && tagOf(p) !== 'html'; p = p.parentNode) shells.unshift(shellOpen(p));
  const html = `${wrapper.open}${shells.map((s) => s.open).join('')}${el.toString()}${shells.map((s) => s.close).reverse().join('')}${wrapper.close}`;
  return { content: [sectionElement(stableId(key, 0), html)], notes: new Set(), html: true };
}

/**
 * CSS the copied blocks need on the new site, whatever the site:
 *  - their Elementor container adds no space of its own;
 *  - the copies of the wrappers around each block do not repeat the vertical spacing of the wrapper;
 *  - what the scripts of the other site reveal while the page loads or scrolls is visible.
 */
export const CAPTURE_CSS = `
.e-con.esg-sec{--padding-top:0px;--padding-bottom:0px;--padding-left:0px;--padding-right:0px;--gap:0px;--row-gap:0px;--column-gap:0px;padding:0}
.esg-sec>.elementor-widget{margin:0;width:100%;max-width:100%}
.esg-shell{padding-top:0!important;padding-bottom:0!important;margin-top:0!important;margin-bottom:0!important;min-height:0!important;height:auto!important;border-top:0!important;border-bottom:0!important}
.esg-body :is([data-aos],.wow,.aos-init,.elementor-invisible,.et_animated,.et-waypoint,.wpb_animate_when_almost_visible,.animate-on-scroll,.scroll-reveal,.reveal,.fade-in,.fade-up,.sr,.js-reveal,.lazyload){opacity:1!important;visibility:visible!important;transform:none!important}`;
