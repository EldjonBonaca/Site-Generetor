/**
 * Template from a reference website ("the client wants a site like this one").
 *
 *  1. fetchReference(url): the page and its stylesheets, downloaded by the server with safe limits
 *     (public http(s) addresses only, size, time and redirect limits).
 *  2. analyzeReference(): what can be measured on them, without a browser: colors (Elementor global
 *     colors first, else the most used ones), fonts, button corners, uppercase titles, dark pages,
 *     the menu, and the outline of the page in order (titles and blocks: slider, counters, reviews,
 *     FAQ, form, gallery...).
 *  3. generateFromReference(): the AI turns that analysis into a template of the generator (the
 *     options closest to the reference for every section) with NEW sample texts for the category:
 *     the design is followed, the texts and images of the reference site are never copied.
 * The result is an ordinary template: saved in a category, chosen by a project, exported as the
 * WordPress plugin like any other.
 */
import dns from 'node:dns/promises';
import net from 'node:net';
import { extractJson } from '../ai/json.js';
import { AIError } from '../ai/AIProvider.js';
import { estimateTokens, languageName } from '../generation/prompt-builder.js';
import { TEMPLATE_PROMPT } from '../generation/site-prompt.js';
import { badRequest } from '../lib/util.js';
import { COLOR_KEYS, FONTS, LAYOUTS, OPTIONAL_SECTIONS, REQUIRED_SECTIONS, SECTION_NAMES_IT, SPACINGS, STYLE_OPTIONS, WEIGHTS, sanitizeSpec } from './spec.js';
import { directionList } from './directions.js';
import { TEMPLATE_SYSTEM_PROMPT, technicalInstructions } from './generate.js';

const MAX_HTML = 3_000_000;
const MAX_CSS = 1_500_000;
const MAX_STYLESHEETS = 8;
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;
const RETRIES = 2;
const USER_AGENT = 'Mozilla/5.0 (compatible; SiteGenerator/1.0; reference analysis)';

// ------------------------------------------------------------------------------------- fetching --

/** Private, loopback, link-local and reserved addresses: never fetched (the server must not reach its own network). */
export function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateAddress(v6.slice(7));
  return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe8') || v6.startsWith('fe9') || v6.startsWith('fea') || v6.startsWith('feb') || v6.startsWith('ff');
}

/** The address typed by the user as a URL (https:// added when missing), or a readable error. */
export function referenceUrl(value) {
  let text = String(value ?? '').trim();
  if (!text) throw badRequest('Enter the address of the website.');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `https://${text}`;
  let url;
  try {
    url = new URL(text);
  } catch {
    throw badRequest('The address of the website is not valid.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw badRequest('Only http:// and https:// websites can be analyzed.');
  if (url.username || url.password) throw badRequest('The address of the website is not valid.');
  url.hash = '';
  return url;
}

async function assertPublicHost(url, lookup) {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (/^localhost$|\.localhost$|\.local$|\.internal$/i.test(host)) throw badRequest('This address cannot be analyzed (local network).');
  const addresses = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addresses.length) throw badRequest(`The website "${url.hostname}" was not found.`);
  if (addresses.some((a) => isPrivateAddress(a.address))) throw badRequest('This address cannot be analyzed (local network).');
}

/** GET with the safety limits: public hosts only (checked again on every redirect), max size and time. */
async function safeGet(start, { maxBytes, fetchImpl, lookup, accept }) {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(url, lookup);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetchImpl(url.href, { redirect: 'manual', signal: ctrl.signal, headers: { 'User-Agent': USER_AGENT, Accept: accept } });
    } catch (err) {
      clearTimeout(timer);
      throw badRequest(err.name === 'AbortError' ? `The website "${url.hostname}" did not answer in time.` : `The website "${url.hostname}" could not be reached.`);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      clearTimeout(timer);
      url = new URL(res.headers.get('location'), url);
      if (!['http:', 'https:'].includes(url.protocol)) throw badRequest('The website redirects to an address that cannot be analyzed.');
      continue;
    }
    try {
      if (!res.ok) throw badRequest(`The website answered with an error (${res.status}).`);
      const reader = res.body?.getReader?.();
      if (!reader) return { url, text: (await res.text()).slice(0, maxBytes), type: res.headers.get('content-type') || '' };
      const chunks = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > maxBytes) {
          await reader.cancel().catch(() => {});
          break;
        }
        chunks.push(value);
      }
      return { url, text: Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8'), type: res.headers.get('content-type') || '' };
    } finally {
      clearTimeout(timer);
    }
  }
  throw badRequest('The website redirects too many times.');
}

