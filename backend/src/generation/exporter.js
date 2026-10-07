/**
 * Export: builds output-<site>.zip with
 *   <site>-site.zip (WordPress plugin that creates the site on activation) · elementor-kit.zip · templates/*.json · wordpress-import.xml · images/ · content.md · seo.csv
 *   · menu.md · INSTRUCTIONS.md (ISTRUZIONI.md in Italian) · CHECKS.md (CONTROLLI.md)
 * Everything is rebuilt from the original kit + stored values, so exports are repeatable.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { get, run, parseJson } from '../db/index.js';
import { config } from '../config.js';
import { AdmZip, addFolderToZip } from '../lib/zip.js';
import { slugify, stripHtml } from '../lib/util.js';
import { exportNames, galleryPool } from '../lib/images.js';
import { loadContext, analyzePage, buildReplacements, mappingFor, siteLinks, fallbackLink, servicesCategory, oneLine, pageTitle, pageSlug, PAGE_ROLES, SITE_PAGE_ROLES, DEFAULT_CROP_SIZES } from './plan.js';
import { applyFieldValues, applyImages, replaceContacts, sanitizeHtml } from '../elementor/apply.js';
import { isPersonSlot, EMAIL_IN_TEXT } from '../elementor/analyze.js';
import { loadTemplate } from '../elementor/kit.js';
import { normalizeUrl } from '../ai/json.js';
import { languageName } from './prompt-builder.js';
import { buildWxr } from './wxr.js';
import { buildPlugin, PLUGIN_IMAGE_SCHEME } from './wp-plugin.js';
import { docsText } from './export-docs.js';

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

/** Exact pixel size of the Home hero / page subheader images (settings.image.hero / .subheader). */
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
    const { width, height } = cropSize(ctx.settings, kind);
    const base = exported.get(img.id);
    const ext = path.extname(base.name);
    const name = `${path.basename(base.name, ext)}-${kind}${ext}`;
    const pipeline = sharp(path.join(config.storageDir, img.file_path), { failOn: 'none' })
      .rotate()
      .resize({ width, height, fit: 'cover', position: sharp.strategy.attention });
    await encode(pipeline, ext, ctx.settings.image.quality).toFile(path.join(destDir, name));
    exported.set(key, { name, url: normalizeBaseUrl(ctx.project.image_base_url) + name, alt: base.alt });
  }
}

/**
 * Decide which exported image goes into each slot of a page.
 * Gallery widgets get every photo. With "replace all images" on, no slot keeps its demo image:
 * unassigned slots get one of the photos (round-robin, starting at a different photo on each
 * page so they are spread over the site), people photos and a missing logo are removed.
 * Hero / subheader slots use the cropped version of their image (keys collected in `neededCrops`).
 */
