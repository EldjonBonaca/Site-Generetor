/**
 * Template Kit cleanup: automatic section removal, real reviews in review sections,
 * plugins required by the kit.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'esg-kitsec-'));
process.env.ENCRYPTION_KEY ||= 'e'.repeat(64);

const { default: app } = await import('../src/app.js');
const { classifySections, kitPlugins } = await import('../src/elementor/sections.js');
const { AdmZip } = await import('../src/lib/zip.js');

const SAMPLE_KIT = path.resolve(__dirname, '../../samples/sample-elementor-kit.zip');
let server;
let base;
before(async () => {
  await new Promise((r) => (server = app.listen(0, '127.0.0.1', r)));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server?.close());

async function api(method, url, body) {
  const isForm = body instanceof FormData;
  const res = await fetch(base + url, { method, headers: body && !isForm ? { 'content-type': 'application/json' } : {}, body: body ? (isForm ? body : JSON.stringify(body)) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

let n = 0;
const w = (widgetType, settings = {}) => ({ id: `w${n++}`, elType: 'widget', widgetType, settings, elements: [] });
const sec = (id, ...widgets) => ({ id, elType: 'container', settings: {}, elements: widgets });
const card = (title) => ({ id: `c${n++}`, elType: 'container', settings: {}, elements: [w('image-box', { title_text: title, image: { url: 'https://d.test/a.jpg', id: 1 } })] });

const HOME = {
  content: [
    sec('hero', w('heading', { title: 'Benvenuti' })),
    sec('about', w('heading', { title: 'Chi siamo' }), w('text-editor', { editor: '<p>Storia</p>' }), w('counter', { title: 'Anni' })),
    { id: 'services', elType: 'container', settings: {}, elements: [w('heading', { title: 'Cosa offriamo' }), { id: 'grid', elType: 'container', settings: {}, elements: [card('A'), card('B'), card('C')] }] },
    sec('faq', w('heading', { title: 'Domande frequenti' }), w('accordion', { tabs: [] })),
    sec('team', w('heading', { title: 'Il nostro team' }), w('image', { image: { url: 'https://d.test/t.jpg', id: 2 } })),
    sec('counters', w('counter', { title: 'Clienti' }), w('counter', { title: 'Progetti' })),
    sec('reviews', w('heading', { title: 'Dicono di noi' }), w('testimonial', { testimonial_content: 'Ottimo', testimonial_name: 'Demo' })),
    sec('gallery', w('heading', { title: 'I nostri lavori' }), w('image-gallery', { wp_gallery: [{ id: 1, url: 'https://d.test/g.jpg' }] })),
    sec('logos', ...[1, 2, 3, 4, 5].map((i) => w('image', { image: { url: `https://d.test/l${i}.png`, id: i } }))),
    sec('cta', w('heading', { title: 'Pronto a iniziare?' }), w('button', { text: 'Chiama' })),
    sec('pricing', w('price-table', { heading: 'Base' })),
    sec('blog', w('heading', { title: 'Ultimi articoli' }), w('posts', {})),
  ],
};

test('home: only hero, about, services, gallery (and reviews when there are real ones) are kept', () => {
  const kinds = Object.fromEntries(classifySections(HOME, 'home').map((s) => [s.id, s.kind]));
  assert.deepEqual(kinds, {
    hero: 'hero', about: 'about', services: 'services', faq: 'faq', team: 'team', counters: 'counters', reviews: 'testimonials',
    gallery: 'gallery', logos: 'clients', cta: 'generic', pricing: 'pricing', blog: 'blog',
  });
  const kept = (opts) => classifySections(HOME, 'home', opts).filter((s) => !s.autoRemove).map((s) => s.id);
  assert.deepEqual(kept({ hasReviews: false }), ['hero', 'about', 'services', 'gallery']);
  assert.deepEqual(kept({ hasReviews: true }), ['hero', 'about', 'services', 'reviews', 'gallery']);
  // Header / footer are never cut
  assert.ok(classifySections(HOME, 'footer').every((s) => !s.autoRemove));
});

test('kit plugins: free ones by folder, Elementor itself skipped, Pro flagged by slug', () => {
  const list = kitPlugins({
    required_plugins: [
      { name: 'Elementor', file: 'elementor/elementor.php' },
      { name: 'ElementsKit Lite', file: 'elementskit-lite/elementskit-lite.php' },
      { name: 'Elementor Pro', file: 'elementor-pro/elementor-pro.php' },
      { name: 'MetForm' },
    ],
  });
  assert.deepEqual(list, [
    { name: 'ElementsKit Lite', slug: 'elementskit-lite', file: 'elementskit-lite/elementskit-lite.php' },
    { name: 'Elementor Pro', slug: 'elementor-pro', file: 'elementor-pro/elementor-pro.php' },
    { name: 'MetForm', slug: 'metform', file: '' },
  ]);
  assert.deepEqual(kitPlugins({ plugins: [{ name: 'Jeg Elementor Kit', plugin: 'jeg-elementor-kit/jeg-elementor-kit.php' }] }), [{ name: 'Jeg Elementor Kit', slug: 'jeg-elementor-kit', file: 'jeg-elementor-kit/jeg-elementor-kit.php' }]);
});

test('kit project: sections removed automatically, review texts come from the real reviews', async () => {
  const p = await api('POST', '/projects', { site_name: 'Studio Rossi' });
  const kform = new FormData();
  kform.append('file', new Blob([fs.readFileSync(SAMPLE_KIT)]), 'sample.zip');
  const kit = await api('POST', '/kits', kform);
  await api('PUT', `/projects/${p.id}/kit`, { kit_id: kit.id });
  await api('PATCH', `/projects/${p.id}`, { phone: '+39 06 1234 567', email: 'info@rossi.it', address: 'Via Po 1, Roma', settings: { layout: 'kit' } });

  const home = async () => (await api('GET', `/projects/${p.id}/kit-mapping`)).templates.find((t) => t.role === 'home');
  let tpl = await home();
  const reviews = tpl.sections.find((s) => s.kind === 'testimonials');
  assert.ok(reviews, 'the sample kit home has a reviews section');
  assert.equal(reviews.removed, true, 'no reviews entered: the reviews section is removed');
  assert.ok(tpl.sections.every((s) => s.auto));

  // With real reviews the section is kept and filled with them (never by the AI)
  await api('PATCH', `/projects/${p.id}`, { settings: { reviews: [{ name: 'Anna B.', role: 'Cliente', text: 'Lavoro impeccabile, consigliatissimi.' }] } });
  tpl = await home();
  assert.equal(tpl.sections.find((s) => s.kind === 'testimonials').removed, false);
  const provider = await api('POST', '/providers', { type: 'mock' });
  await api('PATCH', `/projects/${p.id}`, { settings: { generation: { providerId: provider.id } } });
  let gen = await api('POST', `/projects/${p.id}/generations`);
  while (['queued', 'running'].includes(gen.status)) {
    await new Promise((r) => setTimeout(r, 150));
    gen = await api('GET', `/generations/${gen.id}`);
  }
  assert.equal(gen.status, 'completed', gen.error || '');
  const fields = gen.pages.find((x) => x.key === 'home').fields.filter((f) => f.widget === 'testimonial');
  assert.ok(fields.length >= 2);
  for (const f of fields) assert.equal(f.source, 'auto', `${f.id} is not written by the AI`);
  assert.ok(fields.some((f) => f.value === 'Anna B.'));
  assert.ok(fields.some((f) => /Lavoro impeccabile/.test(f.value)));

  // Choosing sections by hand overrides the automatic choice, and can be reset
  await api('PUT', `/projects/${p.id}/kit-mapping`, { template_id: tpl.id, removed_sections: [] });
  tpl = await home();
  assert.ok(tpl.sections.every((s) => !s.auto && !s.removed));
  await api('PUT', `/projects/${p.id}/kit-mapping`, { template_id: tpl.id, removed_sections: null });
  assert.ok((await home()).sections.every((s) => s.auto));

  // The plugin receives the kit plugins (the sample kit only needs Elementor itself)
  const exp = await api('POST', `/generations/${gen.id}/export`);
  const zip = new AdmZip(Buffer.from(await (await fetch(base.replace('/api', '') + exp.pluginDownload)).arrayBuffer()));
  const site = JSON.parse(zip.readAsText('studio-rossi-site/data/site.json'));
  assert.deepEqual(site.kitPlugins, []);
  assert.match(zip.readAsText('studio-rossi-site/studio-rossi-site.php'), /function plugin_file_for_slug/);
});
