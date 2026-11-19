/** Image upload, validation, role assignment, SEO rename and AI ALT text. */
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { all, get, run, tx } from '../db/index.js';
import { config } from '../config.js';
import { badRequest, mainPlace, notFound, slugify } from '../lib/util.js';
import { requireOwnProvider } from '../lib/owner.js';
import { loadContext } from '../generation/plan.js';
import { createProvider } from '../ai/registry.js';
import { extractJson, validateValues } from '../ai/json.js';
import { clientInstructions, CLIENT_SYSTEM, languageName, SYSTEM_PROMPT, technicalInstructions } from '../generation/prompt-builder.js';
import { touch } from './projects.js';
import { AdmZip } from '../lib/zip.js';
import { imageUpload, prepareUpload, sendImage, storedName } from '../lib/upload.js';
import { fetchFound, imagesOfList, isMapsLink, placeNameOfLink, scanGooglePlace, scanPage, tokenFor, urlOfToken } from '../lib/photo-import.js';
import { clientNamer } from '../lib/images.js';

const router = Router();
const ROLES = ['', 'hero_home', 'subheader', 'service', 'logo', 'gallery'];

const requireImage = (id) => {
  const img = get('SELECT * FROM images WHERE id = ?', id);
  if (!img) throw notFound('Image');
  return img;
};

router.get('/projects/:id/images', (req, res) => {
  res.json(all('SELECT * FROM images WHERE project_id = ? ORDER BY id', req.params.id));
});