/**
 * The page and its stylesheets (inline <style> blocks + up to MAX_STYLESHEETS linked files, Google
 * Fonts links kept as they are). opts: { fetchImpl, lookup } (tests).
 * @returns {Promise<{ url: string, html: string, css: string, fontLinks: string[] }>}
 */
export async function fetchReference(address, { fetchImpl = fetch, lookup = dns.lookup } = {}) {
  const start = referenceUrl(address);
  const page = await safeGet(start, { maxBytes: MAX_HTML, fetchImpl, lookup, accept: 'text/html,application/xhtml+xml' });
  if (page.type && !/html|xml/i.test(page.type)) throw badRequest('The address is not a web page.');
  const html = page.text;
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  const hrefOf = (tag) => /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.replace(/&amp;/g, '&');
  const fontLinks = links.filter((l) => /fonts\.googleapis\.com|fonts\.bunny\.net/i.test(l)).map(hrefOf).filter(Boolean);
  const sheets = links
    .filter((l) => /rel\s*=\s*["'][^"']*stylesheet/i.test(l) && !/fonts\.googleapis|fonts\.bunny|font-awesome|fontawesome|dashicons|admin-bar/i.test(l))
    .map(hrefOf)
    .filter(Boolean)
    // The design of the site first (theme, Elementor kit and page CSS), libraries last
    .sort((a, b) => Number(/elementor\/css\/post-|uploads|theme|style/i.test(b)) - Number(/elementor\/css\/post-|uploads|theme|style/i.test(a)))
    .slice(0, MAX_STYLESHEETS);
  const inline = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
  let css = inline;
  for (const href of sheets) {
    if (css.length > MAX_CSS) break;
    try {
      const sheet = await safeGet(new URL(href, page.url), { maxBytes: MAX_CSS, fetchImpl, lookup, accept: 'text/css' });
      css += `\n${sheet.text}`;
    } catch {
      /* a stylesheet that cannot be read is skipped */
    }
  }
  return { url: page.url.href, html, css: css.slice(0, MAX_CSS * 2), fontLinks };
}

// ------------------------------------------------------------------------------------- analysis --

const decode = (s) =>
  String(s)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n)));
