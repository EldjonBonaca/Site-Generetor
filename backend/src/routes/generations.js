/** Generation jobs: plan/estimate, start, poll, edit, regenerate, export, download. */
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { all, get, run, parseJson } from '../db/index.js';
import { config } from '../config.js';
import { badRequest, notFound, HttpError, slugify } from '../lib/util.js';
import { loadContext, checkReadiness, siteLinks, buildPages } from '../generation/plan.js';
import { initPages, runGeneration, regenerateField, cancelGeneration, isRunning } from '../generation/runner.js';
import { SITE_PROMPT } from '../generation/site-prompt.js';
import { exportGeneration, pluginFile } from '../generation/exporter.js';
import { buildPagePrompt, estimateTokens } from '../generation/prompt-builder.js';

const router = Router();

function serialize(row, full = true) {
  const output = parseJson(row.output_json, { pages: [] });
  const base = {
    id: row.id,
    project_id: row.project_id,
    provider_id: row.provider_id,
    provider: row.provider_id ? get('SELECT name, model, type FROM ai_providers WHERE id = ?', row.provider_id) || null : null,
    status: row.status,
    running: isRunning(row.id),
    progress: row.progress,
    tokens_used: row.tokens_used,
    error: row.error,
    output_file: row.output_file,
    created_at: row.created_at,
    updated_at: row.updated_at,
    page_count: output.pages.length,
    pages_done: output.pages.filter((p) => p.status === 'done').length,
  };
  if (!full) return base;
  return { ...base, config: parseJson(row.config_json, {}), log: parseJson(row.log_json, []), pages: output.pages, links: output.links || [] };
}

const requireGen = (id) => {
  const row = get('SELECT * FROM generations WHERE id = ?', id);
  if (!row) throw notFound('Generation');
  return row;
};

/** Pages that would be generated + estimated tokens (shown before starting). */
router.get('/projects/:id/plan', (req, res) => {
  const ctx = loadContext(req.params.id);
  if (!ctx) throw notFound('Project');
  const readiness = checkReadiness(ctx);
  if (!buildPages(ctx).length) return res.json({ pages: [], estimatedTokens: 0, readiness });
  const links = siteLinks(ctx);
  let total = 0;
  const pages = initPages(ctx).map((p) => {
    const aiFields = p.fields.filter((f) => f.source !== 'auto');
    const service = p.serviceId ? ctx.services.find((s) => s.id === p.serviceId) : null;
    const { prompt, system } = buildPagePrompt({ promptContent: SITE_PROMPT.content, project: ctx.project, services: ctx.services, service, fields: aiFields, pageTitle: p.title, role: p.role, links, ctx });
    // input + output (values ≈ max length of each field) + SEO
    const est = estimateTokens(prompt + system) + Math.ceil(aiFields.reduce((s, f) => s + (f.maxLength || 80) + f.id.length + 6, 0) / 3.5) + 80;
    total += est;
    return { key: p.key, title: p.title, role: p.role, aiFields: aiFields.length, autoFields: p.fields.length - aiFields.length, slots: p.slotCount, prompt: SITE_PROMPT.name, estimatedTokens: est };
  });
  res.json({ pages, estimatedTokens: total, readiness, links });
});

router.get('/projects/:id/generations', (req, res) => {
  res.json(all('SELECT * FROM generations WHERE project_id = ? ORDER BY id DESC', req.params.id).map((g) => serialize(g, false)));
});

/** Start a new generation (runs in the background). */
router.post('/projects/:id/generations', (req, res) => {
  const ctx = loadContext(req.params.id);
  if (!ctx) throw notFound('Project');
  const readiness = checkReadiness(ctx);
  if (!readiness.ready) throw new HttpError(422, 'The project is not ready for generation.', readiness.items.filter((i) => i.level === 'error'));
  const active = get("SELECT id FROM generations WHERE project_id = ? AND status IN ('queued', 'running')", ctx.project.id);
  if (active && isRunning(active.id)) throw badRequest('A generation is already running for this project.');

  const gen = ctx.settings.generation;
  const pages = initPages(ctx);
  if (!pages.length) throw badRequest('No pages to generate: check the template mapping.');
  const { lastInsertRowid } = run(
    'INSERT INTO generations (project_id, provider_id, status, config_json, output_json) VALUES (?, ?, ?, ?, ?)',
    ctx.project.id,
    gen.providerId,
    'queued',
    JSON.stringify({ prompt: SITE_PROMPT.name }),
    JSON.stringify({ pages, links: siteLinks(ctx) })
  );
  runGeneration(lastInsertRowid).catch((e) => console.error('[generation]', e)); // background job
  res.status(202).json(serialize(requireGen(lastInsertRowid)));
});

