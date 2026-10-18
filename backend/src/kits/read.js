/**
 * Reading an uploaded Elementor Template Kit (already extracted).
 *
 * Supported zip layouts:
 *  1. "template-kit" (Envato / Elementor Template Kit)
 *       manifest.json -> { title, templates: [ { name, source: "templates/home.json", type, screenshot, metadata } ],
 *                          required_plugins: [ { name, file } ] }
 *  2. "website-kit" (Elementor > Tools > Export Kit)
 *       manifest.json -> { title, templates: { "<id>": { title, doc_type } }, content: { page: { "<id>": { title, show_on_front } } },
 *                          plugins: [ { name, plugin } ] }
 *       files: templates/<id>.json, content/<post type>/<id>.json, site-settings.json (global colors and fonts)
 *  3. "loose": any JSON file with an Elementor `content` array.
 * The "Global Kit Styles" template (colors, fonts, buttons of the kit) is not a page: its settings
 * become the global styles of the site.
 */
import fs from 'node:fs';
import path from 'node:path';
import { analyzeDocument, getRoot } from '../elementor/analyze.js';

const rel = (from, to) => path.relative(from, to).replace(/\\/g, '/');

export function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  } catch {
    return null;
  }
}

function listFiles(dir, base = dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) out.push(...listFiles(full, base));
    else out.push(rel(base, full));
  }
  return out;
}

/** The shallowest manifest.json (kits are often zipped inside a folder, or inside an inner zip). */
function findManifest(dir) {
  return (
    listFiles(dir)
      .filter((f) => /(^|\/)manifest\.json$/i.test(f))
      .sort((a, b) => a.split('/').length - b.split('/').length)[0] || null
  );
}

export function detectFormat(manifest) {
  if (!manifest) return 'loose';
  if (Array.isArray(manifest.templates)) return 'template-kit';
  if ((manifest.templates && typeof manifest.templates === 'object') || manifest.content) return 'website-kit';
  return 'loose';
}

/** Widgets that need Elementor Pro (they render nothing on a site without Pro). */
export const PRO_WIDGETS = new Set([
  'form', 'posts', 'portfolio', 'slides', 'testimonial-carousel', 'reviews', 'media-carousel', 'flip-box', 'call-to-action',
  'price-table', 'price-list', 'animated-headline', 'nav-menu', 'mega-menu', 'countdown', 'share-buttons', 'blockquote',
  'theme-site-logo', 'theme-site-title', 'theme-post-title', 'theme-post-content', 'theme-post-featured-image', 'theme-post-excerpt',
  'theme-archive-title', 'post-info', 'post-navigation', 'post-comments', 'author-box', 'loop-grid', 'loop-carousel', 'table-of-contents',
  'login', 'sitemap', 'search-form', 'gallery', 'hotspot', 'paypal-button', 'code-highlight', 'lottie', 'video-playlist', 'progress-tracker',
  'facebook-page', 'facebook-comments', 'archive-posts',
]);

/** Settings of the kit that are global styles (colors, fonts, buttons, forms…) but never content. */
const NOT_STYLES = /^(site_name|site_description|site_logo|site_favicon|custom_css|page_title_selector|activeItemIndex|hide_title|template|post_status|post_title|post_excerpt|post_featured_image|lightbox_.*|viewport_.*)$/;