router.post('/projects/:id/images', imageUpload.array('files'), async (req, res) => {
  const project = get('SELECT * FROM projects WHERE id = ?', req.params.id);
  if (!project) throw notFound('Project');
  if (!req.files?.length) throw badRequest('No files uploaded.');

  const dir = path.join(config.imagesDir, String(project.id));
  fs.mkdirSync(dir, { recursive: true });
  const created = [];
  const errors = [];
  const optimized = [];
  // Named after the client (site name + city), not with the name of the file on the computer
  const nameFor = clientNamer(project, all('SELECT file_name FROM images WHERE project_id = ?', project.id).map((r) => r.file_name));
  for (const file of req.files) {
    try {
      // Images of 1 MB or more are compressed below 1 MB (lib/optimize.js)
      const up = await prepareUpload(file);
      const stored = storedName(up.info.ext);
      fs.writeFileSync(path.join(dir, stored), up.buffer);
      const fileName = nameFor(up.info.ext, slugify(path.parse(file.originalname).name));
      const { lastInsertRowid } = run(
        `INSERT INTO images (project_id, file_path, file_name, original_name, mime, width, height, size)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        project.id, `images/${project.id}/${stored}`, fileName, file.originalname.slice(0, 255), up.info.mime, up.info.width, up.info.height, up.buffer.length
      );
      created.push(get('SELECT * FROM images WHERE id = ?', lastInsertRowid));
      if (up.optimized) optimized.push(up.optimized);
    } catch (err) {
      errors.push(err.message);
    }
  }
  touch(project.id);
  if (!created.length) throw badRequest(errors.join(' '));
  res.status(201).json({ created, errors, optimized });
});

/** Serve the stored file. */
router.get('/images/:iid/file', (req, res) => sendImage(res, requireImage(req.params.iid)));

// ------------------------------------------------- photos found elsewhere --

/** Where photos can be looked for in this project: Google Maps (the key of the app is set), the social profiles of the site data. */
router.get('/projects/:id/images/import/sources', (req, res) => {
  const project = get('SELECT instagram_url, facebook_url FROM projects WHERE id = ?', req.params.id);
  if (!project) throw notFound('Project');
  res.json({ google: Boolean(config.googleMapsApiKey), instagram: Boolean(String(project.instagram_url || '').trim()), facebook: Boolean(String(project.facebook_url || '').trim()) });
});

/**
 * Photos of the business found elsewhere, to choose from (lib/photo-import.js).
 * Body: { source: 'google' } (its Google Maps listing: needs GOOGLE_MAPS_API_KEY), { source: 'instagram' | 'facebook' }
 * (the profile of the site data), { source: 'link', url } (any public web page) or { source: 'list', text }
 * (addresses of photos the user copied in their own browser, e.g. from a profile they are logged in to).
 * -> { source, page, items: [{ token, width, height }], loginOnly, googleKey }
 */
router.post('/projects/:id/images/import/scan', async (req, res) => {
  const project = get('SELECT * FROM projects WHERE id = ?', req.params.id);
  if (!project) throw notFound('Project');
  const source = String(req.body?.source || 'link');
  let found;
  if (source === 'list') {
    const images = imagesOfList(String(req.body?.text || '').slice(0, 400_000));
    if (!images.length) throw badRequest('No address of a photo was found in the pasted text.');
    found = { page: '', images, loginOnly: false };
  } else if (source === 'google' || (source === 'link' && isMapsLink(req.body?.url))) {
    // A link to a Google Maps listing: its page holds no photos for a server, so the listing is looked up through the
    // official service (by the name in the link, else the name and address of the site data)
    if (!config.googleMapsApiKey) {
      throw badRequest('Google Maps gives its photos only through its official service, which needs a key on the server (GOOGLE_MAPS_API_KEY). Without it: open the photos of the listing in your browser, press Ctrl+A then Ctrl+C, and paste here with Ctrl+V.');
    }
    const address = String(project.address || '').replace(/\s+/g, ' ').trim();
    const query = [placeNameOfLink(req.body?.url) || project.site_name, address].filter((x) => x && x.trim()).join(', ');
    const g = await scanGooglePlace(query, config.googleMapsApiKey, { language: project.language || 'it' });
    found = { page: g.place, images: g.images, loginOnly: false };
  } else {
    const url = source === 'instagram' ? project.instagram_url : source === 'facebook' ? project.facebook_url : req.body?.url;
    if (!String(url || '').trim()) throw badRequest(source === 'link' ? 'Enter the address of the page.' : 'Enter the address of this profile in the site data first.');
    found = await scanPage(url);
  }
  res.json({ source, page: found.page, loginOnly: found.loginOnly, latestOnly: Boolean(found.latestOnly), items: found.images.map((i) => ({ token: tokenFor(i.url), width: i.width, height: i.height })) });
});

/** One found image, shown in the list to choose from (fetched by the server: the browser never contacts the other site). */
router.get('/projects/:id/images/import/preview', async (req, res) => {
  if (!get('SELECT id FROM projects WHERE id = ?', req.params.id)) throw notFound('Project');
  const img = await fetchFound(urlOfToken(req.query.token), { maxBytes: config.maxImageBytes, key: config.googleMapsApiKey });
  res.set({ 'Content-Type': /^image\/(jpeg|png|webp|avif|gif)$/.test(img.type) ? img.type : 'application/octet-stream', 'Cache-Control': 'private, max-age=600', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' });
  res.send(img.buffer);
});

/**
 * Add the chosen found images to the project. Body: { tokens: [] } (at most 40 at a time).
 * Each is downloaded, checked and stored like an uploaded file (converted / compressed when needed);
 * images that turn out to be small (icons, thumbnails) are skipped.
 */
router.post('/projects/:id/images/import', async (req, res) => {
  const project = get('SELECT * FROM projects WHERE id = ?', req.params.id);
  if (!project) throw notFound('Project');
  const tokens = [...new Set(Array.isArray(req.body?.tokens) ? req.body.tokens.map(String) : [])].slice(0, 40);
  if (!tokens.length) throw badRequest('Select at least one image.');
  const urls = tokens.map(urlOfToken);
  const dir = path.join(config.imagesDir, String(project.id));
  fs.mkdirSync(dir, { recursive: true });
  const nameFor = clientNamer(project, all('SELECT file_name FROM images WHERE project_id = ?', project.id).map((r) => r.file_name));
  const created = [];
  const errors = [];
  const optimized = [];
  let small = 0;
  for (const url of urls) {
    try {
      const file = await fetchFound(url, { maxBytes: config.maxImageBytes, key: config.googleMapsApiKey });
      const up = await prepareUpload({ buffer: file.buffer, originalname: file.name });
      if (up.info.mime !== 'image/svg+xml' && ((up.info.width || 0) < 300 || (up.info.height || 0) < 200)) {
        small++;
        continue;
      }
      const stored = storedName(up.info.ext);
      fs.writeFileSync(path.join(dir, stored), up.buffer);
      const { lastInsertRowid } = run(
        `INSERT INTO images (project_id, file_path, file_name, original_name, mime, width, height, size)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        project.id, `images/${project.id}/${stored}`, nameFor(up.info.ext, slugify(path.parse(file.name).name)), file.name.slice(0, 255), up.info.mime, up.info.width, up.info.height, up.buffer.length
      );
      created.push(get('SELECT * FROM images WHERE id = ?', lastInsertRowid));
      if (up.optimized) optimized.push(up.optimized);
    } catch (err) {
      errors.push(err.message);
    }
  }
  touch(project.id);
  if (!created.length && !small) throw badRequest([...new Set(errors)].join(' ') || 'No image could be downloaded.');
  res.status(201).json({ created, errors: [...new Set(errors)], optimized, small });
});