function imageAssignment(ctx, page, slots, slotRoles, exported, neededCrops = null) {
  const ex = (i, crop = null) => {
    if (!i) return null;
    if (crop) {
      neededCrops?.add(cropKey(i.id, crop));
      if (exported.has(cropKey(i.id, crop))) return exported.get(cropKey(i.id, crop));
    }
    return exported.get(i.id) || null;
  };
  const pick = (pred) => ctx.images.find((i) => pred(i) && exported.has(i.id));
  const pool = galleryPool(ctx.images).filter((i) => exported.has(i.id));
  const serviceImg = (svc) => (svc ? pick((i) => i.role === 'service' && i.service_id === svc.id) : null);
  const serviceImgs = ctx.services.map(serviceImg).filter(Boolean);
  const replaceAll = ctx.settings.replaceAllImages;
  let g = [...page.key].reduce((n, c) => n + c.charCodeAt(0), 0);
  let seq = 0;
  const nextFill = () => (pool.length ? pool[g++ % pool.length] : null);

  const subheader = () => {
    if (ctx.settings.subheaderPerPage) {
      const specific = pick((i) => i.role === 'subheader' && (i.target_page === page.key || i.target_page === page.role));
      if (specific) return specific;
    }
    return pick((i) => i.role === 'subheader' && !i.target_page) || pick((i) => i.role === 'subheader');
  };

  const assignment = {};
  for (const slot of slots) {
    const role = slotRoles[slot.id] || 'keep';

    if (slot.kind === 'gallery') {
      if (role === 'remove' && page.role !== 'gallery') assignment[slot.id] = [];
      else if ((role !== 'keep' || replaceAll || page.role === 'gallery') && pool.length) assignment[slot.id] = pool.map((i) => ex(i));
      continue;
    }

    let img = null;
    let remove = role === 'remove';
    if (role === 'hero') img = pick((i) => i.role === 'hero_home');
    else if (role === 'subheader') img = subheader();
    else if (role === 'service_list') img = slot.card != null ? serviceImg(ctx.services[slot.card]) : serviceImgs.length ? serviceImgs[seq++ % serviceImgs.length] : null;
    else if (role === 'logo') img = pick((i) => i.role === 'logo');
    else if (role === 'gallery') img = nextFill();

    if (!img && !remove && replaceAll) {
      if (isPersonSlot(slot) || role === 'logo') remove = true;
      else img = nextFill();
      if (!img) remove = true;
    }
    if (remove) assignment[slot.id] = { remove: true };
    else if (img) assignment[slot.id] = ex(img, role === 'hero' || role === 'subheader' ? role : null);
  }
  return assignment;
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

/** Build the final Elementor document of every template page (articles have no template). */
function buildPageDocs(ctx, pages, exported, links) {
  const replacements = buildReplacements(ctx);
  return pages
    .filter((p) => p.templateId)
    .map((page) => {
      const { doc, fields, slots, slotRoles } = analyzePage(ctx, page);
      const stored = new Map(page.fields.map((f) => [f.id, f]));
      const values = {};
      for (const f of fields) {
        const s = stored.get(f.id);
        if (typeof s?.value === 'string') values[f.id] = s.value;
        else if (f.format === 'link') values[f.id] = fallbackLink(`${f.original} ${s?.hint || ''}`, links); // never keep demo URLs
      }
      applyFieldValues(doc, fields, values);
      applyImages(doc, slots, imageAssignment(ctx, page, slots, slotRoles, exported));
      replaceContacts(doc, { phone: ctx.project.phone, email: ctx.project.email, replacements, replaceAllEmails: ctx.settings.replaceAllEmails });
      if (!Array.isArray(doc) && 'title' in doc) doc.title = page.title;
      return { page, doc };
    });
}

/** Standalone importable template (Elementor > Templates > Import). */
function toImportable(doc, page) {
  if (Array.isArray(doc)) return { version: '0.4', title: page.title, type: 'page', content: doc, page_settings: {} };
  let type = doc.type || 'page';
  if (page.role === 'header' || page.role === 'footer') type = TEMPLATE_TYPES.has(doc.type) ? doc.type : page.role;
  if (page.role === 'single_post') type = TEMPLATE_TYPES.has(doc.type) && doc.type !== 'page' ? doc.type : 'single-post';
  if (!TEMPLATE_TYPES.has(type)) type = 'page';
  const out = { version: doc.version || '0.4', title: page.title, type, content: doc.content, page_settings: doc.page_settings || doc.settings || {} };
  if (doc.metadata) out.metadata = doc.metadata;
  return out;
}

// ---------------------------------------------------------------------------
// Kit rebuild
// ---------------------------------------------------------------------------

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dest, name);
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

const isGlobalTemplate = (t) => /global|kit[\s_-]?(settings|styles)|site[\s_-]?settings/i.test(`${t.type} ${t.title}`);

/**
 * Copy the original kit and replace the generated templates, keeping the original
 * format (template-kit or website-kit). Unused templates (except global styles) are dropped.
 */
