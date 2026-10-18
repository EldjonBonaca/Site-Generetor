/**
 * Template Kits: Elementor Template Kits (zip) uploaded by the users and shared by every project.
 *
 * Uploading a kit extracts it, reads its templates (kits/read.js) and, when a provider is given,
 * asks the AI to analyze it (kits/analysis.js): the design of the kit, the role of each template
 * in the site and the purpose of each section. The roles can be changed by the user.
 * A project uses a kit instead of a category template (PUT /projects/:id/template-kit): the kit
 * pages keep their design and structure, every text is rewritten by the AI for the business and
 * every image is replaced by the project images (kits/site.js).
 */
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { all, get, run, parseJson } from '../db/index.js';
import { config } from '../config.js';
import { badRequest, notFound, HttpError } from '../lib/util.js';
import { extractZipSafely, safeJoin } from '../lib/zip.js';
import { requireOwnProvider } from '../lib/owner.js';
import { createProvider } from '../ai/registry.js';
import { AIError } from '../ai/AIProvider.js';
import { readKit, loadKitTemplate, outlineDocument } from '../kits/read.js';
import { measureDemoImages } from '../kits/demo-images.js';
import { analyzeKit, heuristicAnalysis, effectiveRoles, describeGlobalStyles, KIT_ROLES, SECTION_TYPES } from '../kits/analysis.js';
import { touch } from './projects.js';
import { loadContext, pageTitle } from '../generation/plan.js';
import { kitLayouts, sectionTemplates, validLayout } from '../kits/site.js';

const router = Router();

const upload = multer({
  dest: config.tmpDir,
  limits: { fileSize: config.maxKitBytes, files: 1 },
  fileFilter: (req, file, cb) => cb(/\.zip$/i.test(file.originalname) ? null : badRequest('Upload the .zip file of an Elementor Template Kit.'), true),
});

const kitDir = (row) => path.join(config.storageDir, row.dir);

/** Structure of every page template, section by section (input of the AI analysis). */
function outlines(row, info) {
  const out = {};
  for (const t of info.templates.filter((x) => x.valid)) {
    const doc = loadKitTemplate(kitDir(row), t.id);
    out[t.id] = doc ? outlineDocument(doc) : [];
  }
  return out;
}

