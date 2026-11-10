/**
 * Copied markup with replaceable content (HTML widgets made from a website, kits/from-site.js).
 *
 * The markup of a copied section stays exactly as on the website (its CSS depends on it), but its
 * content must become the client's: so the texts, images and links are taken out of the HTML and
 * kept beside it as "parts", ordinary widget settings the generator already knows how to fill:
 *
 *   settings.html       '<h2 class="t">{{esg:t1}}</h2><img class="p" {{esg:i1}}><a class="b" href="{{esg:l1}}">{{esg:t2}}</a>'
 *   settings.esg_parts  [ { _id: 't1', text: 'Our services' },                      -> a text field (AI)
 *                         { _id: 'i1', image: { url: 'https://…/a.jpg', id: '' } },   -> an image slot
 *                         { _id: 'l1', link: { url: '/services/', is_external: '', nofollow: '' } }, -> a link field
 *                         { _id: 't2', text: 'Read more' } ]
 *
 * compileDocument() puts the parts back into the HTML once they hold the texts and images of the
 * project (export, preview): the result is a plain HTML widget.
 */
import { parse } from 'node-html-parser';

export const PARTS_KEY = 'esg_parts';
const PLACEHOLDER = /\{\{esg:([a-z0-9_]+)\}\}/g;
const mark = (id) => `{{esg:${id}}}`;

/** Never read inside these (code, vector graphics, form controls). */
const SKIP = new Set(['script', 'style', 'svg', 'noscript', 'template', 'select', 'textarea', 'code', 'pre', 'iframe', 'video', 'audio', 'canvas', 'object', 'form', 'math']);
/** Inline tags a text may contain and the AI can rewrite together with it. */
const SIMPLE_INLINE = new Set(['a', 'b', 'strong', 'i', 'em', 'u', 'br', 'small', 'mark', 'sup', 'sub', 'span']);
const HAS_LETTER = /\p{L}/u;
const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

