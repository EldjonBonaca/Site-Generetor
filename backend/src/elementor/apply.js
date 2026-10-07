/**
 * Write generated values back into an Elementor document (always a deep clone of
 * the original). Only string values / image objects at known paths are touched:
 * element IDs, styles and every other setting stay exactly as they were.
 */
import { getAtPath, setAtPath, getRoot, EMAIL_IN_TEXT } from './analyze.js';
import { telHref } from '../lib/util.js';

const RESPONSIVE_SUFFIXES = ['_tablet', '_mobile', '_laptop', '_widescreen', '_tablet_extra', '_mobile_extra'];

export const clone = (o) => structuredClone(o);

/** Minimal sanitizer for AI-produced HTML (text-editor widgets). */
export function sanitizeHtml(html) {
  return String(html)
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*\/?>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
}

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const HTML_TAG = /<\/?[a-z][^>]*>/i;

/** Apply text values ({ fieldId: string }) to the document. */
export function applyFieldValues(doc, fields, values) {
  for (const f of fields) {
    const v = values[f.id];
    if (typeof v !== 'string') continue;
    if (f.format === 'link') setAtPath(doc, f.path, v.trim());
    else setAtPath(doc, f.path, f.format === 'html' ? sanitizeHtml(v) : v.replace(/<[^>]+>/g, ''));
  }
}

/**
 * Apply images. `assignment` maps slotId -> { url, alt }.
 * Responsive variants (background_image_mobile, ...) of the same control are updated too.
 */
export function applyImages(doc, slots, assignment) {
  for (const slot of slots) {
    const img = assignment[slot.id];
    if (!img) continue;

    // Gallery widgets: the whole list is replaced (all gallery images) + lightbox on
    if (slot.kind === 'gallery') {
      if (!Array.isArray(img)) continue;
      setAtPath(doc, slot.path, img.map((i) => ({ id: '', url: i.url, alt: i.alt || '' })));
      const settings = getAtPath(doc, slot.path.slice(0, -1));
      if (settings && typeof settings === 'object') {
        if (slot.widget === 'image-gallery') Object.assign(settings, { gallery_link: 'file', open_lightbox: 'yes' });
        else if (slot.widget === 'image-carousel') Object.assign(settings, { link_to: 'file', open_lightbox: 'yes' });
        else Object.assign(settings, { link_to: 'file', open_lightbox: 'yes' });
      }
      continue;
    }

    // Removed image (no demo image may remain): empty value
    if (img.remove) {
      const current = getAtPath(doc, slot.path) || {};
      setAtPath(doc, slot.path, { ...current, url: '', id: '' });
      const parent = getAtPath(doc, slot.path.slice(0, -1));
      for (const suffix of RESPONSIVE_SUFFIXES) {
        if (parent?.[slot.key + suffix]?.url) parent[slot.key + suffix] = { ...parent[slot.key + suffix], url: '', id: '' };
      }
      continue;
    }

    const current = getAtPath(doc, slot.path) || {};
    // id '' => Elementor's importer downloads the image from `url` into the Media Library.
    setAtPath(doc, slot.path, { ...current, url: img.url, id: '', alt: img.alt || '', source: 'library' });

    if (slot.kind !== 'gallery') {
      const parent = getAtPath(doc, slot.path.slice(0, -1));
      for (const suffix of RESPONSIVE_SUFFIXES) {
        const variant = parent?.[slot.key + suffix];
        if (variant && typeof variant === 'object' && variant.url) {
          parent[slot.key + suffix] = { ...variant, url: img.url, id: '', alt: img.alt || '' };
        }
      }
    }
  }
}

/**
 * Replace contact info everywhere in element settings:
 *  - tel:/mailto: links -> project phone/email
 *  - literal replacements [{ from, to }] (demo brand, demo phone, demo address...)
 *  - optionally any leftover email address in text -> project email
 */
export function replaceContacts(doc, { phone, email, replacements = [], replaceAllEmails = true }) {
  const tel = telHref(phone);
  const pairs = replacements
    .filter((r) => r && r.from && r.from.trim() && r.to != null && r.from !== r.to)
    .sort((a, b) => b.from.length - a.from.length); // longest first

  const replaceString = (str, key) => {
    let s = str;
    if (tel) s = s.replace(/tel:[+\d\s().-]+/g, `tel:${tel}`);
    if (email) s = s.replace(/mailto:[^\s"'?<>]+/g, `mailto:${email}`);
    const isHtml = HTML_TAG.test(s);
    for (const { from, to } of pairs) {
      if (s.includes(from)) s = s.split(from).join(isHtml ? escapeHtml(to) : to);
    }
    if (replaceAllEmails && email && key !== 'url' && !/^https?:/i.test(s)) {
      s = s.replace(EMAIL_IN_TEXT, (m) => (m.toLowerCase() === email.toLowerCase() ? m : email));
    }
    return s;
  };

  const visit = (value, key) => {
    if (typeof value === 'string') return replaceString(value, key);
    if (Array.isArray(value)) return value.map((v) => visit(v, key));
    if (value && typeof value === 'object') {
      for (const k of Object.keys(value)) {
        if (k === '__globals__' || k === '__dynamic__') continue;
        value[k] = visit(value[k], k);
      }
    }
    return value;
  };

  const walkElement = (el) => {
    if (!el || typeof el !== 'object') return;
    if (el.settings && typeof el.settings === 'object') visit(el.settings, null);
    (el.elements || []).forEach(walkElement);
  };
  getRoot(doc).elements.forEach(walkElement);
}
