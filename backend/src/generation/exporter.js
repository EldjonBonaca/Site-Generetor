/**
 * Export: builds output-<site>.zip with
 *   <site>-site.zip (WordPress plugin that creates the site on activation) · templates/*.json · wordpress-import.xml · images/ · content.md · seo.csv
 *   · menu.md · INSTRUCTIONS.md (ISTRUZIONI.md in Italian) · CHECKS.md (CONTROLLI.md)
 * Everything is rebuilt from the project template + stored values, so exports are repeatable.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { get, run, parseJson } from '../db/index.js';
import { config } from '../config.js';
import { AdmZip, addFolderToZip } from '../lib/zip.js';
import { badRequest, slugify, stripHtml } from '../lib/util.js';
import { exportNames, galleryPool } from '../lib/images.js';
import { loadContext, analyzePage, builtSite, siteLinks, fallbackLink, servicesCategory, oneLine, pageTitle, pageSlug, hasDesign, TEMPLATE_ROLES, SITE_PAGE_ROLES, DEFAULT_CROP_SIZES } from './plan.js';
import { applyFieldValues, applyImages, replaceContacts, sanitizeHtml } from '../elementor/apply.js';
import { EMAIL_IN_TEXT } from '../elementor/analyze.js';
import { normalizeUrl } from '../ai/json.js';
import { languageName } from './prompt-builder.js';
import { buildWxr } from './wxr.js';
import { buildPlugin, PLUGIN_IMAGE_SCHEME } from './wp-plugin.js';
import { docsText } from './export-docs.js';
import { fieldValue } from './runner.js';
import { BUILDER_VERSION, articleDoc, highlightTitles } from '../templates/builder.js';
import { measureDemoImages, loadDemoImages, demoImagePath } from '../kits/demo-images.js';
import { compareStructure } from '../kits/structure.js';
import { kitLayoutSignatures } from '../kits/site.js';

const PLACEHOLDER_BASE_URL = 'https://example.com/wp-content/uploads/';
const TEMPLATE_TYPES = new Set(['page', 'section', 'header', 'footer', 'single', 'single-page', 'single-post', 'archive', 'popup', 'error-404', 'loop-item', 'container']);

export function normalizeBaseUrl(url) {
  const u = String(url || '').trim();
  if (!u) return PLACEHOLDER_BASE_URL;
  return u.endsWith('/') ? u : `${u}/`;
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

const encode = (pipeline, ext, quality) => {
  const q = Number(quality) || 82;
  if (ext === '.webp') return pipeline.webp({ quality: q });
  if (ext === '.png') return pipeline.png({ compressionLevel: 9 });
  return pipeline.jpeg({ quality: q, mozjpeg: true });
};

/**
 * Optimise + rename images into `destDir`.
 * Returns Map(imageId -> { name, url, alt }); exportCrops() adds the cropped versions to the
 * same map under the key "<imageId>:hero" / "<imageId>:subheader".
 */
async function exportImages(ctx, destDir) {
  const { images, settings, project } = ctx;
  const opts = settings.image;
  const baseUrl = normalizeBaseUrl(project.image_base_url);
  const names = exportNames(images, opts);
  const result = new Map();
  fs.mkdirSync(destDir, { recursive: true });

  for (const img of images) {
    const src = path.join(config.storageDir, img.file_path);
    if (!fs.existsSync(src)) continue;
    const name = names.get(img.id);
    const ext = path.extname(name);
    const dest = path.join(destDir, name);
    if (img.mime === 'image/svg+xml') {
      fs.copyFileSync(src, dest);
    } else {
      let pipeline = sharp(src, { failOn: 'none' }).rotate();
      if (opts.maxWidth) pipeline = pipeline.resize({ width: Number(opts.maxWidth), withoutEnlargement: true });
      await encode(pipeline, ext, opts.quality).toFile(dest);
    }
    result.set(img.id, { name, url: baseUrl + name, alt: img.alt_text || '' });
  }
  return result;
}