router.get('/generations/:gid', (req, res) => res.json(serialize(requireGen(req.params.gid))));

router.delete('/generations/:gid', (req, res) => {
  const g = requireGen(req.params.gid);
  if (isRunning(g.id)) throw badRequest('Cancel the generation first.');
  run('DELETE FROM generations WHERE id = ?', g.id);
  fs.rmSync(path.join(config.outputDir, String(g.id)), { recursive: true, force: true });
  res.status(204).end();
});

router.post('/generations/:gid/cancel', (req, res) => {
  const g = requireGen(req.params.gid);
  cancelGeneration(g.id);
  res.json({ ok: true });
});

/** Manual edits from the preview: { fields: { id: value }, seo: { title, description, slug } } */
router.patch('/generations/:gid/pages/:key', (req, res) => {
  const g = requireGen(req.params.gid);
  if (isRunning(g.id)) throw badRequest('Wait for the generation to finish before editing.');
  const output = parseJson(g.output_json, { pages: [] });
  const page = output.pages.find((p) => p.key === req.params.key);
  if (!page) throw notFound('Page');
  for (const [id, value] of Object.entries(req.body?.fields || {})) {
    const f = page.fields.find((x) => x.id === id);
    if (!f || typeof value !== 'string') continue;
    f.value = value.slice(0, 20000);
    f.source = 'manual';
  }
  if (typeof req.body?.title === 'string' && req.body.title.trim()) page.title = req.body.title.trim().slice(0, 200);
  if (req.body?.seo) {
    const s = req.body.seo;
    if (typeof s.title === 'string') page.seo.title = s.title.slice(0, 200);
    if (typeof s.description === 'string') page.seo.description = s.description.slice(0, 400);
    if (typeof s.slug === 'string' && page.seo.slug !== null) page.seo.slug = slugify(s.slug, 120);
  }
  run("UPDATE generations SET output_json = ?, updated_at = datetime('now') WHERE id = ?", JSON.stringify(output), g.id);
  res.json(page);
});

/** Regenerate a whole page (background) */
router.post('/generations/:gid/pages/:key/regenerate', (req, res) => {
  const g = requireGen(req.params.gid);
  if (isRunning(g.id)) throw badRequest('A generation is already running.');
  const output = parseJson(g.output_json, { pages: [] });
  if (!output.pages.some((p) => p.key === req.params.key)) throw notFound('Page');
  runGeneration(g.id, { pageKeys: [req.params.key] }).catch((e) => console.error('[generation]', e));
  res.status(202).json({ ok: true });
});

/** Regenerate one field (awaited) */
router.post('/generations/:gid/pages/:key/fields/regenerate', async (req, res) => {
  const g = requireGen(req.params.gid);
  if (isRunning(g.id)) throw badRequest('A generation is already running.');
  const fieldId = String(req.body?.fieldId || '');
  if (!fieldId) throw badRequest('fieldId is required');
  try {
    res.json(await regenerateField(g.id, req.params.key, fieldId));
  } catch (err) {
    throw new HttpError(502, err.message);
  }
});

router.post('/generations/:gid/export', async (req, res) => {
  const g = requireGen(req.params.gid);
  if (isRunning(g.id)) throw badRequest('Wait for the generation to finish.');
  const result = await exportGeneration(g.id);
  res.json({ ...result, download: `/api/generations/${g.id}/download`, pluginDownload: `/api/generations/${g.id}/plugin` });
});

router.get('/generations/:gid/download', (req, res) => {
  const g = requireGen(req.params.gid);
  if (!g.output_file) throw notFound('Export (run the export first)');
  const file = path.join(config.storageDir, g.output_file);
  if (!fs.existsSync(file)) throw notFound('Export file');
  res.download(file, path.basename(file));
});

/** The WordPress plugin of the last export (also included in the zip). */
router.get('/generations/:gid/plugin', (req, res) => {
  const g = requireGen(req.params.gid);
  const file = pluginFile(g.id);
  if (!file) throw notFound('WordPress plugin (run the export first)');
  res.download(file, path.basename(file));
});

export default router;