/**
 * Add images of the Gallery library to the project. The files are copied, so the project keeps
 * them even if they are later deleted from the Gallery, and named after the client
 * ("<site>-<city>-1.jpg"…). Images already added are skipped.
 */
router.post('/projects/:id/images/from-library', (req, res) => {
  const project = get('SELECT id, site_name, city FROM projects WHERE id = ?', req.params.id);
  if (!project) throw notFound('Project');
  const ids = [...new Set((Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter(Number.isInteger))];
  if (!ids.length) throw badRequest('Select at least one image of the Gallery.');
  const already = new Set(all('SELECT library_image_id FROM images WHERE project_id = ? AND library_image_id IS NOT NULL', project.id).map((r) => r.library_image_id));
  const dir = path.join(config.imagesDir, String(project.id));
  fs.mkdirSync(dir, { recursive: true });
  const created = [];
  let skipped = 0;
  // The photo gets the name of this client (the same Gallery photo has another name in every project)
  const nameFor = clientNamer(project, all('SELECT file_name FROM images WHERE project_id = ?', project.id).map((r) => r.file_name));
  for (const id of ids) {
    const lib = get('SELECT * FROM library_images WHERE id = ?', id);
    const from = lib && path.join(config.storageDir, lib.file_path);
    if (!lib || already.has(lib.id) || !fs.existsSync(from)) {
      skipped++;
      continue;
    }
    const stored = storedName(path.extname(lib.file_path));
    fs.copyFileSync(from, path.join(dir, stored));
    const { lastInsertRowid } = run(
      `INSERT INTO images (project_id, file_path, file_name, original_name, mime, width, height, size, alt_text, library_image_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      project.id, `images/${project.id}/${stored}`, nameFor(path.extname(lib.file_name || lib.file_path).toLowerCase(), slugify(path.parse(lib.file_name || '').name)), lib.original_name, lib.mime, lib.width, lib.height, lib.size, lib.alt_text, lib.id
    );
    already.add(lib.id);
    created.push(get('SELECT * FROM images WHERE id = ?', lastInsertRowid));
  }
  if (created.length) touch(project.id);
  res.status(created.length ? 201 : 200).json({ created, skipped });
});

/**
 * All the uploaded images of a project as one zip: the original files (not resized), named with
 * their current file name (as edited / SEO-renamed) and their real extension.
 */
router.get('/projects/:id/images/download', (req, res) => {
  const project = get('SELECT id, site_name FROM projects WHERE id = ?', req.params.id);
  if (!project) throw notFound('Project');
  const images = all('SELECT * FROM images WHERE project_id = ? ORDER BY id', project.id);
  const zip = new AdmZip();
  const used = new Set();
  for (const img of images) {
    const file = path.join(config.storageDir, img.file_path);
    if (!fs.existsSync(file)) continue;
    const ext = path.extname(img.file_path).toLowerCase();
    const base = slugify(path.parse(img.file_name || img.original_name).name) || `image-${img.id}`;
    let name = `${base}${ext}`;
    for (let n = 2; used.has(name); n++) name = `${base}-${n}${ext}`;
    used.add(name);
    zip.addFile(name, fs.readFileSync(file));
  }
  if (!used.size) throw notFound('Images (this project has no uploaded images)');
  res.attachment(`${slugify(project.site_name) || `project-${project.id}`}-images.zip`);
  res.type('application/zip').send(zip.toBuffer());
});

/**
 * Update role / service / ALT / file name. Enforces the assignment rules:
 * hero_home and logo are unique, one image per service, one subheader (or one per page).
 */
router.patch('/images/:iid', (req, res) => {
  const img = requireImage(req.params.iid);
  const ctx = loadContext(img.project_id);
  const b = req.body || {};
  const next = { role: img.role, service_id: img.service_id, target_page: img.target_page, alt_text: img.alt_text, file_name: img.file_name };

  if (b.role !== undefined) {
    // Accept the "service:<slug>" notation too
    let role = String(b.role);
    if (role.startsWith('service:')) {
      const svc = ctx.services.find((s) => s.slug === role.slice(8));
      if (!svc) throw badRequest('Unknown service');
      role = 'service';
      next.service_id = svc.id;
    }
    if (!ROLES.includes(role)) throw badRequest('Invalid role');
    next.role = role;
  }
  if (b.service_id !== undefined) next.service_id = b.service_id ? Number(b.service_id) : null;
  if (b.target_page !== undefined) next.target_page = b.target_page ? String(b.target_page).slice(0, 100) : null;
  if (b.alt_text !== undefined) next.alt_text = String(b.alt_text).slice(0, 300);
  if (b.file_name !== undefined) {
    const parsed = path.parse(String(b.file_name));
    const ext = path.extname(img.file_path);
    const base = slugify(parsed.name);
    if (!base) throw badRequest('Invalid file name');
    next.file_name = `${base}${ext}`;
  }
  if (next.role !== 'service') next.service_id = null;
  if (next.role !== 'subheader') next.target_page = null;
  if (next.role === 'service' && !ctx.services.some((s) => s.id === next.service_id)) throw badRequest('Pick the service for this image');

  tx(() => {
    const clear = (sql, ...params) => run(`UPDATE images SET role = '', service_id = NULL, target_page = NULL WHERE project_id = ? AND id != ? AND ${sql}`, img.project_id, img.id, ...params);
    if (next.role === 'hero_home' || next.role === 'logo') clear('role = ?', next.role);
    if (next.role === 'service') clear("role = 'service' AND service_id = ?", next.service_id);
    if (next.role === 'subheader') {
      if (ctx.settings.subheaderPerPage) clear("role = 'subheader' AND target_page IS ?", next.target_page);
      else clear("role = 'subheader'");
    }
    run(
      'UPDATE images SET role = ?, service_id = ?, target_page = ?, alt_text = ?, file_name = ? WHERE id = ?',
      next.role, next.service_id, next.target_page, next.alt_text, next.file_name, img.id
    );
  });
  touch(img.project_id);
  res.json({ image: requireImage(img.id), images: all('SELECT * FROM images WHERE project_id = ? ORDER BY id', img.project_id) });
});

router.delete('/images/:iid', (req, res) => {
  const img = requireImage(req.params.iid);
  run('DELETE FROM images WHERE id = ?', img.id);
  fs.rmSync(path.join(config.storageDir, img.file_path), { force: true });
  touch(img.project_id);
  res.status(204).end();
});

/** SEO-friendly names, e.g. plumber-london-boiler-repair.webp */
router.post('/projects/:id/images/seo-rename', (req, res) => {
  const ctx = loadContext(req.params.id);
  if (!ctx) throw notFound('Project');
  const { project, services } = ctx;
  const head = [project.industry || project.site_name, mainPlace(project.city)];
  const used = new Set();
  let galleryN = 0;
  tx(() => {
    for (const img of ctx.images) {
      if (!img.role) continue;
      let parts;
      if (img.role === 'hero_home') parts = [...head, 'home'];
      else if (img.role === 'subheader') parts = [...head, img.target_page || 'banner'];
      else if (img.role === 'service') parts = [...head, services.find((s) => s.id === img.service_id)?.name || 'service'];
      else if (img.role === 'logo') parts = [project.site_name, 'logo'];
      else parts = [...head, 'gallery', String(++galleryN)];
      const ext = path.extname(img.file_path);
      const base = slugify(parts.filter(Boolean).join(' ')) || `image-${img.id}`;
      let name = `${base}${ext}`;
      for (let n = 2; used.has(name); n++) name = `${base}-${n}${ext}`;
      used.add(name);
      run('UPDATE images SET file_name = ? WHERE id = ?', name, img.id);
    }
  });
  res.json(all('SELECT * FROM images WHERE project_id = ? ORDER BY id', project.id));
});

/** Generate ALT texts with the AI (text-only: based on role, service and business data). */
router.post('/projects/:id/images/alt-text', async (req, res) => {
  const ctx = loadContext(req.params.id);
  if (!ctx) throw notFound('Project');
  const providerId = req.body?.providerId || ctx.settings.generation.providerId;
  const providerRow = requireOwnProvider(providerId, req.user, 'Select an AI provider first (step "AI").');
  const overwrite = Boolean(req.body?.overwrite);
  const targets = ctx.images.filter((i) => i.role && (overwrite || !i.alt_text.trim()));
  if (!targets.length) return res.json({ updated: 0, images: ctx.images });

  const describe = (img) => {
    if (img.role === 'hero_home') return 'main image of the home page';
    if (img.role === 'subheader') return `banner of the ${img.target_page || 'inner'} page(s)`;
    if (img.role === 'service') return `image of the service "${ctx.services.find((s) => s.id === img.service_id)?.name}"`;
    if (img.role === 'logo') return 'company logo';
    return 'gallery image';
  };
  const fields = targets.map((img) => ({
    id: `_alt.${img.id}`,
    format: 'text',
    maxLength: 125,
    original: '',
    label: 'ALT text',
    hint: `${describe(img)}; original file name "${img.original_name}"`,
  }));
  const p = ctx.project;
  const prompt =
    `Write concise, descriptive ALT texts (max 125 characters, no "image of") for the images of the website of "${p.site_name}", ` +
    `a ${p.industry || 'local'} business in ${mainPlace(p.city) || 'its area'}. Include the business type or location only where natural.` +
    clientInstructions(p.notes) +
    technicalInstructions({ fields, languageLabel: languageName(p.language), pageTitle: 'Image ALT texts', includeStructure: true, notes: p.notes });

  const provider = createProvider(providerRow);
  const out = await provider.generate(prompt, { system: p.notes?.trim() ? `${SYSTEM_PROMPT} ${CLIENT_SYSTEM}` : SYSTEM_PROMPT, json: true, fields, context: { site_name: p.site_name, city: p.city } });
  const { values } = validateValues(extractJson(out.text), fields.map((f) => f.id));
  tx(() => {
    for (const [key, alt] of Object.entries(values)) run('UPDATE images SET alt_text = ? WHERE id = ?', alt.slice(0, 300), Number(key.slice(5)));
  });
  res.json({ updated: Object.keys(values).length, images: all('SELECT * FROM images WHERE project_id = ? ORDER BY id', p.id) });
});

export default router;
