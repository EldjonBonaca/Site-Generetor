/** Image upload, validation, role assignment, SEO rename and AI ALT text. */
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { all, get, run, tx } from '../db/index.js';
import { config } from '../config.js';
import { badRequest, notFound, slugify } from '../lib/util.js';
import { loadContext } from '../generation/plan.js';
import { createProvider } from '../ai/registry.js';
import { extractJson, validateValues } from '../ai/json.js';
import { languageName, SYSTEM_PROMPT, technicalInstructions } from '../generation/prompt-builder.js';
import { touch } from './projects.js';
import { AdmZip } from '../lib/zip.js';
import { imageUpload, inspectImage, sendImage, storedName } from '../lib/upload.js';

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
  for (const file of req.files) {
    try {
      const info = await inspectImage(file.buffer, file.originalname);
      const stored = storedName(info.ext);
      fs.writeFileSync(path.join(dir, stored), file.buffer);
      const fileName = `${slugify(path.parse(file.originalname).name) || 'image'}${info.ext}`;
      const { lastInsertRowid } = run(
        `INSERT INTO images (project_id, file_path, file_name, original_name, mime, width, height, size)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        project.id, `images/${project.id}/${stored}`, fileName, file.originalname.slice(0, 255), info.mime, info.width, info.height, file.size
      );
      created.push(get('SELECT * FROM images WHERE id = ?', lastInsertRowid));
    } catch (err) {
      errors.push(err.message);
    }
  }
  touch(project.id);
  if (!created.length) throw badRequest(errors.join(' '));
  res.status(201).json({ created, errors });
});

/** Serve the stored file. */
router.get('/images/:iid/file', (req, res) => sendImage(res, requireImage(req.params.iid)));

/**
 * Add images of the Gallery library to the project. The files are copied, so the project keeps
 * them even if they are later deleted from the Gallery. Images already added are skipped.
 */
router.post('/projects/:id/images/from-library', (req, res) => {
  const project = get('SELECT id FROM projects WHERE id = ?', req.params.id);
  if (!project) throw notFound('Project');
  const ids = [...new Set((Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter(Number.isInteger))];
  if (!ids.length) throw badRequest('Select at least one image of the Gallery.');
  const already = new Set(all('SELECT library_image_id FROM images WHERE project_id = ? AND library_image_id IS NOT NULL', project.id).map((r) => r.library_image_id));
  const dir = path.join(config.imagesDir, String(project.id));
  fs.mkdirSync(dir, { recursive: true });
  const created = [];
  let skipped = 0;
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
      project.id, `images/${project.id}/${stored}`, lib.file_name, lib.original_name, lib.mime, lib.width, lib.height, lib.size, lib.alt_text, lib.id
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
  const head = [project.industry || project.site_name, project.city];
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
  const providerRow = providerId ? get('SELECT * FROM ai_providers WHERE id = ?', providerId) : null;
  if (!providerRow) throw badRequest('Select an AI provider first (step "AI & Prompts").');
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
    `a ${p.industry || 'local'} business in ${p.city || 'its area'}. Include the business type or location only where natural.` +
    technicalInstructions({ fields, languageLabel: languageName(p.language), pageTitle: 'Image ALT texts', includeStructure: true });

  const provider = createProvider(providerRow);
  const out = await provider.generate(prompt, { system: SYSTEM_PROMPT, json: true, fields, context: { site_name: p.site_name, city: p.city } });
  const { values } = validateValues(extractJson(out.text), fields.map((f) => f.id));
  tx(() => {
    for (const [key, alt] of Object.entries(values)) run('UPDATE images SET alt_text = ? WHERE id = ?', alt.slice(0, 300), Number(key.slice(5)));
  });
  res.json({ updated: Object.keys(values).length, images: all('SELECT * FROM images WHERE project_id = ? ORDER BY id', p.id) });
});

export default router;
