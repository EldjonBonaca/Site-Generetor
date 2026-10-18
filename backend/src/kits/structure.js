/**
 * Structure check of a page built from a Template Kit: the final document must have exactly the
 * elements of the kit template (same ids, types, nesting and order) and the same settings (layout,
 * colors, fonts, spacing, animations, plugins' widgets), apart from what the generator is meant to
 * change: texts, images, links, menus, the map address and the contact form.
 */
import { analyzeDocument, getRoot, getAtPath } from '../elementor/analyze.js';

/** Settings the generator sets on purpose (menu of the site, map, form, gallery lightbox, contacts, CSS without demo images). */
const ALLOWED_KEYS = /menu|^address$|^html$|^shortcode$|email|(^|_)link$|^gallery_link$|^open_lightbox$|^link_to$|^__dynamic__$|^custom_css$/;

const isImageObject = (v) => v && typeof v === 'object' && !Array.isArray(v) && typeof v.url === 'string' && !('is_external' in v) && !('nofollow' in v);
const isImageList = (v) => Array.isArray(v) && v.length > 0 && v.every((it) => isImageObject(it) && !('_id' in it));

/** Images and link URLs masked: they are replaced on purpose. */
function maskValue(v) {
  if (isImageList(v)) return '§images';
  if (Array.isArray(v)) return v.map(maskValue);
  if (isImageObject(v)) return '§image';
  if (v && typeof v === 'object') {
    const isLink = typeof v.url === 'string';
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, isLink && k === 'url' ? '§link' : maskValue(x)]));
  }
  return v;
}

/** Copy of the document with the texts (fields of the kit template) masked. */
function maskTexts(doc, fieldPaths) {
  const copy = structuredClone(doc);
  for (const p of fieldPaths) {
    const parent = getAtPath(copy, p.slice(0, -1));
    if (parent && typeof parent === 'object' && p[p.length - 1] in parent) parent[p[p.length - 1]] = '§text';
  }
  return copy;
}

function index(doc) {
  const map = new Map();
  const walk = (list, parentKey, section) => {
    (list || []).forEach((el, i) => {
      if (!el || typeof el !== 'object') return;
      const key = el.id || `${parentKey}/${i}`;
      const sec = section ?? i;
      map.set(key, { el, parent: parentKey, section: sec, children: (el.elements || []).map((c, j) => c?.id || `${key}/${j}`) });
      walk(el.elements, key, sec);
    });
  };
  walk(getRoot(doc).elements, 'root', null);
  return map;
}

/** "heading #a1b2c3 [3]": widget or element type, id and number of its top-level section. */
const label = (e) => `${e.el.widgetType || e.el.elType} #${e.el.id || '?'} [${e.section + 1}]`;
const typeOf = (el) => (el.elType === 'widget' ? el.widgetType : el.elType);
/** The form of the kit replaced by the site form (its form is not in the kit). */
const isFormSwap = (before, after) => after.widgetType === 'shortcode' && before.widgetType !== 'shortcode' && /form/i.test(before.widgetType || 'html') && /contact-form-7/.test(after.settings?.shortcode || '');

/**
 * @param {object} kitDoc    the kit template (or the page composed from its sections), before the generator touched it
 * @param {object} finalDoc  the exported document of the page
 * @returns {{ ok, elements, removed: string[], added: string[], changed: string[], moved: string[], settings: string[], formSwaps: string[] }}
 */
export function compareStructure(kitDoc, finalDoc) {
  const fieldPaths = analyzeDocument(kitDoc, { htmlText: true, numbers: true }).fields.map((f) => f.path);
  const before = index(maskTexts(kitDoc, fieldPaths));
  const after = index(maskTexts(finalDoc, fieldPaths));
  const report = { elements: before.size, removed: [], added: [], changed: [], moved: [], settings: [], formSwaps: [] };

  for (const [key, b] of before) {
    const a = after.get(key);
    if (!a) {
      report.removed.push(label(b));
      continue;
    }
    if (a.parent !== b.parent) report.moved.push(label(b));
    else if (a.children.join() !== b.children.join() && a.children.length === b.children.length) report.moved.push(`${label(b)} ↕`);
    if (typeOf(a.el) !== typeOf(b.el)) {
      if (isFormSwap(b.el, a.el)) report.formSwaps.push(label(b));
      else report.changed.push(`${label(b)} → ${typeOf(a.el)}`);
      continue;
    }
    const bs = b.el.settings && typeof b.el.settings === 'object' ? b.el.settings : {};
    const as = a.el.settings && typeof a.el.settings === 'object' ? a.el.settings : {};
    const keys = new Set([...Object.keys(bs), ...Object.keys(as)]);
    // A dynamic image of the demo (featured image…) becomes a project image: expected
    const dynamic = bs.__dynamic__ && typeof bs.__dynamic__ === 'object' ? bs.__dynamic__ : {};
    const diff = [...keys].filter((k) => !ALLOWED_KEYS.test(k) && !(k in dynamic) && JSON.stringify(maskValue(bs[k])) !== JSON.stringify(maskValue(as[k])));
    if (diff.length) report.settings.push(`${label(b)}: ${diff.slice(0, 6).join(', ')}${diff.length > 6 ? '…' : ''}`);
  }
  for (const [key, a] of after) if (!before.has(key)) report.added.push(label(a));

  report.ok = !report.removed.length && !report.added.length && !report.changed.length && !report.moved.length && !report.settings.length;
  return report;
}
