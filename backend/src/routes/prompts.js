/** The built-in site prompt (read-only) + preview with real project data. */
import { Router } from 'express';
import { buildPagePrompt, estimateTokens } from '../generation/prompt-builder.js';
import { loadContext, buildPages, siteLinks } from '../generation/plan.js';
import { initPages } from '../generation/runner.js';
import { SITE_PROMPT } from '../generation/site-prompt.js';

const router = Router();

/** The prompt used for every page of every site (it cannot be changed). */
router.get('/prompts/site', (req, res) => res.json(SITE_PROMPT));

/**
 * Preview the final prompt of a project page: the site prompt with the variables replaced +
 * the technical instructions. Body: { projectId, pageKey? }. Without a project, sample data is used.
 */
router.post('/prompts/preview', (req, res) => {
  const b = req.body || {};

  const ctx = b.projectId ? loadContext(b.projectId) : null;
  let project = ctx?.project;
  let services = ctx?.services || [];
  let page = null;
  let fields = [];
  let pages = [];

  if (ctx?.kit) {
    pages = initPages(ctx);
    page = pages.find((p) => p.key === b.pageKey) || pages[0];
    fields = page ? page.fields.filter((f) => f.source !== 'auto') : [];
  }
  if (!project) {
    project = { site_name: 'Acme Plumbing', phone: '+44 20 7946 0958', email: 'info@acme.example', address: '1 High Street, London', city: 'London', industry: 'Plumber', language: 'en', notes: '' };
    services = [{ id: 1, name: 'Boiler repair', description: 'Fast boiler repairs' }, { id: 2, name: 'Bathroom installation', description: '' }];
  }
  if (!fields.length) {
    fields = [
      { id: 'home.hero.heading1.title', format: 'text', maxLength: 60, label: 'heading · title', original: 'We fix it fast' },
      { id: 'home.hero.text_editor1.editor', format: 'html', maxLength: 200, label: 'text-editor · editor', original: '<p>Demo paragraph</p>' },
    ];
  }
  const service = page?.serviceId ? services.find((s) => s.id === page.serviceId) : services[0];
  const seo = page?.slug !== null ? [{ id: '_seo.title', format: 'text', maxLength: 60, label: 'SEO title', hint: 'SEO title of the page' }, { id: '_seo.description', format: 'text', maxLength: 155, label: 'Meta description', hint: 'meta description' }] : [];
  const { prompt, system } = buildPagePrompt({
    promptContent: SITE_PROMPT.content,
    project,
    services,
    service,
    fields: [...fields, ...seo],
    pageTitle: page?.title || 'Home',
    role: page?.role || 'home',
    links: ctx ? siteLinks(ctx) : [],
    ctx,
  });
  res.json({
    prompt,
    system,
    estimatedTokens: estimateTokens(prompt + system),
    page: page ? { key: page.key, title: page.title } : null,
    pages: buildPagesSummary(ctx, pages),
    usingSampleData: !ctx,
  });
});

function buildPagesSummary(ctx, pages) {
  if (!ctx?.kit) return [];
  return (pages.length ? pages : buildPages(ctx)).map((p) => ({ key: p.key, title: p.title, role: p.role }));
}

export default router;
