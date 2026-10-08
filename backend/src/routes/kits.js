/** Elementor kit library + per-project template mapping. */
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { all, get, run, parseJson } from '../db/index.js';
import { config } from '../config.js';
import { badRequest, notFound } from '../lib/util.js';
import { extractZipSafely, safeJoin } from '../lib/zip.js';
import { readKit, loadTemplate } from '../elementor/kit.js';
import { SLOT_ROLES, listSections } from '../elementor/analyze.js';
import { loadContext, mappingFor, analyzePage, removedSectionsFor, PAGE_ROLES } from '../generation/plan.js';
import { classifySections } from '../elementor/sections.js';
import { touch } from './projects.js';

const router = Router();

const upload = multer({
  dest: config.tmpDir,
  limits: { fileSize: config.maxKitBytes, files: 1 },
  fileFilter: (req, file, cb) => cb(/\.zip$/i.test(file.originalname) ? null : badRequest('Upload a .zip file exported from Elementor.'), true),
});

function serializeKit(row, withTemplates = false) {
  const info = parseJson(row.templates_json, { templates: [] });
  const out = {
    id: row.id,
    name: row.name,
    format: row.format,
    created_at: row.created_at,
    template_count: info.templates.length,
    used_by: get('SELECT COUNT(*) AS n FROM projects WHERE kit_id = ?', row.id).n,
  };
  if (withTemplates) {
    out.templates = info.templates;
    out.contacts = info.contacts;
    out.required_plugins = parseJson(row.manifest_json, {}).required_plugins || [];
  }
  return out;
}

const requireKit = (id) => {
  const row = get('SELECT * FROM kits WHERE id = ?', id);
  if (!row) throw notFound('Kit');
  return row;
};

router.get('/kits', (req, res) => res.json(all('SELECT * FROM kits ORDER BY id DESC').map((k) => serializeKit(k))));
router.get('/kits/:id', (req, res) => res.json(serializeKit(requireKit(req.params.id), true)));

router.post('/kits', upload.single('file'), (req, res) => {
  if (!req.file) throw badRequest('No file uploaded.');
  const { lastInsertRowid } = run("INSERT INTO kits (name, file_path, extracted_path, format) VALUES (?, '', '', 'loose')", req.file.originalname);
  const id = Number(lastInsertRowid);
  const kitDir = path.join(config.kitsDir, String(id));
  try {
    fs.mkdirSync(kitDir, { recursive: true });
    const zipPath = path.join(kitDir, 'original.zip');
    fs.renameSync(req.file.path, zipPath);
    const extracted = path.join(kitDir, 'extracted');
    extractZipSafely(zipPath, extracted);
    const kit = readKit(extracted);
    if (!kit.templates.length) throw badRequest('No Elementor templates found in this zip (manifest.json + templates/*.json expected).');

    const { manifest, ...info } = kit;
    const name = String(req.body?.name || kit.title || path.parse(req.file.originalname).name).slice(0, 200);
    run(
      'UPDATE kits SET name = ?, file_path = ?, extracted_path = ?, format = ?, manifest_json = ?, templates_json = ? WHERE id = ?',
      name,
      `kits/${id}/original.zip`,
      `kits/${id}/extracted`,
      kit.format,
      JSON.stringify(manifest),
      JSON.stringify(info),
      id
    );
    res.status(201).json(serializeKit(requireKit(id), true));
  } catch (err) {
    run('DELETE FROM kits WHERE id = ?', id);
    fs.rmSync(kitDir, { recursive: true, force: true });
    if (req.file?.path) fs.rmSync(req.file.path, { force: true });
    throw err;
  }
});

router.patch('/kits/:id', (req, res) => {
  const kit = requireKit(req.params.id);
  const name = String(req.body?.name || '').trim();
  if (!name) throw badRequest('Name is required');
  run('UPDATE kits SET name = ? WHERE id = ?', name.slice(0, 200), kit.id);
  res.json(serializeKit(requireKit(kit.id), true));
});

router.delete('/kits/:id', (req, res) => {
  const kit = requireKit(req.params.id);
  run('DELETE FROM kits WHERE id = ?', kit.id);
  fs.rmSync(path.join(config.kitsDir, String(kit.id)), { recursive: true, force: true });
  res.status(204).end();
});

/** Serve a screenshot/preview image stored inside the kit. */
router.get('/kits/:id/asset', (req, res) => {
  const kit = requireKit(req.params.id);
  const rel = String(req.query.path || '');
  if (!/\.(jpe?g|png|webp|gif)$/i.test(rel)) throw badRequest('Only images can be served');
  const file = safeJoin(path.join(config.storageDir, kit.extracted_path), rel);
  if (!fs.existsSync(file)) throw notFound('Asset');
  res.set('X-Content-Type-Options', 'nosniff');
  res.sendFile(file);
});