function buildKit(ctx, built, workDir) {
  const kitRoot = path.join(ctx.kit.dir, ctx.kit.info.rootDir || '.');
  const out = path.join(workDir, 'kit');
  copyDir(kitRoot, out);
  const manifest = structuredClone(ctx.kit.manifest || {});
  const relToRoot = (templateId) => path.relative(kitRoot, path.join(ctx.kit.dir, templateId)).replace(/\\/g, '/');
  const writeJson = (rel, data) => {
    const file = path.join(out, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data));
  };
  const byTemplate = new Map(built.map((b) => [b.page.templateId, b]));
  const dropped = ctx.kit.info.templates.filter((t) => !byTemplate.has(t.id) && !isGlobalTemplate(t));
  for (const t of dropped) fs.rmSync(path.join(out, relToRoot(t.id)), { force: true });

  if (ctx.kit.format === 'template-kit' && Array.isArray(manifest.templates)) {
    const newTemplates = [];
    for (const entry of manifest.templates) {
      const tpl = entry?.source && ctx.kit.info.templates.find((t) => t.source?.kind === 'template-kit' && relToRoot(t.id) === path.posix.normalize(entry.source));
      if (tpl && dropped.includes(tpl)) continue;
      const b = tpl && byTemplate.get(tpl.id);
      if (b) writeJson(entry.source, b.doc);
      newTemplates.push(b ? { ...entry, name: b.page.title } : entry);
    }
    manifest.templates = newTemplates;
    if (manifest.title) manifest.title = `${ctx.project.site_name} – ${manifest.title}`;
  } else if (ctx.kit.format === 'website-kit') {
    for (const t of dropped) {
      if (t.source.group === 'templates') delete manifest.templates?.[t.source.id];
      else delete manifest.content?.[t.source.postType]?.[t.source.id];
    }
    for (const [tid, b] of byTemplate) {
      const src = ctx.kit.info.templates.find((x) => x.id === tid).source;
      if (src.group === 'templates') {
        writeJson(`templates/${src.id}.json`, b.doc);
        if (manifest.templates?.[src.id]) manifest.templates[src.id].title = b.page.title;
      } else {
        writeJson(`content/${src.postType}/${src.id}.json`, b.doc);
        const bucket = (manifest.content[src.postType] ||= {});
        bucket[src.id] = { ...(bucket[src.id] || {}), title: b.page.title };
      }
    }
    if (manifest.title) manifest.title = ctx.project.site_name;
  } else {
    for (const b of built) writeJson(relToRoot(b.page.templateId), b.doc);
  }

  if (fs.existsSync(path.join(out, 'manifest.json')) || ctx.kit.format !== 'loose') writeJson('manifest.json', manifest);
  const zip = new AdmZip();
  addFolderToZip(zip, out);
  return zip.toBuffer();
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

// ---------------------------------------------------------------------------
// Final checks (section 8 of the prompt)
// ---------------------------------------------------------------------------

const IMAGE_URL = /\.(jpe?g|png|webp|gif|svg|avif)(\?|$)/i;

function runChecks(ctx, built, posts, links, baseUrl, T) {
  const items = [];
  const add = (level, message) => items.push({ level, message });
  const allowed = new Set(links.map((l) => normalizeUrl(l.url)));
  const ignored = new Set(ctx.settings.demoValues.ignored || []);
  const demoValues = [
    ...(ctx.kit.info.contacts?.emails || []),
    ...(ctx.kit.info.contacts?.phones || []),
    ctx.settings.demoValues.brand,
    ctx.settings.demoValues.address,
  ].filter((v) => v && !ignored.has(v) && v !== ctx.project.email && v !== ctx.project.phone);

  for (const { page, doc } of built) {
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
        if (!isLink && (IMAGE_URL.test(v.url) || 'id' in v) && !v.url.startsWith(baseUrl)) demoImages.add(v.url);
        if (isLink && !/^(tel:|mailto:)/i.test(v.url) && !allowed.has(normalizeUrl(v.url)) && v.url !== '#') badLinks.add(v.url);
      }
      for (const [k, x] of Object.entries(v)) if (k !== '__globals__' && k !== '__dynamic__') visit(x, k);
    };
    visit(doc, null);
    const json = JSON.stringify(doc);
    const leftovers = demoValues.filter((d) => json.includes(d));
    const unchanged = page.fields.filter((f) => f.source === 'original' || (f.format !== 'link' && f.value == null)).length;

    if (demoImages.size) add('error', T.chkDemoImages(page.title, [...demoImages]));
    if (badLinks.size) add('warning', T.chkLinks(page.title, [...badLinks]));
    if (leftovers.length) add('error', T.chkDemoText(page.title, leftovers));
    if (lorem) add('error', T.chkLorem(page.title));
    if (unchanged) add('warning', T.chkUnchanged(page.title, unchanged));
    if (otherEmails.size) add('warning', T.chkEmails(page.title, [...otherEmails]));
  }
  for (const p of posts) {
    const len = stripHtml(p.content).length;
    if (len < 300) add('error', T.chkPostShort(p.title, len));
    if (!p.image) add('warning', T.chkPostImage(p.title));
  }
  if (!items.length) add('ok', T.chkAllGood);
  add('info', T.chkResponsive);
  return items;
}