/** Colors and fonts of the kit for the UI. */
function stylesSummary(styles) {
  if (!styles) return null;
  const colors = [...(styles.system_colors || []), ...(styles.custom_colors || [])].filter((c) => /^#[0-9a-f]{3,8}$/i.test(c?.color || '')).slice(0, 10).map((c) => ({ title: String(c.title || c._id || ''), color: c.color }));
  const fonts = [...new Set([...(styles.system_typography || []), ...(styles.custom_typography || [])].map((f) => f?.typography_font_family).filter(Boolean))].slice(0, 6);
  return { colors, fonts, text: describeGlobalStyles(styles) };
}

function serialize(row, full = false) {
  const info = parseJson(row.info_json, { templates: [] });
  const analysis = parseJson(row.analysis_json, null);
  const roles = effectiveRoles(info, analysis, parseJson(row.roles_json, {}));
  const home = info.templates.find((t) => roles[t.id] === 'home');
  const cover = home?.screenshot || info.templates.find((t) => t.screenshot)?.screenshot || null;
  const out = {
    id: row.id,
    name: row.name,
    file_name: row.file_name,
    format: row.format,
    uploaded_by: row.uploaded_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    analyzed: Boolean(analysis?.ai),
    analyzed_by: row.analyzed_by,
    tokens_used: row.tokens_used,
    industry: analysis?.industry || '',
    summary: analysis?.summary || '',
    style: analysis?.style || '',
    tone: analysis?.tone || '',
    page_count: info.templates.filter((t) => t.valid).length,
    roles: Object.fromEntries(KIT_ROLES.filter((r) => r !== 'ignore').map((r) => [r, info.templates.find((t) => roles[t.id] === r)?.title || null])),
    cover,
    styles: stylesSummary(info.globalStyles),
    required_plugins: info.requiredPlugins || [],
    pro_widgets: info.proWidgets || [],
    used_by: get('SELECT COUNT(*) AS n FROM projects WHERE template_kit_id = ?', row.id).n,
  };
  if (!full) return out;
  const overrides = parseJson(row.roles_json, {});
  out.templates = info.templates.map((t) => {
    const a = analysis?.templates?.[t.id];
    return {
      id: t.id,
      title: t.title,
      type: t.type,
      screenshot: t.screenshot,
      valid: t.valid,
      sections: (a?.sections || []).map((s) => ({ type: s.type, label: SECTION_TYPES[s.type] || 'Other', description: s.description })),
      fields: t.fields,
      images: t.images,
      pro_widgets: t.proWidgets || [],
      role: roles[t.id],
      suggested_role: a?.role || t.suggestedRole,
      changed: t.id in overrides,
      purpose: a?.purpose || '',
    };
  });
  out.section_types = SECTION_TYPES;
  return out;
}

const requireKit = (id) => {
  const row = get('SELECT * FROM template_kits WHERE id = ?', id);
  if (!row) throw notFound('Template Kit');
  return row;
};

/** Run the AI analysis of a kit and save it (the roles chosen by hand are reset: the new analysis decides them). */
async function analyzeAndSave(row, providerRow) {
  const info = parseJson(row.info_json, { templates: [] });
  try {
    const { analysis, tokens } = await analyzeKit(createProvider(providerRow), { name: row.name, globalStyles: info.globalStyles, templates: info.templates }, outlines(row, info));
    run(
      "UPDATE template_kits SET analysis_json = ?, roles_json = '{}', analyzed_by = ?, tokens_used = tokens_used + ?, updated_at = datetime('now') WHERE id = ?",
      JSON.stringify({ ...analysis, analyzed_at: new Date().toISOString() }),
      `${providerRow.name} · ${providerRow.model}`,
      tokens,
      row.id
    );
  } catch (err) {
    if (err instanceof AIError) throw new HttpError(502, err.message);
    throw err;
  }
}

router.get('/template-kits', (req, res) => res.json(all('SELECT * FROM template_kits ORDER BY id DESC').map((r) => serialize(r))));
router.get('/template-kits/:id', (req, res) => res.json(serialize(requireKit(req.params.id), true)));

/**
 * Upload a kit (multipart: file, providerId?). Without a provider the kit is analyzed by heuristics
 * only (it can be analyzed by the AI later). An AI error does not lose the upload: the kit is saved
 * and the error is returned in `analysis_error`.
 */
router.post('/template-kits', upload.single('file'), async (req, res) => {
  if (!req.file) throw badRequest('No file uploaded.');
  let providerRow = null;
  try {
    providerRow = req.body?.providerId ? requireOwnProvider(req.body.providerId, req.user) : null;
  } catch (err) {
    fs.rmSync(req.file.path, { force: true });
    throw err;
  }
  const { lastInsertRowid } = run("INSERT INTO template_kits (name, file_name, uploaded_by) VALUES (?, ?, ?)", req.file.originalname.slice(0, 200), req.file.originalname.slice(0, 255), req.user || null);
  const id = Number(lastInsertRowid);
  const dir = path.join(config.kitsDir, String(id));
  try {
    const extracted = path.join(dir, 'kit');
    extractZipSafely(req.file.path, extracted);
    const info = readKit(extracted);
    if (!info.templates.some((t) => t.valid)) {
      throw badRequest('No Elementor template found in this zip: upload the Template Kit zip (manifest.json + templates/*.json) or an Elementor export.');
    }
    const name = String(req.body?.name || info.title || path.parse(req.file.originalname).name).trim().slice(0, 200) || 'Template Kit';
    const row = { id, name, dir: path.relative(config.storageDir, extracted).replace(/\\/g, '/') };
    const analysis = heuristicAnalysis(info.templates, outlines(row, info));
    run('UPDATE template_kits SET name = ?, dir = ?, format = ?, info_json = ?, analysis_json = ? WHERE id = ?', name, row.dir, info.format, JSON.stringify(info), JSON.stringify(analysis), id);
    // Size and transparency of the demo images, in the background (the export waits for it if needed)
    measureDemoImages({ dir: extracted, info });
  } catch (err) {
    run('DELETE FROM template_kits WHERE id = ?', id);
    fs.rmSync(dir, { recursive: true, force: true });
    throw err;
  } finally {
    fs.rmSync(req.file.path, { force: true });
  }

  let analysisError = null;
  if (providerRow) {
    try {
      await analyzeAndSave(requireKit(id), providerRow);
    } catch (err) {
      analysisError = err.message;
    }
  }
  res.status(201).json({ ...serialize(requireKit(id), true), analysis_error: analysisError });
});

/** AI analysis (again). Body: { providerId } */
router.post('/template-kits/:id/analyze', async (req, res) => {
  const row = requireKit(req.params.id);
  await analyzeAndSave(row, requireOwnProvider(req.body?.providerId, req.user));
  res.json(serialize(requireKit(row.id), true));
});

/** Rename, or change the role of templates. Body: { name?, roles?: { templateId: role } } (role null = back to the analysis). */
router.patch('/template-kits/:id', (req, res) => {
  const row = requireKit(req.params.id);
  const info = parseJson(row.info_json, { templates: [] });
  let name = row.name;
  if (req.body?.name !== undefined) {
    name = String(req.body.name).trim().slice(0, 200);
    if (!name) throw badRequest('Name is required');
  }
  const overrides = parseJson(row.roles_json, {});
  for (const [templateId, role] of Object.entries(req.body?.roles || {})) {
    if (!info.templates.some((t) => t.id === templateId && t.valid)) throw badRequest('Unknown template');
    if (role === null) {
      delete overrides[templateId];
      continue;
    }
    if (!KIT_ROLES.includes(role)) throw badRequest(`Invalid role "${role}"`);
    // One template per role: the template that had it is no longer used
    if (role !== 'ignore') {
      const current = effectiveRoles(info, parseJson(row.analysis_json, null), overrides);
      for (const [id, r] of Object.entries(current)) if (r === role && id !== templateId) overrides[id] = 'ignore';
    }
    overrides[templateId] = role;
  }
  // updated_at changes only with the pages of the kit (generations made before must be generated again)
  const pagesChanged = JSON.stringify(overrides) !== row.roles_json;
  run(`UPDATE template_kits SET name = ?, roles_json = ?${pagesChanged ? ", updated_at = datetime('now')" : ''} WHERE id = ?`, name, JSON.stringify(overrides), row.id);
  res.json(serialize(requireKit(row.id), true));
});

router.delete('/template-kits/:id', (req, res) => {
  const row = requireKit(req.params.id);
  run('UPDATE projects SET template_kit_id = NULL WHERE template_kit_id = ?', row.id);
  run('DELETE FROM template_kits WHERE id = ?', row.id);
  fs.rmSync(path.join(config.kitsDir, String(row.id)), { recursive: true, force: true });
  res.status(204).end();
});

/** A screenshot of a template of the kit (only the screenshots listed by the kit are served). */
router.get('/template-kits/:id/screenshot', (req, res) => {
  const row = requireKit(req.params.id);
  const rel = String(req.query.path || '');
  const info = parseJson(row.info_json, { templates: [] });
  if (!info.templates.some((t) => t.screenshot === rel)) throw notFound('Screenshot');
  const file = safeJoin(kitDir(row), rel);
  if (!fs.existsSync(file)) throw notFound('Screenshot');
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Cache-Control': 'private, max-age=86400' });
  res.sendFile(file);
});

/** The kit used by a project instead of a category template (kit_id null = none). */
router.put('/projects/:id/template-kit', (req, res) => {
  const project = get('SELECT * FROM projects WHERE id = ?', req.params.id);
  if (!project) throw notFound('Project');
  const kitId = req.body?.kit_id ? requireKit(Number(req.body.kit_id)).id : null;
  if (kitId) run('UPDATE projects SET template_kit_id = ?, template_id = NULL WHERE id = ?', kitId, project.id);
  else run('UPDATE projects SET template_kit_id = NULL WHERE id = ?', project.id);
  // The sections chosen for the pages belong to the previous kit
  if (kitId !== project.template_kit_id) saveKitLayout(project, null);
  touch(project.id);
  res.json({ template_kit_id: kitId });
});

// ---------------------------------------------------------------------------- sections of the pages

/** Sections chosen in a project for each kit page (settings.kitLayout); null = back to the kit default. */
function saveKitLayout(project, layout) {
  const settings = parseJson(project.settings_json, {});
  if (layout && Object.keys(layout).length) settings.kitLayout = layout;
  else delete settings.kitLayout;
  run("UPDATE projects SET settings_json = ?, updated_at = datetime('now') WHERE id = ?", JSON.stringify(settings), project.id);
}

/**
 * The sections of each page of a kit project and every section of the kit that can be added:
 * { pages: [{ role, title, custom, template, builder, sections: Section[] }], templates: [{ id, title, role, screenshot, sections: Section[] }] }
 * Section = { template, index, type, label, description, texts (demo texts, to recognize it), images, widgets, templateTitle }
 */
function kitSectionsView(projectId) {
  const ctx = loadContext(projectId);
  if (!ctx) throw notFound('Project');
  if (!ctx.kit) throw badRequest('The project does not use a Template Kit.');
  const kit = ctx.kit;
  const usable = sectionTemplates(kit);
  const outlinesOf = new Map();
  const outline = (id) => {
    if (!outlinesOf.has(id)) {
      const doc = loadKitTemplate(kit.dir, id);
      outlinesOf.set(id, doc ? outlineDocument(doc) : []);
    }
    return outlinesOf.get(id);
  };
  const describe = ({ template, index }) => {
    const s = kit.analysis?.templates?.[template]?.sections?.[index] || { type: 'other', description: '' };
    const o = outline(template)[index] || { texts: [], images: 0, widgets: [] };
    const widgets = o.widgets.filter((w) => !/^(spacer|divider|heading|text-editor)$/.test(w)).slice(0, 5);
    return { template, index, type: s.type, label: SECTION_TYPES[s.type] || 'Other', description: s.description || '', texts: o.texts.slice(0, 3), images: o.images, widgets, templateTitle: kit.info.templates.find((t) => t.id === template)?.title || '' };
  };
  const layouts = kitLayouts(kit, ctx.settings.kitLayout);
  return {
    pages: Object.entries(layouts).map(([role, l]) => ({
      role,
      title: pageTitle(ctx.project.language, role),
      custom: l.custom,
      template: l.template ? kit.info.templates.find((t) => t.id === l.template)?.title || null : null,
      builder: !l.sections.length,
      sections: l.sections.map(describe),
    })),
    templates: usable.map((t) => ({ id: t.id, title: t.title, role: kit.roles[t.id], screenshot: t.screenshot, sections: Array.from({ length: t.sections }, (_, index) => describe({ template: t.id, index })) })),
  };
}

router.get('/projects/:id/kit-sections', (req, res) => res.json(kitSectionsView(req.params.id)));

/** Sections of one page: { role, sections: [{ template, index }] } (sections null = the sections of the kit). */
router.put('/projects/:id/kit-sections', (req, res) => {
  const ctx = loadContext(req.params.id);
  if (!ctx) throw notFound('Project');
  if (!ctx.kit) throw badRequest('The project does not use a Template Kit.');
  const role = String(req.body?.role || '');
  const layouts = kitLayouts(ctx.kit, ctx.settings.kitLayout);
  if (!layouts[role]) throw badRequest('Unknown page');
  const next = { ...(ctx.settings.kitLayout || {}) };
  if (req.body.sections === null) delete next[role];
  else {
    const chosen = validLayout(ctx.kit, req.body.sections);
    if (!chosen || chosen.length !== (Array.isArray(req.body.sections) ? req.body.sections.length : -1)) throw badRequest('Choose at least one section of the kit (and only sections of the kit).');
    // The same sections as the kit: nothing to keep
    const kitDefault = kitLayouts(ctx.kit, {})[role].sections;
    const same = kitDefault.length === chosen.length && kitDefault.every((s, i) => s.template === chosen[i].template && s.index === chosen[i].index);
    if (same) delete next[role];
    else next[role] = chosen;
  }
  saveKitLayout(ctx.project, next);
  res.json(kitSectionsView(ctx.project.id));
});

export default router;