const escapeText = (s) => String(s).replace(/&(?!#?\w+;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s) => String(s).replace(/&(?!#?\w+;)/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const isText = (n) => n.nodeType === 3;
const isElement = (n) => n.nodeType === 1;
const tagOf = (n) => (n.rawTagName || '').toLowerCase();

/**
 * Can this element be rewritten as one text? Only inline tags with words inside (a highlighted word,
 * a link, bold…): a sentence stays one text for the AI, with its tags. Icons (empty inline elements),
 * images and blocks inside make it a container of separate texts instead.
 */
function simpleInline(el) {
  for (const child of el.childNodes) {
    if (!isElement(child)) continue;
    const tag = tagOf(child);
    if (!SIMPLE_INLINE.has(tag)) return false;
    if (tag !== 'br' && !HAS_LETTER.test(child.text)) return false;
    if (!simpleInline(child)) return false;
  }
  return true;
}

/** Longest text handled as one field (longer blocks are split into their parts). */
const MAX_TEXT = 1500;

/** A link worth a field: a page of the site (relative) or a social / external address; not anchors, phones, emails, scripts. */
const linkWorthy = (href) => typeof href === 'string' && href.trim() !== '' && !/^(#|tel:|mailto:|javascript:|data:|sms:|whatsapp:)/i.test(href.trim());

/**
 * Take the texts, images and links out of a piece of HTML.
 * @param {string} html
 * @param {{ prefix?: string }} opts  prefix of the part ids (unique in the document)
 * @returns {{ html: string, parts: object[] }}  parts = [] when there is nothing to replace
 */
export function extractParts(html, { prefix = '' } = {}) {
  const root = parse(String(html), { comment: false });
  const parts = [];
  const textIds = new Map(); // same text twice (slides duplicated by a slider, marquees) -> one part
  let n = 0;
  const add = (kind, data) => {
    // The first letter is the kind of the part: t(ext), i(mage), g (background image), l(ink)
    const id = `${kind}${(++n).toString(36)}${prefix ? `_${prefix}` : ''}`;
    parts.push({ _id: id, ...data });
    return id;
  };
  const textPart = (text) => {
    const key = text.replace(/\s+/g, ' ').trim();
    if (!textIds.has(key)) textIds.set(key, add('t', { text: key }));
    return textIds.get(key);
  };

  const walk = (el) => {
    const tag = tagOf(el);
    if (SKIP.has(tag)) return;
    if (tag === 'img') {
      const src = el.getAttribute('src') || '';
      // The <picture> sources and the srcset would win over the new src
      el.removeAttribute('srcset');
      el.removeAttribute('sizes');
      if (src && !/^data:/i.test(src)) {
        const id = add('i', { image: { url: src, id: '' } });
        el.removeAttribute('src');
        el.removeAttribute('alt');
        // The whole attribute is the placeholder: "src=… alt=…", or a hidden image when the photo is removed
        el.setAttribute(`data-esg-${id}`, '');
      }
      return;
    }
    if (tag === 'source' && el.parentNode && tagOf(el.parentNode) === 'picture') {
      el.remove();
      return;
    }
    const style = el.getAttribute('style');
    if (style && /background(-image)?\s*:[^;]*url\(/i.test(style)) {
      const m = /url\(\s*(['"]?)([^'")]+)\1\s*\)/i.exec(style);
      if (m && !/^data:/i.test(m[2]) && !/\.svg(\?|$)/i.test(m[2])) {
        const id = add('g', { bg_image: { url: m[2].replace(/&amp;/g, '&'), id: '' } });
        el.setAttribute('style', style.replace(m[0], mark(id)));
      }
    }
    if (tag === 'a' && linkWorthy(el.getAttribute('href'))) {
      const id = add('l', { link: { url: el.getAttribute('href').trim(), is_external: el.getAttribute('target') === '_blank' ? 'on' : '', nofollow: '' } });
      el.setAttribute('href', mark(id));
    }
    const direct = el.childNodes.filter((c) => isText(c) && HAS_LETTER.test(c.rawText));
    if (direct.length && simpleInline(el)) {
      const inner = el.innerHTML.trim();
      if (inner.length <= MAX_TEXT && inner.replace(/<[^>]+>/g, '').trim().length >= 2) {
        el.set_content(mark(textPart(inner)));
        return;
      }
    }
    for (const child of [...el.childNodes]) {
      if (isElement(child)) walk(child);
      else if (isText(child) && HAS_LETTER.test(child.rawText) && child.rawText.trim().length >= 2) {
        const raw = child.rawText;
        const lead = /^\s*/.exec(raw)[0];
        const tail = /\s*$/.exec(raw)[0];
        child.rawText = `${lead}${mark(textPart(raw))}${tail}`;
      }
    }
  };
  for (const child of [...root.childNodes]) {
    if (isElement(child)) walk(child);
    else if (isText(child) && HAS_LETTER.test(child.rawText) && child.rawText.trim().length >= 2) child.rawText = mark(textPart(child.rawText));
  }
  if (!parts.length) return { html: String(html), parts: [] };
  // The image placeholders were set as attributes (data-esg-<id>=""): back to the placeholder syntax
  const out = root.toString().replace(/\sdata-esg-([a-z0-9_]+)(="")?/g, (m, id) => ` ${mark(id)}`);
  return { html: out, parts };
}

/** The HTML of a widget with its parts put back (missing or emptied parts leave no broken markup). */
export function compileParts(settings) {
  const parts = Array.isArray(settings?.[PARTS_KEY]) ? settings[PARTS_KEY] : null;
  const html = typeof settings?.html === 'string' ? settings.html : '';
  if (!parts) return html;
  const byId = new Map(parts.filter((p) => p && typeof p === 'object').map((p) => [p._id, p]));
  return html.replace(PLACEHOLDER, (m, id) => {
    const kind = id[0];
    const p = byId.get(id);
    if (p && 'text' in p) {
      const text = String(p.text ?? '');
      // A text with tags was written as HTML (inline tags kept); a plain one is escaped
      return /<\/?[a-z][^>]*>/i.test(text) ? text : escapeText(text);
    }
    if (p && p.image) return p.image.url ? `src="${escapeAttr(p.image.url)}" alt="${escapeAttr(p.image.alt || '')}"` : `src="${TRANSPARENT_PIXEL}" alt="" hidden`;
    if (p && p.bg_image) return p.bg_image.url ? `url('${String(p.bg_image.url).replace(/'/g, '%27')}')` : 'none';
    if (p && p.link) return escapeAttr(p.link.url || '#');
    // The part was removed (e.g. the link to a social network the business does not have)
    if (kind === 'i') return `src="${TRANSPARENT_PIXEL}" alt="" hidden`;
    if (kind === 'g') return 'none';
    return kind === 'l' ? '#' : '';
  });
}

/** Is this an HTML widget with parts? */
export const hasParts = (el) => el?.elType === 'widget' && el.widgetType === 'html' && Array.isArray(el.settings?.[PARTS_KEY]);

/** Every HTML widget with parts of a document becomes a plain HTML widget (in place). Returns the document. */
export function compileDocument(doc) {
  const visit = (el) => {
    if (!el || typeof el !== 'object') return;
    if (hasParts(el)) {
      el.settings.html = compileParts(el.settings);
      delete el.settings[PARTS_KEY];
    }
    (el.elements || []).forEach(visit);
  };
  (Array.isArray(doc) ? doc : doc?.content || []).forEach(visit);
  return doc;
}
