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
 * Not copied: scripts (animations made by scripts do not run; sliders are laid out by CSS and moved by a
 * small script of ours: prepareSliders) and search / newsletter forms. The site header is rebuilt as
 * Elementor widgets (captureHeader): its menu belongs to the other site and needs its scripts on phones,
 * so the logo, the menu of the new site and the button of the header are put in its place, in its look.
 */
import crypto from 'node:crypto';
import { extractParts, PARTS_KEY } from '../elementor/html-parts.js';

const isElement = (n) => n?.nodeType === 1;
const tagOf = (n) => (n.rawTagName || '').toLowerCase();
const HAS_LETTER = /\p{L}/u;
const MEDIA = 'img, picture, video, iframe, svg, canvas, form';

/** Elementor-like id (7 hex characters), stable for the same page and position. */
export const stableId = (...keys) => crypto.createHash('md5').update(keys.join('|')).digest('hex').slice(0, 7);

/** Moves the carousels of the widget it is in: autoplay (paused under the mouse), arrows, back to the first slide at the end. */
export const CAROUSEL_SCRIPT =
  '<script>(function(s){var root=s.parentNode;if(!root)return;root.querySelectorAll("[data-esg-carousel]").forEach(function(w){var step=function(d){var max=w.scrollWidth-w.clientWidth;var slide=w.children[0]?w.children[0].getBoundingClientRect().width+(parseFloat(getComputedStyle(w).columnGap)||0):w.clientWidth;var to=w.scrollLeft+d*slide;if(d>0&&w.scrollLeft>=max-4)to=0;if(d<0&&w.scrollLeft<=4)to=max;w.scrollTo({left:to,behavior:"smooth"})};var box=w.closest(".swiper,.swiper-container")||w.parentNode;var scope=box.parentNode||box;scope.querySelectorAll(".swiper-button-next,.slick-next,.owl-next").forEach(function(b){b.addEventListener("click",function(e){e.preventDefault();step(1)})});scope.querySelectorAll(".swiper-button-prev,.slick-prev,.owl-prev").forEach(function(b){b.addEventListener("click",function(e){e.preventDefault();step(-1)})});var delay=+w.getAttribute("data-esg-carousel");if(delay&&!matchMedia("(prefers-reduced-motion: reduce)").matches)setInterval(function(){if(!w.matches(":hover")&&w.scrollWidth>w.clientWidth+4)step(1)},delay)})})(document.currentScript)</script>';

/**
 * Sliders made by a script of the other site (slick, owl, a theme script): without it their slides pile up
 * one under the other. The element whose children are the slides (a class with "slider" / "carousel" / "slick"
 * / "owl" and at least two children of the same class) becomes a carousel of ours: one row laid out by CSS,
 * moved by CAROUSEL_SCRIPT. Photo slides show one at a time, text slides (reviews, cards) up to three.
 */
export function prepareSliders(root) {
  const firstClass = (el) => (el.getAttribute('class') || '').trim().split(/\s+/)[0] || '';
  for (const el of root.querySelectorAll('[class]')) {
    if (!/slider|carousel|slick|(^|[-_\s])owl/i.test(el.getAttribute('class')) || el.getAttribute('data-esg-carousel') !== undefined && el.getAttribute('data-esg-carousel') !== null) continue;
    if (/^(ul|ol|nav|section|header|footer|form)$/.test(tagOf(el)) || el.closest('.swiper-wrapper, [data-elementor-type], [data-esg-carousel]')) continue;
    const slides = el.childNodes.filter(isElement);
    if (slides.length < 2 || !firstClass(slides[0]) || !slides.every((s) => tagOf(s) === tagOf(slides[0]) && firstClass(s) === firstClass(slides[0]))) continue;
    const texts = slides.filter((s) => s.text.replace(/\s+/g, ' ').trim().length > 40).length;
    const per = texts > slides.length / 2 ? Math.min(3, slides.length) : 1;
    el.setAttribute('data-esg-carousel', '5000');
    el.setAttribute('style', `${el.getAttribute('style') || ''};--esg-per-d:${per};--esg-gap:${per > 1 ? 24 : 0}px`.replace(/^;/, ''));
  }
  return root;
}