// ---------------------------------------------------------------------------
// Docs: content.md, seo.csv
// ---------------------------------------------------------------------------

function contentMarkdown(ctx, pages) {
  const lines = [`# ${ctx.project.site_name} — generated content`, '', `Language: ${languageName(ctx.project.language)}`, ''];
  for (const page of pages) {
    lines.push(`## ${page.title}${page.role === 'post' ? ' (article)' : ''}`, '');
    if (page.seo?.title || page.seo?.description) {
      lines.push(`- **SEO title:** ${page.seo.title || '—'}`, `- **Meta description:** ${page.seo.description || '—'}`, `- **Slug:** /${page.seo.slug ?? ''}`, '');
    }
    for (const f of page.fields) {
      const value = f.format === 'link' ? f.value || '' : stripHtml(f.value ?? f.original);
      lines.push(`**${f.id}** _(${f.label})_`, '', value || '—', '');
    }
  }
  return lines.join('\n');
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

function seoCsv(pages) {
  const rows = [['page', 'type', 'title', 'meta_description', 'slug'].join(',')];
  for (const p of pages) {
    if (p.seo?.slug === null || p.seo?.slug === undefined) continue; // header/footer/single post template
    rows.push([p.title, p.role === 'post' ? 'post' : 'page', p.seo.title, p.seo.description, `/${p.seo.slug}${p.seo.slug ? '/' : ''}`].map(csvCell).join(','));
  }
  return '﻿' + rows.join('\r\n') + '\r\n'; // BOM so Excel opens UTF-8 correctly
}

// ---------------------------------------------------------------------------
// WordPress plugin
// ---------------------------------------------------------------------------

/** Kit settings that must not be copied: demo site identity and demo images. */
const SKIPPED_KIT_SETTINGS = new Set(['site_name', 'site_description', 'site_logo', 'site_favicon']);

/** Global colors / fonts of the kit (Template Kit "global styles" template or Website Kit site settings). */
function kitGlobalStyles(ctx) {
  const tpl = ctx.kit.info.templates.find((t) => t.valid && isGlobalTemplate(t));
  const doc = tpl ? loadTemplate(ctx.kit.dir, tpl.id) : null;
  let settings = doc?.page_settings || doc?.settings;
  if (!settings && ctx.kit.format === 'website-kit') {
    const file = path.join(ctx.kit.dir, ctx.kit.info.rootDir || '.', 'site-settings.json');
    settings = fs.existsSync(file) ? parseJson(fs.readFileSync(file, 'utf8'), {}).settings : null;
  }
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return null;
  const isImage = (v) => v && typeof v === 'object' && !Array.isArray(v) && 'url' in v;
  const styles = Object.fromEntries(Object.entries(settings).filter(([k, v]) => !SKIPPED_KIT_SETTINGS.has(k) && !isImage(v)));
  return Object.keys(styles).length ? styles : null;
}

/**
 * Input of the WordPress plugin. The Elementor documents are rebuilt with images referenced as
 * esg-image://<file>: the plugin imports the bundled files and swaps in their Media Library id + URL.
 */
function pluginInput(ctx, pages, posts, exported, links, category, imagesDir) {
  const lang = ctx.project.language;
  const local = new Map([...exported].map(([id, e]) => [id, { ...e, url: PLUGIN_IMAGE_SCHEME + e.name }]));
  const built = buildPageDocs(ctx, pages, local, links);
  const builtFor = (role) => built.find((b) => b.page.role === role);

  const sitePages = SITE_PAGE_ROLES.map((role) => {
    const page = pages.find((p) => p.role === role);
    const b = builtFor(role);
    const title = page?.title || pageTitle(lang, role);
    return {
      key: role,
      role,
      title,
      slug: page?.seo?.slug || pageSlug(lang, role) || slugify(title) || 'home',
      seo: page?.seo ? { title: page.seo.title, description: page.seo.description } : null,
      doc: b ? toImportable(b.doc, b.page) : null,
    };
  });
  const templates = ['header', 'footer', 'single_post']
    .map(builtFor)
    .filter(Boolean)
    .map((b) => {
      const doc = toImportable(b.doc, b.page);
      // Theme Builder document type (kits often export header/footer as plain "section" templates)
      const type = b.page.role === 'single_post' ? (doc.type === 'single' ? 'single' : 'single-post') : b.page.role;
      return { key: b.page.key, role: b.page.role, title: `${ctx.project.site_name} – ${b.page.title}`, type, doc: { ...doc, type } };
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
      seo: { title: p.page.seo?.title || '', description: p.page.seo?.description || '' },
    })),
    // Uploaded images (photos + logo) and their hero / subheader crops (not shown in the gallery)
    images: [...exported].map(([key, e]) => {
      const img = ctx.images.find((i) => i.id === key);
      return { file: e.name, alt: e.alt, photo: Boolean(img) && img.role !== 'logo', logo: img?.role === 'logo' };
    }),
    imagesDir,
    category,
    globalStyles: kitGlobalStyles(ctx),
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
  if (!ctx.kit) throw new Error('The project has no kit selected anymore.');

  // Pages whose service was deleted after the generation are skipped, and so are the service /
  // "other" pages of generations made by older versions (only the 5 site pages are kept).
  const pages = output.pages
    .filter((p) => p.status === 'done' || p.fields.some((f) => f.value))
    .filter((p) => p.role === 'post' || PAGE_ROLES.includes(p.role))
    .filter((p) => !p.serviceId || ctx.services.some((s) => s.id === p.serviceId))
    .filter((p) => !p.templateId || mappingFor(ctx, p.templateId).role !== 'ignore');
  if (!pages.length) throw new Error('Nothing to export: no page has generated content.');

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
  const built = buildPageDocs(ctx, pages, exported, links);
  const posts = buildPosts(ctx, pages, exported);

  for (const b of built) {
    fs.writeFileSync(path.join(outRoot, 'templates', `${b.page.key}.json`), JSON.stringify(toImportable(b.doc, b.page), null, 1));
  }
  fs.writeFileSync(path.join(outRoot, 'elementor-kit.zip'), buildKit(ctx, built, workDir));

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
  const plugin = buildPlugin(pluginInput(ctx, pages, posts, exported, links, category, path.join(outRoot, 'images')));
  fs.writeFileSync(path.join(outRoot, plugin.fileName), plugin.buffer);
  const pluginDir = path.join(config.outputDir, String(gen.id), 'plugin');
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.writeFileSync(path.join(pluginDir, plugin.fileName), plugin.buffer);

  const menuItems = sitePages.map((p) => ({ title: p.title, url: p.seo.slug ? `/${p.seo.slug}/` : '/' }));
  const checks = runChecks(ctx, built, posts, links, baseUrl, T);
  const docInfo = { ctx, pages, built, posts, exported, baseUrl, placeholder: baseUrl === PLACEHOLDER_BASE_URL, category, menuItems, pluginFile: plugin.fileName, imageCount: exported.size, oneLineAddress: oneLine(ctx.project.address) };

  fs.writeFileSync(path.join(outRoot, 'content.md'), contentMarkdown(ctx, pages));
  fs.writeFileSync(path.join(outRoot, 'seo.csv'), seoCsv(pages));
  fs.writeFileSync(path.join(outRoot, 'menu.md'), T.menuMd(docInfo));
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
