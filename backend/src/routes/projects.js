/** Projects (one project = one site) + services. */
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { all, get, run, tx, parseJson } from '../db/index.js';
import { config } from '../config.js';
import { badRequest, notFound, pick, slugify, LANGUAGES } from '../lib/util.js';
import { loadContext, checkReadiness, defaultSettings } from '../generation/plan.js';
import { brandColor } from '../generation/exporter.js';
import { makeDesign, DEFAULT_PRIMARY } from '../elementor/layout.js';

const router = Router();

const PROJECT_FIELDS = ['site_name', 'phone', 'email', 'address', 'city', 'industry', 'language', 'notes', 'image_base_url', 'copyright'];
const MAX_LEN = { site_name: 200, phone: 40, email: 200, address: 1000, city: 200, industry: 200, notes: 5000, image_base_url: 500, copyright: 300 };

export function serializeProject(row) {
  const { settings_json, ...rest } = row;
  return { ...rest, settings: defaultSettings(parseJson(settings_json, {})) };
}

function requireProject(id) {
  const row = get('SELECT * FROM projects WHERE id = ?', id);
  if (!row) throw notFound('Project');
  return row;
}

/** Slug unique within the project. */
function uniqueSlug(projectId, wanted, exceptId = null) {
  const base = slugify(wanted) || 'service';
  let slug = base;
  for (let n = 2; get('SELECT id FROM services WHERE project_id = ? AND slug = ? AND id IS NOT ?', projectId, slug, exceptId); n++) {
    slug = `${base}-${n}`;
  }
  return slug;
}

// ---------------------------------------------------------------- projects --

router.get('/projects', (req, res) => {
  const rows = all(`
    SELECT p.*,
      (SELECT COUNT(*) FROM services s WHERE s.project_id = p.id) AS service_count,
      (SELECT COUNT(*) FROM images i WHERE i.project_id = p.id) AS image_count,
      (SELECT g.status FROM generations g WHERE g.project_id = p.id ORDER BY g.id DESC LIMIT 1) AS last_generation_status
    FROM projects p ORDER BY p.updated_at DESC, p.id DESC`);
  res.json(rows.map(serializeProject));
});

router.post('/projects', (req, res) => {
  const name = String(req.body?.site_name || '').trim().slice(0, 200);
  // New sites default to Italian (DEFAULT_LANGUAGE in .env to change it)
  const language = LANGUAGES[process.env.DEFAULT_LANGUAGE] ? process.env.DEFAULT_LANGUAGE : 'it';
  const { lastInsertRowid } = run('INSERT INTO projects (site_name, language) VALUES (?, ?)', name, language);
  res.status(201).json(serializeProject(requireProject(lastInsertRowid)));
});

router.get('/projects/:id', (req, res) => {
  const ctx = loadContext(req.params.id);
  if (!ctx) throw notFound('Project');
  res.json({
    ...serializeProject(ctx.project),
    services: ctx.services,
    readiness: checkReadiness(ctx),
  });
});