const cropKey = (imageId, kind) => `${imageId}:${kind}`;
/** Template Kit slots: crop kind "<width>x<height>" = size of the demo photo the image replaces. */
const slotCrop = (slot) => (slot.crop ? `${slot.crop.width}x${slot.crop.height}` : null);
const kitGraphicKey = (url) => `kit:${url}`;

/** Largest crop with the proportions of the demo photo that fits in the image (never enlarged), at most the demo size. */
async function demoCropSize(file, kind) {
  const [w, h] = kind.split('x').map(Number);
  const meta = await sharp(file, { failOn: 'none' }).metadata();
  const [sw, sh] = (meta.orientation || 1) >= 5 ? [meta.height, meta.width] : [meta.width, meta.height];
  const width = Math.max(1, Math.min(w, sw, Math.floor((sh * w) / h)));
  return { width, height: Math.max(1, Math.min(sh, Math.round((width * h) / w))) };
}

/** Exact pixel size of the Home hero / page subheader / carousel images (settings.image.hero / .subheader / .carousel). */
export function cropSize(settings, kind) {
  const fallback = DEFAULT_CROP_SIZES[kind];
  const size = settings.image?.[kind] || {};
  const clamp = (v, min, max, def) => Math.min(max, Math.max(min, Math.round(Number(v)) || def));
  return { width: clamp(size.width, 320, 3840, fallback.width), height: clamp(size.height, 120, 2160, fallback.height) };
}

/**
 * The images placed in a Home hero or subheader slot are cropped to that exact size (e.g.
 * 1920×1080 / 1920×600), keeping the most interesting part of the photo. The crops are extra
 * files (<name>-hero.webp, <name>-subheader.webp): the gallery and the other sections keep the full photo.
 */
async function exportCrops(ctx, pages, exported, destDir) {
  const needed = new Set();
  for (const page of pages.filter((p) => p.templateId)) {
    const { slots, slotRoles } = analyzePage(ctx, page);
    imageAssignment(ctx, page, slots, slotRoles, exported, needed);
  }
  for (const key of needed) {
    const [id, kind] = key.split(':');
    const img = ctx.images.find((i) => i.id === Number(id));
    if (!img || img.mime === 'image/svg+xml') continue;
    const src = path.join(config.storageDir, img.file_path);
    const { width, height } = /^\d+x\d+$/.test(kind) ? await demoCropSize(src, kind) : cropSize(ctx.settings, kind);
    const base = exported.get(img.id);
    const ext = path.extname(base.name);
    const name = `${path.basename(base.name, ext)}-${kind}${ext}`;
    const pipeline = sharp(src, { failOn: 'none' })
      .rotate()
      .resize({ width, height, fit: 'cover', position: sharp.strategy.attention });
    await encode(pipeline, ext, ctx.settings.image.quality).toFile(path.join(destDir, name));
    exported.set(key, { name, url: normalizeBaseUrl(ctx.project.image_base_url) + name, alt: base.alt });
  }
}

/**
 * Template Kit: the graphics of the design that stay (ornaments, shapes, client logos) are bundled
 * with the site (kit-<name>.png), from the copies downloaded when the demo images were measured.
 * A graphic that could not be downloaded keeps its demo URL (reported in the checks).
 */
function exportKitGraphics(ctx, pages, exported, destDir) {
  if (!ctx.kit) return;
  const used = new Set([...exported.values()].map((e) => e.name));
  for (const page of pages.filter((p) => p.templateId)) {
    const { slots, slotRoles } = analyzePage(ctx, page);
    for (const slot of slots.filter((s) => slotRoles[s.id] === 'keep')) {
      for (const url of slot.urls || []) {
        const file = demoImagePath(ctx.kit.dir, ctx.kit.demoImages?.[url]);
        if (!file || exported.has(kitGraphicKey(url))) continue;
        const ext = path.extname(file);
        const base = `kit-${slugify(path.parse(url.split(/[?#]/)[0]).name) || 'graphic'}`;
        let name = `${base}${ext}`;
        for (let n = 2; used.has(name); n++) name = `${base}-${n}${ext}`;
        used.add(name);
        fs.copyFileSync(file, path.join(destDir, name));
        exported.set(kitGraphicKey(url), { name, url: normalizeBaseUrl(ctx.project.image_base_url) + name, alt: '' });
      }
    }
  }
}