/** Global styles of the kit without any image (background images, logo): they are demo content. */
export function cleanGlobalStyles(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return null;
  const out = {};
  for (const [k, v] of Object.entries(settings)) {
    if (NOT_STYLES.test(k)) continue;
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.url === 'string' && 'id' in v) continue; // image
    if (/background_image|_image$/.test(k)) continue;
    out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

/** Is this document the "Global Kit Styles" of the kit (no content, only site settings)? */
function isGlobalStylesDoc(doc, entry) {
  const ps = doc?.page_settings;
  const hasStyles = ps && typeof ps === 'object' && ('system_colors' in ps || 'custom_colors' in ps || 'system_typography' in ps);
  const looksGlobal = /global|kit[\s_-]?styles?|style[\s_-]?guide|site[\s_-]?settings/i.test(`${entry.title} ${entry.type}`);
  return Boolean(hasStyles && (looksGlobal || !getRoot(doc).elements.length));
}

/** Guess which site role a template plays from its title/type (the AI analysis refines it, the user can change it). */
export function guessRole(t) {
  const s = `${t.title} ${t.type} ${t.id}`.toLowerCase();
  if (/global|kit[\s_-]?settings|site[\s_-]?settings|style ?guide|global-styles/.test(s)) return 'ignore';
  if (/header/.test(s)) return 'header';
  if (/footer/.test(s)) return 'footer';
  if (/single[\s_-]?(post|blog|article|news)|post[\s_-]?(single|template|detail)|blog[\s_-]?(single|detail|post)|articolo/.test(s)) return 'single_post';
  if (/popup|404|archive|search|product|shop|cart|checkout|coming|maintenance|login|account|thank/.test(s)) return 'ignore';
  if (t.showOnFront || /\bhome|front[\s_-]?page|landing|^index/.test(s)) return 'home';
  if (/galler|portfolio|projects?\b|works?\b|lavori/.test(s)) return 'gallery';
  if (/services|servizi\b|what[\s_-]?we[\s_-]?do|solutions/.test(s)) return 'services';
  if (/service|servizio/.test(s)) return 'ignore'; // services are articles: no page per service
  if (/about|chi[\s_-]?siamo|company|who[\s_-]?we/.test(s)) return 'about';
  if (/contact|contatt/.test(s)) return 'contact';
  return 'ignore';
}

/** At most one template per role (the first one wins). */
export function dedupeRoles(templates, key = 'suggestedRole') {
  const seen = new Set();
  for (const t of templates) {
    if (t[key] === 'ignore') continue;
    if (seen.has(t[key])) t[key] = 'ignore';
    else seen.add(t[key]);
  }
}

const pluginSlug = (file) => String(file || '').replace(/\\/g, '/').split('/')[0].trim();

/** Plugins the kit needs (wordpress.org slug + name), Elementor itself excluded. */
function requiredPlugins(manifest) {
  const list = Array.isArray(manifest?.required_plugins) ? manifest.required_plugins : Array.isArray(manifest?.plugins) ? manifest.plugins : [];
  const out = [];
  for (const p of list) {
    const file = String(p?.file || p?.plugin || '').replace(/\\/g, '/');
    const slug = pluginSlug(file);
    if (!slug || !/^[a-z0-9-]+$/i.test(slug) || out.some((x) => x.slug === slug)) continue;
    const name = String(p?.name || slug).slice(0, 120);
    out.push({ slug, name, file: file.includes('/') ? (file.endsWith('.php') ? file : `${file}.php`) : `${slug}/${slug}.php`, pro: /elementor-pro|-pro$|\bpro\b/i.test(`${slug} ${name}`) });
  }
  return out;
}

/** One line of text for the outline (no HTML, collapsed spaces, cut). */
const short = (s, n = 90) => {
  const t = String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/** Widget types used inside an element, in order of appearance (no duplicates). */
function widgetTypes(el) {
  const out = [];
  const walk = (e) => {
    if (!e || typeof e !== 'object') return;
    if (e.elType === 'widget' && e.widgetType && !out.includes(e.widgetType)) out.push(e.widgetType);
    (e.elements || []).forEach(walk);
  };
  walk(el);
  return out;
}

/**
 * Structure of a template, section by section (what the AI analysis is based on):
 * [{ index, widgets: string[], texts: string[], images: number, fields: number }]
 */
export function outlineDocument(doc) {
  const analysis = analyzeDocument(doc, { prefix: 'x', htmlText: true, numbers: true });
  return getRoot(doc).elements.map((el, index) => {
    const fields = analysis.fields.filter((f) => f.section === index && f.format !== 'link');
    return {
      index,
      widgets: widgetTypes(el),
      texts: fields.map((f) => short(f.original)).filter(Boolean).slice(0, 8),
      images: analysis.slots.filter((s) => s.section === index).length,
      fields: fields.length,
    };
  });
}

/**
 * Read an extracted kit folder.
 * @returns {{ format, title, templates: KitTemplate[], globalStyles: object|null, requiredPlugins, proWidgets: string[] }}
 * KitTemplate = { id (path relative to the extracted dir), title, type, screenshot, valid, sections, fields, images,
 *                 widgets, proWidgets, suggestedRole }
 */
export function readKit(extractedDir) {
  const manifestRel = findManifest(extractedDir);
  const rootDir = manifestRel ? path.join(extractedDir, path.dirname(manifestRel)) : extractedDir;
  const manifest = manifestRel ? readJson(path.join(extractedDir, manifestRel)) : null;
  const format = detectFormat(manifest);
  const entries = [];
  const push = (file, info) => fs.existsSync(file) && entries.push({ file, ...info });

  if (format === 'template-kit') {
    manifest.templates.forEach((t) => {
      if (!t?.source) return;
      push(path.join(rootDir, t.source), {
        title: t.name || t.title || path.basename(t.source, '.json'),
        type: t.metadata?.template_type || t.type || 'page',
        screenshot: t.screenshot ? path.join(rootDir, t.screenshot) : null,
      });
    });
  } else if (format === 'website-kit') {
    for (const [id, t] of Object.entries(manifest.templates || {})) {
      push(path.join(rootDir, 'templates', `${id}.json`), { title: t.title || `Template ${id}`, type: t.doc_type || 'section', screenshot: null });
    }
    for (const [postType, items] of Object.entries(manifest.content || {})) {
      for (const [id, c] of Object.entries(items || {})) {
        push(path.join(rootDir, 'content', postType, `${id}.json`), { title: c.title || `${postType} ${id}`, type: c.doc_type || postType, showOnFront: Boolean(c.show_on_front), screenshot: null });
      }
    }
  }
  if (!entries.length) {
    for (const f of listFiles(rootDir).filter((x) => x.toLowerCase().endsWith('.json') && !/manifest\.json$/i.test(x))) {
      const doc = readJson(path.join(rootDir, f));
      if (doc && (Array.isArray(doc.content) || (Array.isArray(doc) && doc[0]?.elType))) {
        push(path.join(rootDir, f), { title: doc.title || path.basename(f, '.json'), type: doc.type || 'page', screenshot: null });
      }
    }
  }

  let globalStyles = null;
  // Elementor website kits keep the global styles in site-settings.json
  const siteSettings = readJson(path.join(rootDir, 'site-settings.json'));
  if (siteSettings) globalStyles = cleanGlobalStyles(siteSettings.settings || siteSettings);

  const proWidgets = new Set();
  const templates = [];
  for (const e of entries) {
    const doc = readJson(e.file);
    if (doc && isGlobalStylesDoc(doc, e)) {
      globalStyles ||= cleanGlobalStyles(doc.page_settings);
      continue;
    }
    const valid = Boolean(doc) && getRoot(doc).elements.length > 0;
    const analysis = valid ? analyzeDocument(doc, { prefix: 'x', htmlText: true, numbers: true }) : { fields: [], slots: [], widgets: {} };
    const pro = Object.keys(analysis.widgets).filter((w) => PRO_WIDGETS.has(w));
    pro.forEach((w) => proWidgets.add(w));
    const t = {
      id: rel(extractedDir, e.file),
      title: String(e.title).slice(0, 200),
      type: String(e.type || 'page'),
      showOnFront: e.showOnFront || false,
      screenshot: e.screenshot && /\.(jpe?g|png|webp|gif)$/i.test(e.screenshot) && fs.existsSync(e.screenshot) ? rel(extractedDir, e.screenshot) : null,
      valid,
      sections: valid ? getRoot(doc).elements.length : 0,
      fields: analysis.fields.length,
      images: analysis.slots.length,
      widgets: analysis.widgets,
      proWidgets: pro,
    };
    t.suggestedRole = valid ? guessRole(t) : 'ignore';
    templates.push(t);
  }
  dedupeRoles(templates);

  return {
    format: entries.length && format === 'loose' ? 'loose' : format,
    title: manifest?.title || manifest?.name || null,
    templates,
    globalStyles,
    requiredPlugins: requiredPlugins(manifest),
    proRequired: Boolean(manifest?.templates?.some?.((t) => t?.metadata?.elementor_pro_required)) || proWidgets.size > 0,
    proWidgets: [...proWidgets].sort(),
  };
}

/** Load one template document of an extracted kit (the path must stay inside the kit). */
export function loadKitTemplate(extractedDir, templateId) {
  const root = path.resolve(extractedDir);
  const file = path.resolve(root, templateId);
  if (!file.startsWith(root + path.sep)) throw new Error('Invalid template path');
  return readJson(file);
}