router.patch('/projects/:id', (req, res) => {
  const row = requireProject(req.params.id);
  const data = pick(req.body, PROJECT_FIELDS);
  for (const [k, v] of Object.entries(data)) {
    if (typeof v !== 'string') throw badRequest(`"${k}" must be a string`);
    if (v.length > MAX_LEN[k]) throw badRequest(`"${k}" is too long (max ${MAX_LEN[k]})`);
  }
  if (data.language && !LANGUAGES[data.language]) throw badRequest('Unsupported language');
  if (data.image_base_url && !/^https?:\/\//i.test(data.image_base_url.trim())) throw badRequest('Image base URL must start with http:// or https://');

  let settings = parseJson(row.settings_json, {});
  if (req.body?.settings && typeof req.body.settings === 'object') {
    const s = req.body.settings;
    settings = {
      ...settings,
      ...pick(s, ['subheaderPerPage', 'replaceAllEmails', 'replaceAllImages', 'mapEmbed', 'contactShortcode', 'menuName']),
      image: { ...(settings.image || {}), ...(s.image || {}) },
      demoValues: { ...(settings.demoValues || {}), ...(s.demoValues || {}) },
      generation: { ...(settings.generation || {}), ...(s.generation || {}) },
    };
    if (typeof settings.contactShortcode === 'string') settings.contactShortcode = settings.contactShortcode.slice(0, 500);
    if (typeof settings.menuName === 'string') settings.menuName = settings.menuName.slice(0, 100);
    if (s.layout === 'builtin' || s.layout === 'kit') settings.layout = s.layout;
    if (s.design && typeof s.design === 'object') {
      const color = String(s.design.primaryColor ?? '');
      settings.design = { ...(settings.design || {}), primaryColor: /^#[0-9a-f]{6}$/i.test(color) ? color : '' };
    }
    if (Array.isArray(s.reviews)) {
      const str = (v, max) => String(v ?? '').slice(0, max);
      settings.reviews = s.reviews
        .filter((r) => r && typeof r === 'object')
        .slice(0, 9)
        .map((r) => ({ name: str(r.name, 80), role: str(r.role, 80), text: str(r.text, 600) }));
    }
  }

  const sets = Object.keys(data).map((k) => `${k} = ?`);
  run(
    `UPDATE projects SET ${[...sets, 'settings_json = ?', "updated_at = datetime('now')"].join(', ')} WHERE id = ?`,
    ...Object.values(data).map((v) => v.trim?.() ?? v),
    JSON.stringify(settings),
    row.id
  );
  const ctx = loadContext(row.id);
  res.json({ ...serializeProject(ctx.project), services: ctx.services, readiness: checkReadiness(ctx) });
});

router.post('/projects/:id/duplicate', (req, res) => {
  const src = requireProject(req.params.id);
  const newId = tx(() => {
    const { lastInsertRowid: id } = run(
      `INSERT INTO projects (${PROJECT_FIELDS.join(', ')}, kit_id, settings_json)
       SELECT ${PROJECT_FIELDS.map((f) => (f === 'site_name' ? "site_name || ' (copy)'" : f)).join(', ')}, kit_id, settings_json FROM projects WHERE id = ?`,
      src.id
    );
    const serviceMap = new Map();
    for (const s of all('SELECT * FROM services WHERE project_id = ?', src.id)) {
      const r = run('INSERT INTO services (project_id, name, description, slug, position) VALUES (?, ?, ?, ?, ?)', id, s.name, s.description, s.slug, s.position);
      serviceMap.set(s.id, Number(r.lastInsertRowid));
    }
    run(
      'INSERT INTO kit_mappings (project_id, kit_id, template_id, page_role, image_slots_json, options_json) SELECT ?, kit_id, template_id, page_role, image_slots_json, options_json FROM kit_mappings WHERE project_id = ?',
      id,
      src.id
    );
    // Copy image files
    const destDir = path.join(config.imagesDir, String(id));
    fs.mkdirSync(destDir, { recursive: true });
    for (const img of all('SELECT * FROM images WHERE project_id = ?', src.id)) {
      const from = path.join(config.storageDir, img.file_path);
      if (!fs.existsSync(from)) continue;
      const relPath = path.join('images', String(id), path.basename(img.file_path)).replace(/\\/g, '/');
      fs.copyFileSync(from, path.join(config.storageDir, relPath));
      run(
        `INSERT INTO images (project_id, file_path, file_name, original_name, mime, width, height, size, role, service_id, target_page, alt_text, library_image_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, relPath, img.file_name, img.original_name, img.mime, img.width, img.height, img.size, img.role,
        img.service_id ? serviceMap.get(img.service_id) ?? null : null, img.target_page, img.alt_text, img.library_image_id
      );
    }
    // Saved generation choices refer to the original project's provider/prompts: keep them.
    return id;
  });
  res.status(201).json(serializeProject(requireProject(newId)));
});

router.delete('/projects/:id', (req, res) => {
  const row = requireProject(req.params.id);
  const gens = all('SELECT id FROM generations WHERE project_id = ?', row.id);
  run('DELETE FROM projects WHERE id = ?', row.id);
  fs.rmSync(path.join(config.imagesDir, String(row.id)), { recursive: true, force: true });
  for (const g of gens) fs.rmSync(path.join(config.outputDir, String(g.id)), { recursive: true, force: true });
  res.status(204).end();
});

router.get('/projects/:id/readiness', (req, res) => {
  const ctx = loadContext(req.params.id);
  if (!ctx) throw notFound('Project');
  res.json(checkReadiness(ctx));
});

/** Brand color of the built-in layout: { logo: color detected in the logo, effective: palette primary }. */
router.get('/projects/:id/brand-color', async (req, res) => {
  const ctx = loadContext(req.params.id);
  if (!ctx) throw notFound('Project');
  const logo = await brandColor({ ...ctx, settings: { ...ctx.settings, design: {} } });
  res.json({ logo, effective: makeDesign(await brandColor(ctx)).primary, defaultColor: DEFAULT_PRIMARY });
});

router.get('/languages', (req, res) => res.json(LANGUAGES));

// ---------------------------------------------------------------- services --

router.post('/projects/:id/services', (req, res) => {
  const p = requireProject(req.params.id);
  const name = String(req.body?.name || '').trim().slice(0, 200);
  const description = String(req.body?.description || '').slice(0, 3000);
  const { max } = get('SELECT COALESCE(MAX(position), -1) AS max FROM services WHERE project_id = ?', p.id);
  const slug = uniqueSlug(p.id, req.body?.slug || name || 'service');
  const { lastInsertRowid } = run(
    'INSERT INTO services (project_id, name, description, slug, position) VALUES (?, ?, ?, ?, ?)',
    p.id, name, description, slug, max + 1
  );
  touch(p.id);
  res.status(201).json(get('SELECT * FROM services WHERE id = ?', lastInsertRowid));
});

router.patch('/services/:sid', (req, res) => {
  const s = get('SELECT * FROM services WHERE id = ?', req.params.sid);
  if (!s) throw notFound('Service');
  const name = req.body?.name !== undefined ? String(req.body.name).slice(0, 200) : s.name;
  const description = req.body?.description !== undefined ? String(req.body.description).slice(0, 3000) : s.description;
  let slug = s.slug;
  if (req.body?.slug !== undefined && req.body.slug !== s.slug) slug = uniqueSlug(s.project_id, req.body.slug || name, s.id);
  else if (req.body?.name !== undefined && s.slug === uniqueSlug(s.project_id, s.name, s.id)) {
    // Slug was still the automatic one: keep it in sync with the name.
    slug = uniqueSlug(s.project_id, name || 'service', s.id);
  }
  run('UPDATE services SET name = ?, description = ?, slug = ? WHERE id = ?', name, description, slug, s.id);
  touch(s.project_id);
  res.json(get('SELECT * FROM services WHERE id = ?', s.id));
});

router.delete('/services/:sid', (req, res) => {
  const s = get('SELECT * FROM services WHERE id = ?', req.params.sid);
  if (!s) throw notFound('Service');
  run("UPDATE images SET role = '', service_id = NULL WHERE service_id = ?", s.id);
  run('DELETE FROM services WHERE id = ?', s.id);
  touch(s.project_id);
  res.status(204).end();
});

router.put('/projects/:id/services/order', (req, res) => {
  const p = requireProject(req.params.id);
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : null;
  if (!ids) throw badRequest('ids must be an array');
  tx(() => ids.forEach((sid, i) => run('UPDATE services SET position = ? WHERE id = ? AND project_id = ?', i, sid, p.id)));
  touch(p.id);
  res.json(all('SELECT * FROM services WHERE project_id = ? ORDER BY position, id', p.id));
});

export function touch(projectId) {
  run("UPDATE projects SET updated_at = datetime('now') WHERE id = ?", projectId);
}

export default router;