// ------------------------------------------------------ project <-> kit mapping --

/** Select the kit used by the project. */
router.put('/projects/:id/kit', (req, res) => {
  const project = get('SELECT * FROM projects WHERE id = ?', req.params.id);
  if (!project) throw notFound('Project');
  const kitId = req.body?.kit_id ? Number(req.body.kit_id) : null;
  if (kitId) requireKit(kitId);
  run("UPDATE projects SET kit_id = ?, updated_at = datetime('now') WHERE id = ?", kitId, project.id);
  res.json({ kit_id: kitId });
});

/** Templates of the project's kit with effective role and image slots. */
router.get('/projects/:id/kit-mapping', (req, res) => {
  const ctx = loadContext(req.params.id);
  if (!ctx) throw notFound('Project');
  if (!ctx.kit) return res.json({ kit: null, templates: [] });

  const templates = ctx.kit.info.templates.map((t) => {
    const { role, options } = mappingFor(ctx, t.id);
    let slots = [];
    let slotRoles = {};
    let sections = [];
    let cardCount = 0;
    if (t.valid && role !== 'ignore') {
      // Analyse as the page role it is mapped to (default slot roles depend on it)
      const fakePage = { role, templateId: t.id, prefix: 'x', key: role, title: t.title };
      const a = analyzePage(ctx, fakePage);
      slots = a.slots.map(({ id, kind, url, label, section, card }) => ({ id, kind, url, label, section, card }));
      slotRoles = a.slotRoles;
      cardCount = a.cardCount;
      const raw = loadTemplate(ctx.kit.dir, t.id);
      const removed = new Set(removedSectionsFor(ctx, t.id, role, raw));
      const kinds = new Map(classifySections(raw, role).map((s) => [s.id, s.kind]));
      const auto = !Array.isArray(options.removedSections);
      sections = listSections(raw).map((sec) => ({ ...sec, kind: kinds.get(sec.id), removed: removed.has(sec.id), auto }));
    }
    return { ...t, role, slots, slotRoles, sections, cardCount };
  });
  res.json({ kit: serializeKit(get('SELECT * FROM kits WHERE id = ?', ctx.kit.id), true), templates, pageRoles: PAGE_ROLES, slotRoles: SLOT_ROLES });
});

/** Save role and/or image-slot overrides for one template. */
router.put('/projects/:id/kit-mapping', (req, res) => {
  const ctx = loadContext(req.params.id);
  if (!ctx) throw notFound('Project');
  if (!ctx.kit) throw badRequest('Select a kit first');
  const templateId = String(req.body?.template_id || '');
  if (!ctx.kit.info.templates.some((t) => t.id === templateId)) throw badRequest('Unknown template');

  const current = mappingFor(ctx, templateId);
  const role = req.body.page_role ?? current.role;
  if (!PAGE_ROLES.includes(role)) throw badRequest('Invalid page role');
  let overrides = current.slotOverrides;
  const options = { ...current.options };
  if (Array.isArray(req.body.removed_sections)) options.removedSections = req.body.removed_sections.map(String).slice(0, 500);
  if (req.body.removed_sections === null) options.removedSections = null; // back to the automatic choice
  if (role !== current.role) overrides = {}; // slot defaults depend on the role
  if (req.body.image_slots && typeof req.body.image_slots === 'object') {
    for (const [slotId, slotRole] of Object.entries(req.body.image_slots)) {
      if (!SLOT_ROLES.includes(slotRole)) throw badRequest(`Invalid slot role "${slotRole}"`);
      overrides[slotId] = slotRole;
    }
  }

  // One template per page: the previous template of this role is ignored
  if (role !== 'ignore') {
    for (const t of ctx.kit.info.templates) {
      if (t.id !== templateId && mappingFor(ctx, t.id).role === role) upsert(ctx, t.id, 'ignore', {}, mappingFor(ctx, t.id).options);
    }
  }
  upsert(ctx, templateId, role, overrides, options);
  touch(ctx.project.id);
  res.json({ ok: true });
});

function upsert(ctx, templateId, role, overrides, options = {}) {
  const row = { page_role: role, image_slots_json: JSON.stringify(overrides), options_json: JSON.stringify(options) };
  run(
    `INSERT INTO kit_mappings (project_id, kit_id, template_id, page_role, image_slots_json, options_json) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (project_id, kit_id, template_id) DO UPDATE SET page_role = excluded.page_role, image_slots_json = excluded.image_slots_json, options_json = excluded.options_json`,
    ctx.project.id,
    ctx.kit.id,
    templateId,
    row.page_role,
    row.image_slots_json,
    row.options_json
  );
  // keep the in-memory context consistent for following upserts
  const existing = ctx.mappings.find((m) => m.template_id === templateId);
  if (existing) Object.assign(existing, row);
  else ctx.mappings.push({ template_id: templateId, ...row });
}

export default router;