/** An HTML widget with a piece of copied markup; its texts, images and links become parts. */
export function htmlWidget(id, html, classes = '', { settings: extra = {}, suffix = '' } = {}) {
  const { html: template, parts } = extractParts(html, { prefix: id });
  // suffix: markup added after the copied one and never read for parts (the script of a carousel)
  const settings = { ...extra, html: (parts.length ? template : html) + suffix };
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
  prepareSliders(root);
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
    // A slider of the block (prepareSliders) is moved by the carousel script
    elements: [htmlWidget(stableId(id, 'w'), html, '', { suffix: html.includes('data-esg-carousel') ? CAROUSEL_SCRIPT : '' })],
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

/** Value of a property in the first CSS rule whose selector passes the test (plain scan: at-rules are not told apart). */
function declaredIn(css, test, prop) {
  const re = /([^{}]+)\{([^{}]*)\}/g;
  const value = new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([^;]+)', 'i');
  for (let m; (m = re.exec(css)); ) {
    if (!m[1].split(',').some((sel) => test(sel.trim()))) continue;
    const v = value.exec(m[2])?.[1]?.replace(/!important/i, '').trim();
    if (v) return v;
  }
  return null;
}
const classList = (el) => (el?.getAttribute?.('class') || '').split(/\s+/).filter(Boolean);
const hasClass = (sel, classes) => classes.some((c) => new RegExp('\\.' + c.replace(/[^\w-]/g, '\\$&') + '(?![\\w-])').test(sel));
const plainColor = (v) => (/^(#[0-9a-f]{3,8}|rgba?\([^)]*\))$/i.test(v || '') ? v : null);

/**
 * The header of a site that is not made with Elementor, rebuilt as Elementor widgets in its look: the
 * logo (the project logo takes its place), the menu of the new site (menu widget, with its own button on
 * phones) and the button of the header when it has one. Colors, font and sizes are read from the CSS rules
 * of the menu links and of the button. Returns { content, notes, css } (css: its layout, for the site CSS).
 */
export function captureHeader(el, key, css = '', base = '') {
  if (!el) return null;
  const px = (size) => ({ unit: 'px', size, sizes: [] });
  const absolute = (u) => {
    try {
      return new URL(u, base || undefined).href;
    } catch {
      return u || '';
    }
  };
  const id = (part) => stableId(key, part);
  const img = el.querySelector('img');
  // The list of the menu (a <nav> without list: the nav itself)
  const list = el.querySelector('nav ul') || el.querySelector('ul[class*="menu" i], ul[class*="nav" i]') || el.querySelector('nav');
  const button = el.querySelectorAll('a').find((a) => /(^|[-_\s])(btn|button|cta)/i.test(a.getAttribute('class') || '') && !a.closest('ul') && !a.querySelector('img') && a.text.trim().length > 1 && a.text.trim().length < 40);
  if (!img && !list) return null;

  // Menu links: the rules of the menu (its classes) ending at a link
  const menuClasses = [...classList(list), ...classList(list?.parentNode), ...classList(el.querySelector('nav'))];
  const menuLink = (sel) => (hasClass(sel, menuClasses) || /^(header|nav)\b|\bheader\b.*\bnav\b/.test(sel)) && /(^|[\s>])a$/.test(sel) && !/sub-?menu|dropdown|:hover|:focus|current|active/i.test(sel);
  const menuHover = (sel) => (hasClass(sel, menuClasses) || /^(header|nav)\b/.test(sel)) && /(^|[\s>])a:hover$/.test(sel) && !/sub-?menu|dropdown/i.test(sel);
  const family = (v) => v?.split(',')[0].replace(/["']/g, '').trim() || null;
  const linkColor = plainColor(declaredIn(css, menuLink, 'color'));
  const hoverColor = plainColor(declaredIn(css, menuHover, 'color'));
  const linkFont = family(declaredIn(css, menuLink, 'font-family'));
  const linkSize = parseFloat(declaredIn(css, menuLink, 'font-size'));
  const linkWeight = declaredIn(css, menuLink, 'font-weight');

  const elements = [];
  if (img) {
    const width = Math.min(320, Math.max(90, parseFloat(img.getAttribute('width')) || parseFloat(declaredIn(css, (sel) => hasClass(sel, [...classList(img), ...classList(img.parentNode)]) && !/:/.test(sel), 'width')) || 170));
    elements.push({ id: id('logo'), elType: 'widget', widgetType: 'image', settings: { image: { url: absolute(img.getAttribute('src')), id: '', alt: '' }, image_size: 'full', align: 'left', width: px(width), link_to: 'custom', link: { url: '/', is_external: '', nofollow: '' } }, elements: [] });
  }
  if (list) {
    elements.push({
      id: id('menu'),
      elType: 'widget',
      widgetType: 'navigation-menu',
      settings: {
        menu: '',
        layout: 'horizontal',
        navmenu_align: 'right',
        dropdown: 'tablet',
        resp_align: 'right',
        full_width_dropdown: 'yes',
        submenu_icon: 'arrow',
        pointer: 'none',
        padding_horizontal_menu_item: px(0),
        padding_horizontal_menu_item_tablet: px(20),
        padding_vertical_menu_item: px(8),
        padding_vertical_menu_item_tablet: px(14),
        menu_space_between: px(34),
        color_dropdown_item: '#222222',
        background_color_dropdown_item: '#FFFFFF',
        color_dropdown_item_hover: '#222222',
        background_color_dropdown_item_hover: '#F2F2F2',
        distance_from_menu: px(14),
        toggle_size: px(24),
        ...(linkColor ? { color_menu_item: linkColor, toggle_color: linkColor } : {}),
        ...(hoverColor || linkColor ? { color_menu_item_hover: hoverColor || linkColor, color_menu_item_active: hoverColor || linkColor, toggle_hover_color: hoverColor || linkColor } : {}),
        ...(linkFont ? { menu_typography_typography: 'custom', menu_typography_font_family: linkFont, ...(linkSize ? { menu_typography_font_size: px(linkSize) } : {}), ...(/^\d+$/.test(linkWeight || '') ? { menu_typography_font_weight: linkWeight } : {}) } : {}),
      },
      elements: [],
    });
  }
  let buttonCss = '';
  if (button) {
    const classes = classList(button);
    const own = (sel) => hasClass(sel, classes) && !/[:\s>]/.test(sel.replace(/^a\./, '.'));
    const over = (sel) => hasClass(sel, classes) && /:hover$/.test(sel) && !/\s/.test(sel);
    const bg = plainColor(declaredIn(css, own, 'background-color')) || plainColor(declaredIn(css, own, 'background'));
    const fg = plainColor(declaredIn(css, own, 'color'));
    const radius = parseFloat(declaredIn(css, own, 'border-radius'));
    const font = family(declaredIn(css, own, 'font-family'));
    const size = parseFloat(declaredIn(css, own, 'font-size'));
    const weight = declaredIn(css, own, 'font-weight');
    const hoverBg = plainColor(declaredIn(css, over, 'background-color')) || plainColor(declaredIn(css, over, 'background'));
    const r = Number.isFinite(radius) ? String(radius) : '4';
    elements.push({
      id: id('button'),
      elType: 'widget',
      widgetType: 'button',
      settings: {
        text: button.text.replace(/\s+/g, ' ').trim(),
        link: { url: absolute(button.getAttribute('href') || '/'), is_external: '', nofollow: '' },
        size: 'sm',
        ...(bg ? { background_color: bg } : {}),
        ...(fg ? { button_text_color: fg } : {}),
        ...(hoverBg ? { button_background_hover_color: hoverBg } : {}),
        border_radius: { unit: 'px', top: r, right: r, bottom: r, left: r, isLinked: true },
        ...(font ? { typography_typography: 'custom', typography_font_family: font, ...(size ? { typography_font_size: px(size) } : {}), ...(/^\d+$/.test(weight || '') ? { typography_font_weight: weight } : {}) } : {}),
      },
      elements: [],
    });
    buttonCss = `.esg-hd-copied .elementor-button{${bg ? `background-color:${bg};` : ''}${fg ? `color:${fg};` : ''}border-radius:${r}px;padding:12px 22px;line-height:1.2;text-decoration:none;white-space:nowrap${font ? `;font-family:"${font}",sans-serif` : ''}${size ? `;font-size:${size}px` : ''}${/^\d+$/.test(weight || '') ? `;font-weight:${weight}` : ''}}\n`;
  }
  const isHeader = (sel) => sel === 'header' || (hasClass(sel, classList(el)) && !/[:\s>]/.test(sel));
  // A header that stays at the top of the screen while the page scrolls (the page keeps the room it leaves for it)
  const pinned = /^(fixed|sticky)$/.test(declaredIn(css, isHeader, 'position') || '');
  const background = plainColor(declaredIn(css, isHeader, 'background-color')) || plainColor(declaredIn(css, isHeader, 'background')) || (pinned ? '#FFFFFF' : null);
  // Width of the header: the one of its inner wrapper (none: the whole screen, with the side padding of the wrapper)
  const inner = (sel) => hasClass(sel, classList(el.childNodes.find(isElement))) && !/[:\s>]/.test(sel);
  const wide = parseFloat(declaredIn(css, inner, 'max-width')) || 0;
  const side = Math.min(80, Math.max(16, parseFloat(declaredIn(css, inner, 'padding-left')) || 24));
  const container = {
    id: id('row'),
    elType: 'container',
    isInner: false,
    settings: {
      ...(wide ? { content_width: 'boxed', boxed_width: px(Math.min(1920, Math.max(960, wide))) } : { content_width: 'full' }),
      flex_direction: 'row',
      flex_wrap: 'nowrap',
      flex_justify_content: 'space-between',
      flex_align_items: 'center',
      flex_gap: { unit: 'px', size: 32, column: '32', row: '32', isLinked: true },
      padding: { unit: 'px', top: '18', right: String(side), bottom: '18', left: String(side), isLinked: false },
      padding_mobile: { unit: 'px', top: '14', right: '16', bottom: '14', left: '16', isLinked: false },
      css_classes: pinned ? 'esg-hd-copied esg-hd-pinned' : 'esg-hd-copied',
      ...(background ? { background_background: 'classic', background_color: background } : {}),
    },
    elements,
  };
  const logoWidth = elements.find((e) => e.widgetType === 'image')?.settings.width.size;
  // Its layout also as CSS of the site: the same in the preview (which has no Elementor) and on the site
  const row = 'display:flex;flex-direction:row;flex-wrap:nowrap;align-items:center;justify-content:space-between;gap:32px';
  const layout = [
    '',
    `.esg-hd-copied{position:relative;z-index:100${background ? `;background-color:${background}` : ''}}`,
    wide
      ? `.esg-hd-copied>.e-con-inner{${row};width:100%;max-width:${container.settings.boxed_width.size}px;margin:0 auto;padding:18px ${side}px}`
      : `.esg-hd-copied{${row};width:100%;padding:18px ${side}px}`,
    pinned ? '.esg-hd-copied.esg-hd-pinned{position:fixed;top:0;left:0;right:0;z-index:9999}\n.admin-bar .esg-hd-copied.esg-hd-pinned{top:32px}' : '',
    '.esg-hd-copied .elementor-widget{margin:0;width:auto;flex:0 0 auto}',
    '.esg-hd-copied .elementor-widget-navigation-menu{flex:1 1 auto;min-width:0}',
    logoWidth ? `.esg-hd-copied .elementor-widget-image img{width:${logoWidth}px;max-width:100%;height:auto;display:block}` : '',
    '@media(max-width:767px){.esg-hd-copied,.esg-hd-copied>.e-con-inner{padding:14px 16px;gap:16px}.esg-hd-copied .elementor-widget-button{display:none}}',
    buttonCss,
  ]
    .filter((line, i) => line || i === 0)
    .join('\n');
  return { content: [container], notes: new Set(), html: true, css: layout };
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