const plain = (s) => decode(String(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** #abc, #aabbcc, #aabbccdd, rgb(a)(r, g, b[, a]) -> #RRGGBB (null for transparent / other notations). */
export function normalizeColor(value) {
  const v = String(value).trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(v);
  if (m) return `#${m[1].replace(/./g, '$&$&')}`.toUpperCase();
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(v);
  if (m) return m[2] === '00' ? null : `#${m[1]}`.toUpperCase();
  m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(v);
  if (m) {
    if (m[4] !== undefined && parseFloat(m[4]) === 0) return null;
    return `#${[m[1], m[2], m[3]].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
  }
  return null;
}

const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** Grey, white or black (no hue): not a brand color. */
const neutral = (hex) => {
  const [r, g, b] = channels(hex);
  return Math.max(r, g, b) - Math.min(r, g, b) < 18;
};
const lightness = (hex) => {
  const [r, g, b] = channels(hex);
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 510;
};

/** Blocks recognized in the HTML (classes of Elementor widgets, themes and common plugins), in reading order. */
const BLOCKS = [
  ['slider', /swiper|slick|carousel|slider|owl-|flexslider|slideshow|elementor-widget-(image-carousel|media-carousel|slides)/],
  ['video', /elementor-widget-video|youtube\.com\/embed|player\.vimeo|<video/],
  ['counters / key numbers', /elementor-widget-counter|counter|odometer|countup|stat-number|numbers?-/],
  ['reviews / testimonials', /testimonial|review|recensio|trustindex|elementor-widget-reviews|google-reviews/],
  ['FAQ / accordion', /accordion|elementor-widget-toggle|faq/],
  ['contact form', /wpcf7|wpforms|gform|elementor-form|forminator|<form/],
  ['map', /google\.com\/maps|maps\.google|elementor-widget-google_maps/],
  ['photo gallery', /gallery|elementor-widget-image-gallery|elementor-widget-gallery|masonry|lightbox/],
  ['icon boxes / features', /elementor-widget-icon-box|icon-box|feature-box|features?-item|elementor-widget-image-box/],
  ['call to action', /call-to-action|elementor-widget-call-to-action|cta-|-cta\b/],
  ['steps / process / timeline', /timeline|process|steps?-|how-it-works|elementor-widget-progress/],
  ['pricing', /pricing|price-table|price-list/],
  ['team', /team-member|our-team|elementor-widget-team/],
  ['logos of clients / partners', /logo-carousel|clients?-logos?|partners?|brands?-/],
  ['marquee / scrolling text', /marquee|ticker|scrolling-text/],
  ['blog / news', /elementor-widget-posts|blog-|latest-posts|news-/],
];

/**
 * What the HTML and CSS of the reference say about its design (no browser: what can be measured).
 * @returns {{ title, description, language, colors: { globals, top: [{ color, count }] }, fonts: string[],
 *   radius, uppercase, darkPages, menu: string[], outline: string[], images, report: string }}
 */
export function analyzeReference({ url, html, css, fontLinks = [] }) {
  const head = html.slice(0, 200_000);
  const title = plain(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] || '').slice(0, 120);
  const meta = (name) => decode(new RegExp(`<meta[^>]+(?:name|property)\\s*=\\s*["']${name}["'][^>]*content\\s*=\\s*["']([^"']*)`, 'i').exec(head)?.[1] || '').slice(0, 300);
  const description = meta('description') || meta('og:description');
  const language = (/<html[^>]*\blang\s*=\s*["']([a-z]{2})/i.exec(head)?.[1] || '').toLowerCase();
  const allCss = `${css}\n${[...html.matchAll(/\sstyle\s*=\s*"([^"]*)"/gi)].map((m) => m[1]).join(';')}`;

  // Colors: the Elementor global colors when the site has them (the palette chosen by its designer)
  const globals = {};
  for (const m of allCss.matchAll(/--e-global-color-([a-z0-9]+)\s*:\s*([^;}"]+)/gi)) {
    const c = normalizeColor(m[2]);
    if (c && !globals[m[1].toLowerCase()]) globals[m[1].toLowerCase()] = c;
  }
  const counts = new Map();
  for (const m of allCss.matchAll(/(?:color|background(?:-color)?|border(?:-[a-z]+)?|fill|stroke)\s*:\s*[^;}]*?(#[0-9a-f]{3,8}\b|rgba?\([^)]*\))/gi)) {
    const c = normalizeColor(m[1]);
    if (c) counts.set(c, (counts.get(c) || 0) + 1);
  }
  const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([color, count]) => ({ color, count, neutral: neutral(color) }));

  // Fonts: Google Fonts links, then the font families used the most
  const fonts = [];
  for (const link of fontLinks) for (const m of link.matchAll(/family=([^&:]+)/g)) for (const f of decodeURIComponent(m[1]).split('|')) fonts.push(f.replace(/\+/g, ' ').split(':')[0].trim());
  const families = new Map();
  for (const m of allCss.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
    const f = m[1].split(',')[0].replace(/["']/g, '').trim();
    if (f && !/^(var\(|inherit|initial|sans-serif|serif|monospace|-apple|system-ui|eicons|font ?awesome|fa-|dashicons|swiper|slick|star)/i.test(f)) families.set(f, (families.get(f) || 0) + 1);
  }
  for (const [f] of [...families].sort((a, b) => b[1] - a[1]).slice(0, 6)) if (!fonts.some((x) => x.toLowerCase() === f.toLowerCase())) fonts.push(f);
  for (const m of allCss.matchAll(/--e-global-typography-[a-z0-9]+-font-family\s*:\s*["']?([^;"'}]+)/gi)) {
    const f = m[1].trim();
    if (f && !fonts.some((x) => x.toLowerCase() === f.toLowerCase())) fonts.unshift(f);
  }

  // Button corners: radius of the button rules
  const radii = [];
  for (const m of allCss.matchAll(/(?:button|btn|elementor-button|wp-block-button__link|submit)[^{}]*\{[^}]*?border-radius\s*:\s*([\d.]+)(px|%|em|rem)?/gi)) {
    const n = parseFloat(m[1]) * (m[2] === 'em' || m[2] === 'rem' ? 16 : 1);
    radii.push(m[2] === '%' && n >= 20 ? 999 : n);
  }
  radii.sort((a, b) => a - b);
  const radius = radii.length ? radii[Math.floor(radii.length / 2)] : null;
  const uppercase = (allCss.match(/h[1-3][^{}]*\{[^}]*text-transform\s*:\s*uppercase/gi) || []).length + (allCss.match(/--e-global-typography-[a-z0-9]+-text-transform\s*:\s*uppercase/gi) || []).length;
  const bodyBg = normalizeColor(/body\s*\{[^}]*background(?:-color)?\s*:\s*(#[0-9a-f]{3,8}|rgba?\([^)]*\))/i.exec(allCss)?.[1] || '');
  const darkPages = Boolean(bodyBg && lightness(bodyBg) < 0.25);

  // Menu: the links of the first <nav> (or of the header)
  const body = html.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<noscript\b[\s\S]*?<\/noscript>|<svg\b[\s\S]*?<\/svg>/gi, ' ');
  const nav = /<nav\b[\s\S]*?<\/nav>/i.exec(body)?.[0] || /<header\b[\s\S]*?<\/header>/i.exec(body)?.[0] || '';
  const menu = [...new Set([...nav.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => plain(m[1])).filter((t) => t && t.length < 40))].slice(0, 12);
  const headerHtml = /<header\b[\s\S]*?<\/header>/i.exec(body)?.[0] || body.slice(0, 20000);
  const topbar = /href\s*=\s*["'](tel:|mailto:)/i.test(headerHtml.slice(0, Math.max(0, headerHtml.search(/<nav\b/i)) || 0));
  const transparentHeader = /header[^"']*(transparent|absolute|overlay)|elementor-sticky--effects|header-transparent/i.test(headerHtml.slice(0, 3000));

  // Outline of the page in reading order: titles, and the blocks recognized on the way
  const outline = [];
  const push = (item) => {
    if (outline[outline.length - 1] !== item && outline.length < 140) outline.push(item);
  };
  const main = body.slice(Math.max(0, body.search(/<\/header>/i)));
  const tokens = main.matchAll(/<(h[1-4])\b[^>]*>([\s\S]*?)<\/\1>|<(?:section|div|form|iframe|video)\b[^>]*(?:class|id|src)\s*=\s*["']([^"']*)["'][^>]*>|<footer\b/gi);
  for (const m of tokens) {
    if (m[0].toLowerCase().startsWith('<footer')) {
      push('[FOOTER]');
      break;
    }
    if (m[1]) {
      const text = plain(m[2]).slice(0, 90);
      if (text) push(`${m[1].toUpperCase()}: ${text}`);
      continue;
    }
    const cls = `${m[3] || ''} ${m[0].slice(0, 6)}`.toLowerCase();
    if (/elementor-top-section|e-parent\b|elementor-section-full_width|<section/i.test(`${m[0]}`) && /background|bg-|parallax|overlay/.test(cls)) push('[block with a background photo or color]');
    for (const [name, re] of BLOCKS) if (re.test(cls) || re.test(m[0].slice(0, 200).toLowerCase())) push(`[${name}]`);
  }
  const images = (main.match(/<img\b/gi) || []).length;
  const hero = /^[\s\S]{0,6000}/.exec(main)?.[0] || '';
  const heroHints = [
    /swiper|slick|slider|slides|carousel/i.test(hero) && 'a slider',
    /<video|youtube\.com\/embed|background-video|elementor-background-video/i.test(hero) && 'a background video',
    /background-image|elementor-background-overlay|parallax/i.test(hero) && 'a background photo with an overlay',
    /<img\b/i.test(hero) && 'an image beside or below the text',
  ].filter(Boolean);

  const lines = [
    `Address: ${url}`,
    title && `Title: ${title}`,
    description && `Description: ${description}`,
    language && `Language of the page: ${language}`,
    Object.keys(globals).length && `Elementor global colors: ${Object.entries(globals).map(([k, v]) => `${k} ${v}${ELEMENTOR_DEFAULTS[k] === v ? ' (Elementor default: probably not used)' : ''}`).join(', ')}`,
    top.length && `Most used colors in the CSS (count): ${top.map((c) => `${c.color} ×${c.count}${c.neutral ? ' (neutral)' : ''}`).join(', ')}`,
    bodyBg && `Page background: ${bodyBg}${darkPages ? ' (dark pages)' : ''}`,
    fonts.length && `Fonts: ${fonts.slice(0, 6).join(', ')}`,
    radius !== null && `Button corner radius: ${radius >= 99 ? 'pill (fully rounded)' : `${radius}px`}`,
    `Uppercase titles: ${uppercase ? 'yes' : 'no'}`,
    menu.length && `Menu: ${menu.join(' | ')}`,
    `Header: ${[topbar && 'a top bar with phone / email above the menu', transparentHeader && 'transparent or over the first photo'].filter(Boolean).join(', ') || 'a normal bar'}`,
    `First screen (hero): ${heroHints.join(', ') || 'text only'}`,
    `Images on the page: ${images}`,
    `Outline of the page in reading order (titles and recognized blocks):\n${outline.map((o) => `  ${o}`).join('\n') || '  (the page is built by scripts: nothing readable)'}`,
  ].filter(Boolean);
  return { url, title, description, language, colors: { globals, top }, fonts: fonts.slice(0, 6), radius, uppercase: uppercase > 0, darkPages, menu, outline, images, report: lines.join('\n').slice(0, 9000) };
}

/** Colors of a new Elementor kit: a site that still has them did not choose its palette there. */
const ELEMENTOR_DEFAULTS = { primary: '#6EC1E4', secondary: '#54595F', text: '#7A7A7A', accent: '#61CE70' };

/** Colors of the reference kept exactly: the Elementor global primary / secondary / accent / text when the site chose them. */
export function referenceColors(analysis) {
  const g = analysis.colors.globals || {};
  const out = {};
  for (const key of ['primary', 'secondary', 'accent', 'text']) if (g[key] && g[key] !== ELEMENTOR_DEFAULTS[key] && !(key !== 'text' && neutral(g[key]))) out[key] = g[key];
  return Object.keys(out).length ? out : null;
}

// ------------------------------------------------------------------------------------ AI prompt --

/** What every option looks like on the site (for the AI to pick the ones closest to the reference). */
const OPTION_LABELS = {
  header: { classic: 'logo left, menu right, button', centered: 'logo, centered menu, button', topbar: 'top bar with phone / email above logo + menu', bold: 'header on the brand color', transparent: 'transparent over the hero photo', split: 'logo in the middle, menu on both sides' },
  hero: { center: 'centered text over a full-width photo', left: 'left-aligned text over a full-width photo', split: 'text beside a photo on a light page', card: 'text in a card over a photo', bottom: 'big title at the bottom of a photo', editorial: 'big centered title above a wide photo', slideshow: 'centered text over a slideshow of photos', color: 'text on the brand color, photo beside it', bento: 'text tile beside a grid of photos', mesh: 'big centered title on a soft gradient, photos below' },
  about: { 'image-left': 'photo left, text right', 'image-right': 'text left, photo right', wide: 'text above a wide photo', badge: 'photo with a key-figure badge', collage: 'two overlapping photos', triptych: 'text between two photos', stacked: 'title beside the text, wide photo below', sandwich: 'text, photo, key points' },
  features: { icons: 'icon cards on a light background', cards: 'cards over a photo', list: 'list in two columns beside the title', bento: 'one large tile over a photo + small cards', split: 'list beside a large photo', center: 'photo in the middle, strengths around it' },
  cta: { banner: 'banner over a photo', split: 'rounded colored band with a button', phone: 'colored band with a large phone number', 'photo-split': 'photo beside a colored panel', minimal: 'large invitation between two thin lines', card: 'light card over a photo' },
  services: { cards: 'cards with photo', boxed: 'cards on a tinted background', overlay: 'text over the photos', list: 'numbered rows with photo, alternating', compact: 'compact cards with a small photo', framed: 'tall photo with a card over its edge' },
  testimonials: { cards: 'cards', minimal: 'minimal, centered', band: 'on a colored band', quote: 'one big quote + two small', side: 'beside the title, one under the other' },
  homeGallery: { carousel: 'carousel', mosaic: 'one large photo + four small', strip: 'strip across the whole width', masonry: 'columns of staggered photos' },
  contact: { split: 'details beside the form', stacked: 'details above the form', panel: 'details on a colored panel beside the form' },
  footer: { dark: 'dark', light: 'light', brand: 'brand color' },
  footerCta: { none: 'columns only', large: 'opens with a large invitation to get in touch' },
  subheader: { photo: 'page title over a photo', plain: 'page title on a tinted band', split: 'page title beside a photo' },
  stats: { band: 'figures on a colored band', inline: 'large figures under thin lines', cards: 'figures in cards' },
  process: { cards: 'numbered cards', timeline: 'horizontal timeline', vertical: 'vertical timeline beside the title' },
  highlights: { strip: 'centered strip of guarantees', marquee: 'scrolling strip' },
  faq: { accordion: 'accordion', cards: 'answers visible in two columns of cards' },
};

function optionsCatalog() {
  const layout = Object.entries(LAYOUTS)
    .map(([k, values]) => `- layout.${k}: ${values.map((v) => (OPTION_LABELS[k]?.[v] ? `"${v}" (${OPTION_LABELS[k][v]})` : `"${v}"`)).join(', ')}`)
    .join('\n');
  const style = Object.entries(STYLE_OPTIONS)
    .map(([k, values]) => `- style.${k}: ${values.map((v) => `"${v}"`).join(', ')}`)
    .join('\n');
  const sections = [...REQUIRED_SECTIONS, ...OPTIONAL_SECTIONS].map((s) => `"${s}" (${SECTION_NAMES_IT[s]})`).join(', ');
  return `${layout}
${style}
- style.fonts.heading / style.fonts.body: one of ${FONTS.join(', ')} (the closest to the fonts of the reference)
- style.headingWeight: ${WEIGHTS.join(', ')} · style.radius: 0–30 (px, corners of cards and buttons) · style.spacing: ${SPACINGS.join(', ')} · style.uppercase: true / false (uppercase buttons and labels)
- sections: the Home sections after the hero, in order, among ${sections}; ${REQUIRED_SECTIONS.map((s) => `"${s}"`).join(', ')} are always present
- direction: the closest design direction among ${directionList().map((d) => `"${d.id}" (${d.name})`).join(', ')}`;
}

/** Prompt of a template that follows a reference website. */
export function buildReferencePrompt({ category, analysis, language = 'it', instructions = '' }) {
  const none = language === 'it' ? '(nessuna)' : '(none)';
  const vars = { CATEGORIA: category.name, DESCRIZIONE_CATEGORIA: category.description?.trim() || none, ISTRUZIONI_STILE: instructions.trim() || none, LINGUA: languageName(language) };
  const body = TEMPLATE_PROMPT.content.replace(/\{\{\s*([A-Z_]+)\s*\}\}/g, (m, name) => (name in vars ? vars[name] : m));
  const reference = `

=== REFERENCE WEBSITE (the client wants a site like this one) ===
${analysis.report}
=== END OF THE REFERENCE WEBSITE ===

Design the template so that the site looks as close as possible to the reference website: the same colors (use the global colors of the reference exactly when it has them, else its main brand colors from the most used ones; "background" a light tint, "dark" its darkest color), fonts as close as possible, the same corners, the same light or dark pages, a header and a hero like its own, and the Home sections in the order of its outline, each with the layout option closest to the block of the reference (an outline block without a matching section is left out; a required section missing from the reference goes where it fits best).
The sample texts are NEW texts for a business of the category "${category.name}", in the tone of the reference: never copy its sentences, names, figures or contact details.

Choose every design decision yourself among these options (exact ids):
${optionsCatalog()}`;
  const extra = `
- Also put in the JSON object: "direction" (id), "sections" (array of ids in order), "layout" (an object with every layout.* key above) and in "style" every style.* key above, "fonts" ({ "heading", "body" }), "headingWeight", "radius", "spacing" and "uppercase", besides "colors".`;
  return { prompt: body + reference + technicalInstructions(languageName(language)) + extra, system: TEMPLATE_SYSTEM_PROMPT };
}

/**
 * Template that follows a reference website: the analysis + the AI answer, sanitized.
 * @returns {Promise<{ spec, tokens }>}
 */
export async function generateFromReference(provider, { category, analysis, language = 'it', instructions = '' }) {
  const { prompt, system } = buildReferencePrompt({ category, analysis, language, instructions });
  const keep = referenceColors(analysis);
  let note = '';
  let tokens = 0;
  let lastError = null;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    const res = await provider.generate(prompt + note, {
      system,
      json: true,
      temperature: 0.6,
      task: 'template',
      context: { category: category.name, language, instructions, reference: analysis.url, colors: keep },
    });
    tokens += (res.usage?.inputTokens || estimateTokens(prompt)) + (res.usage?.outputTokens || estimateTokens(res.text));
    try {
      if (res.finishReason === 'length') throw new Error('The answer was cut off (max tokens reached). Increase "max tokens" in the provider settings.');
      const parsed = extractJson(res.text);
      if (!parsed.style && !parsed.copy) throw new Error('The JSON does not contain "style" or "copy".');
      const spec = sanitizeSpec(parsed);
      // The global colors of the reference are kept exactly
      if (keep) spec.style.colors = { ...spec.style.colors, ...Object.fromEntries(Object.entries(keep).filter(([k]) => COLOR_KEYS.includes(k))) };
      if (analysis.darkPages) spec.style.theme = 'dark';
      return { spec, tokens };
    } catch (err) {
      lastError = err;
      note = `\n\nIMPORTANT: your previous answer could not be used (${err.message}). Reply with ONLY the JSON object.`;
    }
  }
  throw new AIError('invalid_output', `The AI did not return a usable template after ${RETRIES + 1} attempts: ${lastError?.message}`);
}