/**
 * Decide which exported image goes into each slot of a page. No template placeholder may remain:
 *  - hero / subheader / logo: the image with that role; service cards: the image of their service;
 *  - photo: the photos of the shared archive, round-robin from a different starting photo on each
 *    page, so neighbouring sections do not repeat the same photo;
 *  - gallery widgets: every photo.
 * Slots whose image is missing get a photo of the archive; without any photo they are emptied.
 * Hero / subheader slots use the cropped version of their image (keys collected in `neededCrops`).
 * Template Kit: the other photos are cropped to the size of the demo photo they replace (slot.crop),
 * and the graphics of the design (role 'keep') get their bundled copy.
 */
export function imageAssignment(ctx, page, slots, slotRoles, exported, neededCrops = null) {
  const ex = (i, crop = null) => {
    if (crop) {
      neededCrops?.add(cropKey(i.id, crop));
      if (exported.has(cropKey(i.id, crop))) return exported.get(cropKey(i.id, crop));
    }
    return exported.get(i.id) || null;
  };
  const pick = (pred) => ctx.images.find((i) => pred(i) && exported.has(i.id));
  const pool = galleryPool(ctx.images).filter((i) => exported.has(i.id));
  let g = [...page.key].reduce((n, c) => n + c.charCodeAt(0), 0);
  const nextFill = () => (pool.length ? pool[g++ % pool.length] : null);

  const subheader = () => {
    if (ctx.settings.subheaderPerPage) {
      const specific = pick((i) => i.role === 'subheader' && (i.target_page === page.key || i.target_page === page.role));
      if (specific) return specific;
    }
    return pick((i) => i.role === 'subheader' && !i.target_page) || pick((i) => i.role === 'subheader');
  };
  const serviceImg = (index) => {
    const svc = ctx.services[index];
    return svc ? pick((i) => i.role === 'service' && i.service_id === svc.id) : null;
  };

  const assignment = {};
  for (const slot of slots) {
    const role = slotRoles[slot.id] || 'photo';
    if (slot.kind === 'gallery') {
      if (role === 'slideshow') {
        // Hero slideshow: the hero image, then up to 3 other photos, all cropped like the hero
        const first = pick((i) => i.role === 'hero_home');
        const list = [first, ...pool.filter((i) => i.id !== first?.id)].filter(Boolean).slice(0, 4);
        assignment[slot.id] = list.map((i) => ex(i, 'hero')).filter(Boolean);
        continue;
      }
      if (role === 'keep') {
        const kept = (slot.urls || []).map((u) => exported.get(kitGraphicKey(u)));
        if (kept.length && kept.every(Boolean)) assignment[slot.id] = kept;
        continue;
      }
      // Gallery page: the full photos; Home carousel: the photos cropped to the same size
      assignment[slot.id] = pool.map((i) => ex(i, role === 'carousel' ? 'carousel' : slotCrop(slot)));
      continue;
    }
    // Graphics of the kit design: the bundled copy (without it the demo image stays)
    if (role === 'keep') {
      const kept = exported.get(kitGraphicKey(slot.urls?.[0] || slot.url));
      if (kept) assignment[slot.id] = kept;
      continue;
    }
    // Photos of demo people (Template Kit testimonials, team): removed, never replaced by an unrelated photo
    if (role === 'remove') {
      assignment[slot.id] = { remove: true };
      continue;
    }
    let img = null;
    if (role === 'hero') img = pick((i) => i.role === 'hero_home');
    else if (role === 'subheader') img = subheader();
    else if (role === 'service_list') img = serviceImg(slot.service);
    else if (role === 'logo') img = pick((i) => i.role === 'logo');
    if (!img && role !== 'logo') img = nextFill();
    assignment[slot.id] = img ? ex(img, role === 'hero' || role === 'subheader' ? role : role === 'logo' ? null : slotCrop(slot)) : { remove: true };
  }
  return assignment;
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

/**
 * Build the final Elementor document of every template page (articles have no template).
 * `allPages` (every page of the generation) resolves the texts shared between pages.
 */
function buildPageDocs(ctx, pages, exported, links, allPages = pages) {
  return pages
    .filter((p) => p.templateId)
    .map((page) => {
      const { doc, fields, slots, slotRoles } = analyzePage(ctx, page);
      const stored = new Map(page.fields.map((f) => [f.id, f]));
      const values = {};
      let missing = 0; // fields of the page that the generation does not have (made with older kit pages)
      for (const f of fields) {
        const s = stored.get(f.id);
        const value = s ? fieldValue(allPages, s) : null;
        if (typeof value === 'string') values[f.id] = value;
        else if (f.format === 'link' && !f.fixed) values[f.id] = fallbackLink(`${f.original} ${s?.hint || ''}`, links);
        // Template Kit: a text the AI did not write is emptied, so no demo text stays on the site (reported in the checks)
        else if (ctx.kit && !f.fixed && f.format !== 'number') {
          values[f.id] = '';
          if (!s) missing++;
        }
      }
      applyFieldValues(doc, fields, values);
      // Highlight style of the titles: their last word wrapped now that the texts are written (no script on the site)
      highlightTitles(doc);
      applyImages(doc, slots, imageAssignment(ctx, page, slots, slotRoles, exported));
      // Safety net for AI-written texts: tel:/mailto: links and stray emails become the site's ones
      replaceContacts(doc, { phone: ctx.project.phone, email: ctx.project.email });
      doc.title = page.title;
      return { page, doc, missing };
    });
}

/** Standalone importable template (Elementor > Templates > Import). */
function toImportable(doc, page) {
  let type = doc.type || 'page';
  if (page.role === 'header' || page.role === 'footer') type = page.role;
  if (page.role === 'single_post') type = 'single-post';
  if (!TEMPLATE_TYPES.has(type)) type = 'page';
  return { version: doc.version || '0.4', title: page.title, type, content: doc.content, page_settings: doc.page_settings || {} };
}

// ---------------------------------------------------------------------------
// Articles (services as posts)
// ---------------------------------------------------------------------------

function buildPosts(ctx, pages, exported) {
  return pages
    .filter((p) => p.role === 'post')
    .map((p) => {
      const svc = ctx.services.find((s) => s.id === p.serviceId);
      const img = ctx.images.find((i) => i.role === 'service' && i.service_id === p.serviceId);
      const field = (id) => p.fields.find((f) => f.id === id)?.value || '';
      return {
        title: svc?.name || p.title,
        slug: svc?.slug || p.seo.slug,
        content: field('post.content'),
        excerpt: field('post.excerpt'),
        image: img && exported.get(img.id),
        page: p,
      };
    });
}

/**
 * Elementor document of a service article: the design of the single post template with the
 * article's featured image, title, content and the other services (works without Elementor Pro).
 */
function postDoc(single, post, imageUrl) {
  if (!single) return null;
  const doc = articleDoc(single.doc, { title: post.title, content: sanitizeHtml(post.content || ''), imageUrl, url: `/${post.slug}/` });
  return { version: doc.version || '0.4', title: post.title, type: 'page', content: doc.content, page_settings: doc.page_settings };
}

// ---------------------------------------------------------------------------
// Final checks (section 8 of the prompt)
// ---------------------------------------------------------------------------

const IMAGE_URL = /\.(jpe?g|png|webp|gif|svg|avif)(\?|$)/i;

function runChecks(ctx, built, posts, links, baseUrl, T) {
  const items = [];
  const add = (level, message) => items.push({ level, message });
  const allowed = new Set(links.map((l) => normalizeUrl(l.url)));
  const kitDocs = ctx.kit ? builtSite(ctx).docs : null;
  const sameStructure = [];

  for (const { page, doc, missing = 0 } of built) {
    const entry = kitDocs?.[page.role];
    // Graphics of the kit design that stay (not demo photos), when they could not be bundled
    const keptUrls = new Set([...(entry?.marks?.values() || [])].flatMap((m) => (m.slot === 'keep' ? m.urls || [] : [])));
    const keptRemote = new Set();
    const demoImages = new Set();
    const badLinks = new Set();
    const otherEmails = new Set();
    let lorem = false;
    const visit = (v, key) => {
      if (typeof v === 'string') {
        if (/lorem ipsum|dolor sit amet/i.test(v)) lorem = true;
        if (key !== 'url') for (const m of v.match(EMAIL_IN_TEXT) || []) if (m.toLowerCase() !== ctx.project.email.toLowerCase()) otherEmails.add(m);
        return;
      }
      if (Array.isArray(v)) return v.forEach((x) => visit(x, key));
      if (!v || typeof v !== 'object') return;
      if (typeof v.url === 'string' && v.url) {
        const isLink = 'is_external' in v || 'nofollow' in v;
        if (!isLink && (IMAGE_URL.test(v.url) || 'id' in v) && !v.url.startsWith(baseUrl)) (keptUrls.has(v.url) ? keptRemote : demoImages).add(v.url);
        if (isLink && !/^(tel:|mailto:)/i.test(v.url) && !allowed.has(normalizeUrl(v.url)) && v.url !== '#') badLinks.add(v.url);
      }
      for (const [k, x] of Object.entries(v)) if (k !== '__globals__' && k !== '__dynamic__') visit(x, k);
    };
    visit(doc, null);
    const unchanged = missing + page.fields.filter((f) => f.source === 'original' || (f.format !== 'link' && f.source !== 'shared' && f.value == null)).length;

    if (demoImages.size) add('error', T.chkDemoImages(page.title, [...demoImages]));
    if (badLinks.size) add('warning', T.chkLinks(page.title, [...badLinks]));
    if (lorem) add('error', T.chkLorem(page.title));
    if (unchanged) add(ctx.kit ? 'error' : 'warning', ctx.kit ? T.chkKitEmptied(page.title, unchanged) : T.chkUnchanged(page.title, unchanged));
    if (otherEmails.size) add('warning', T.chkEmails(page.title, [...otherEmails]));

    // Template Kit: the page must keep the structure of its kit template (only texts and images change)
    if (entry?.origin) {
      const report = compareStructure(entry.origin, doc);
      if (report.ok) sameStructure.push(report);
      else add('error', T.chkKitStructure(page.title, report));
      if (report.formSwaps.length) add('info', T.chkKitFormSwap(page.title, entry.notes.formSwaps));
      const n = entry.notes;
      if (n.extraCards) add('warning', T.chkKitExtraCards(page.title, n.extraCards));
      if (n.hiddenServices) add('warning', T.chkKitHiddenServices(page.title, n.hiddenServices));
      if (n.videos) add('warning', T.chkKitVideos(page.title, n.videos));
      if (n.clientLogos) add('warning', T.chkKitClientLogos(page.title));
      if (page.role === 'contact' && !n.forms) add('warning', T.chkKitNoForm(page.title));
    }
    if (keptRemote.size) add('warning', T.chkKitRemoteGraphics(page.title, [...keptRemote]));
  }
  for (const p of posts) {
    const len = stripHtml(p.content).length;
    if (len < 300) add('error', T.chkPostShort(p.title, len));
    if (!p.image) add('warning', T.chkPostImage(p.title));
  }
  // Key figures written by the AI: realistic examples, the client must confirm them
  const kitStats = ctx.kit && built.some(({ page }) => builtSite(ctx).docs[page.role]?.sections?.some((s) => s.type === 'stats' || s.type === 'pricing'));
  if (ctx.template?.spec.sections?.includes('stats') || kitStats) add('warning', T.chkStats);
  if (!items.some((i) => i.level === 'error' || i.level === 'warning')) add('ok', T.chkAllGood);
  if (sameStructure.length) add('ok', T.chkKitStructureOk(sameStructure.length, sameStructure.reduce((n, r) => n + r.elements, 0)));
  add('info', T.chkResponsive);
  return items;
}

// ---------------------------------------------------------------------------
// Docs: content.md, seo.csv
// ---------------------------------------------------------------------------

function contentMarkdown(ctx, pages, allPages) {
  const lines = [`# ${ctx.project.site_name} — generated content`, '', `Language: ${languageName(ctx.project.language)}`, ''];
  for (const page of pages) {
    lines.push(`## ${page.title}${page.role === 'post' ? ' (article)' : ''}`, '');
    if (page.seo?.title || page.seo?.description) {
      lines.push(`- **Focus keyphrase:** ${page.seo.keyphrase || '—'}`, `- **SEO title:** ${page.seo.title || '—'}`, `- **Meta description:** ${page.seo.description || '—'}`, `- **Slug:** /${page.seo.slug ?? ''}`, '');
    }
    for (const f of page.fields) {
      const current = fieldValue(allPages, f);
      const value = f.format === 'link' ? current || '' : stripHtml(current ?? f.original);
      lines.push(`**${f.id}** _(${f.label})_`, '', value || '—', '');
    }
  }
  return lines.join('\n');
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

function seoCsv(pages) {
  const rows = [['page', 'type', 'focus_keyphrase', 'title', 'meta_description', 'slug'].join(',')];
  for (const p of pages) {
    if (p.seo?.slug === null || p.seo?.slug === undefined) continue; // header/footer/single post template
    rows.push([p.title, p.role === 'post' ? 'post' : 'page', p.seo.keyphrase || '', p.seo.title, p.seo.description, `/${p.seo.slug}${p.seo.slug ? '/' : ''}`].map(csvCell).join(','));
  }
  return '﻿' + rows.join('\r\n') + '\r\n'; // BOM so Excel opens UTF-8 correctly
}

// ---------------------------------------------------------------------------
// WordPress plugin
// ---------------------------------------------------------------------------

/**
 * Input of the WordPress plugin. The Elementor documents are rebuilt with images referenced as
 * esg-image://<file>: the plugin imports the bundled files and swaps in their Media Library id + URL.
 */
function pluginInput(ctx, pages, allPages, posts, exported, links, category, imagesDir) {
  const lang = ctx.project.language;
  const local = new Map([...exported].map(([id, e]) => [id, { ...e, url: PLUGIN_IMAGE_SCHEME + e.name }]));
  const built = buildPageDocs(ctx, pages, local, links, allPages);
  const builtFor = (role) => built.find((b) => b.page.role === role);
  const single = builtFor('single_post');

  const sitePages = SITE_PAGE_ROLES.map((role) => {
    const page = pages.find((p) => p.role === role);
    const b = builtFor(role);
    const title = page?.title || pageTitle(lang, role);
    return {
      key: role,
      role,
      title,
      slug: page?.seo?.slug || pageSlug(lang, role) || slugify(title) || 'home',
      seo: page?.seo ? { keyphrase: page.seo.keyphrase || '', title: page.seo.title, description: page.seo.description } : null,
      doc: b ? toImportable(b.doc, b.page) : null,
    };
  });
  const templates = ['header', 'footer', 'single_post']
    .map(builtFor)
    .filter(Boolean)
    .map((b) => {
      const doc = toImportable(b.doc, b.page);
      return { key: b.page.key, role: b.page.role, title: `${ctx.project.site_name} – ${b.page.title}`, type: doc.type, doc };
    });

  return {
    ctx,
    pages: sitePages,
    templates,
    posts: posts.map((p) => ({
      key: p.page.key,
      title: p.title,
      slug: p.slug,
      content: sanitizeHtml(p.content),
      excerpt: p.excerpt,
      image: p.image?.name || null,
      seo: { keyphrase: p.page.seo?.keyphrase || '', title: p.page.seo?.title || '', description: p.page.seo?.description || '' },
      doc: postDoc(single, p, p.image ? PLUGIN_IMAGE_SCHEME + p.image.name : null),
    })),
    // Uploaded images (photos + logo) and their hero / subheader crops (not shown in the gallery)
    images: [...exported].map(([key, e]) => {
      const img = ctx.images.find((i) => i.id === key);
      return { file: e.name, alt: e.alt, photo: Boolean(img) && img.role !== 'logo', logo: img?.role === 'logo' };
    }),
    imagesDir,
    category,
    globalStyles: builtSite(ctx).globalStyles,
    // CSS of the whole site (header, finishing touches of the template): the Additional CSS of WordPress
    siteCss: builtSite(ctx).siteCss || '',
    // Free plugins the Template Kit needs (installed from wordpress.org by the WordPress plugin)
    requiredPlugins: (ctx.kit?.info.requiredPlugins || []).filter((p) => !p.pro && p.slug !== 'elementor'),
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function exportGeneration(generationId) {
  const gen = get('SELECT * FROM generations WHERE id = ?', generationId);
  if (!gen) throw new Error('Generation not found');
  const output = parseJson(gen.output_json, { pages: [] });
  const ctx = loadContext(gen.project_id);
  if (!hasDesign(ctx)) throw badRequest('The project has no template anymore: choose a template or a Template Kit in the Template step.');
  // Field ids belong to the template / Template Kit the generation was made with: generations of
  // another design cannot be exported with the current one
  const genConfig = parseJson(gen.config_json, {});
  if (ctx.kit ? genConfig.kitId !== ctx.kit.id : genConfig.templateId !== ctx.template.id) {
    throw badRequest('This generation was made with another template: run a new generation with the current one.');
  }
  // ...and to the pages of the kit (roles of its templates, analysis)
  if (ctx.kit && genConfig.kitVersion !== ctx.kit.version) {
    throw badRequest('The Template Kit was changed after this generation (roles of its templates or analysis): run a new generation.');
  }
  // ...and to the version of the template builder (sections and widgets changed)
  if (genConfig.builderVersion !== BUILDER_VERSION) {
    throw badRequest('This generation was made with an older version of the templates: run a new generation.');
  }
  // ...and to the sections of each kit page (chosen in the Template step): a changed page must be regenerated
  if (ctx.kit) {
    const now = kitLayoutSignatures(ctx.kit, ctx.settings.kitLayout);
    const before = genConfig.kitPages || kitLayoutSignatures(ctx.kit, {});
    const changed = Object.keys(now).filter((role) => before[role] !== now[role]);
    if (changed.length) {
      const names = changed.map((role) => pageTitle(ctx.project.language, role)).join(', ');
      throw badRequest(`The sections of ${names} changed after this generation: regenerate ${changed.length > 1 ? 'these pages' : 'this page'} (Regenerate page) or run a new generation.`);
    }
  }
  // Template Kit: size and transparency of the demo images (photos to crop, graphics to keep)
  if (ctx.kit) {
    await measureDemoImages(ctx.kit);
    ctx.kit.demoImages = loadDemoImages(ctx.kit.dir);
    ctx.built = null;
  }

  // Pages whose service was deleted after the generation are skipped
  const pages = output.pages
    .filter((p) => p.status === 'done' || p.fields.some((f) => f.value))
    .filter((p) => p.role === 'post' || TEMPLATE_ROLES.includes(p.role))
    .filter((p) => !p.serviceId || ctx.services.some((s) => s.id === p.serviceId));
  if (!pages.length) throw badRequest('Nothing to export: no page has generated content.');

  const lang = ctx.project.language;
  const T = docsText(lang);
  const baseUrl = normalizeBaseUrl(ctx.project.image_base_url);
  const links = siteLinks(ctx, pages);
  const folderName = `output-${slugify(ctx.project.site_name) || 'site'}`;
  const workDir = path.join(config.outputDir, String(gen.id), 'work');
  fs.rmSync(path.join(config.outputDir, String(gen.id)), { recursive: true, force: true });
  const outRoot = path.join(workDir, folderName);
  fs.mkdirSync(path.join(outRoot, 'templates'), { recursive: true });

  const exported = await exportImages(ctx, path.join(outRoot, 'images'));
  await exportCrops(ctx, pages, exported, path.join(outRoot, 'images'));
  exportKitGraphics(ctx, pages, exported, path.join(outRoot, 'images'));
  const built = buildPageDocs(ctx, pages, exported, links, output.pages);
  const posts = buildPosts(ctx, pages, exported);

  for (const b of built) {
    fs.writeFileSync(path.join(outRoot, 'templates', `${b.page.key}.json`), JSON.stringify(toImportable(b.doc, b.page), null, 1));
  }
  // Each service article, already designed (templates/post-<slug>.json)
  const single = built.find((b) => b.page.role === 'single_post');
  for (const p of posts) {
    const doc = postDoc(single, p, p.image?.url || null);
    if (doc) fs.writeFileSync(path.join(outRoot, 'templates', `${p.page.key}.json`), JSON.stringify(doc, null, 1));
  }

  // WordPress import file: pages (for slugs + menu), articles, category, featured images, menu
  const sitePages = pages.filter((p) => p.seo?.slug != null && p.role !== 'post');
  const category = { name: servicesCategory(lang), slug: slugify(servicesCategory(lang)) };
  const siteUrl = (ctx.project.image_base_url.match(/^https?:\/\/[^/]+/i) || ['https://example.com'])[0];
  fs.writeFileSync(
    path.join(outRoot, 'wordpress-import.xml'),
    buildWxr({
      site: { name: ctx.project.site_name, url: siteUrl, language: lang === 'it' ? 'it-IT' : lang },
      category,
      menu: ctx.menu,
      pages: sitePages.map((p) => ({ title: p.title, slug: p.seo.slug, role: p.role })),
      posts,
    })
  );

  // WordPress plugin: creates the same site on activation, with the images bundled
  const plugin = buildPlugin(pluginInput(ctx, pages, output.pages, posts, exported, links, category, path.join(outRoot, 'images')));
  fs.writeFileSync(path.join(outRoot, plugin.fileName), plugin.buffer);
  const pluginDir = path.join(config.outputDir, String(gen.id), 'plugin');
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.writeFileSync(path.join(pluginDir, plugin.fileName), plugin.buffer);

  const menuItems = sitePages.map((p) => ({ title: p.title, url: p.seo.slug ? `/${p.seo.slug}/` : '/' }));
  const checks = runChecks(ctx, built, posts, links, baseUrl, T);
  const docInfo = { ctx, pages, built, posts, exported, baseUrl, placeholder: baseUrl === PLACEHOLDER_BASE_URL, category, menuItems, pluginFile: plugin.fileName, imageCount: exported.size, oneLineAddress: oneLine(ctx.project.address), siteCss: builtSite(ctx).siteCss || '' };

  fs.writeFileSync(path.join(outRoot, 'content.md'), contentMarkdown(ctx, pages, output.pages));
  fs.writeFileSync(path.join(outRoot, 'seo.csv'), seoCsv(pages));
  fs.writeFileSync(path.join(outRoot, 'menu.md'), T.menuMd(docInfo));
  if (docInfo.siteCss) fs.writeFileSync(path.join(outRoot, T.cssFile), docInfo.siteCss);
  fs.writeFileSync(path.join(outRoot, T.instructionsFile), T.instructions(docInfo));
  fs.writeFileSync(path.join(outRoot, T.checksFile), T.checksMd(ctx.project.site_name, checks));

  const zip = new AdmZip();
  addFolderToZip(zip, outRoot, folderName);
  const zipRel = path.join('output', String(gen.id), `${folderName}.zip`);
  zip.writeZip(path.join(config.storageDir, zipRel));
  fs.rmSync(workDir, { recursive: true, force: true });

  run(`UPDATE generations SET output_file = ?, updated_at = datetime('now') WHERE id = ?`, zipRel.replace(/\\/g, '/'), gen.id);
  return { file: zipRel, pages: built.length, posts: posts.length, images: exported.size, plugin: plugin.fileName, checks };
}

/** Path of the WordPress plugin zip of an export (null when not exported yet). */
export function pluginFile(generationId) {
  const dir = path.join(config.outputDir, String(generationId), 'plugin');
  const name = fs.existsSync(dir) && fs.readdirSync(dir).find((f) => f.endsWith('.zip'));
  return name ? path.join(dir, name) : null;
}
