/**
 * End-to-end flow through the HTTP API with the offline mock provider and the sample kit:
 * project -> services -> images -> kit -> provider -> generation -> edit -> export -> inspect zip.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'esg-e2e-'));
process.env.STORAGE_DIR = storage;
process.env.ENCRYPTION_KEY ||= 'b'.repeat(64);

const { default: app } = await import('../src/app.js');
const { default: sharp } = await import('sharp');
const { AdmZip } = await import('../src/lib/zip.js');

const SAMPLE_KIT = path.resolve(__dirname, '../../samples/sample-elementor-kit.zip');
let server;
let base;

before(async () => {
  if (!fs.existsSync(SAMPLE_KIT)) throw new Error('Run `npm run sample-kit` first');
  await new Promise((r) => (server = app.listen(0, '127.0.0.1', r)));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server?.close());

async function api(method, url, body) {
  const isForm = body instanceof FormData;
  const res = await fetch(base + url, {
    method,
    headers: body && !isForm ? { 'content-type': 'application/json' } : {},
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  const text = await res.text();
  const data = text ? (res.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text) : null;
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}: ${text}`);
  return data;
}

const png = (color) => sharp({ create: { width: 2400, height: 1200, channels: 3, background: color } }).png().toBuffer();

test('full generation flow (English, unmapped pages, WordPress plugin)', async () => {
  // 1. Project + site data
  const project = await api('POST', '/projects', { site_name: 'Rossi Idraulica' });
  await api('PATCH', `/projects/${project.id}`, { settings: { autoRemoveSections: false } }); // sections chosen by hand in this test
  const pid = project.id;
  let p = await api('PATCH', `/projects/${pid}`, {
    phone: '+39 06 1234 5678',
    email: 'info@rossi-idraulica.it',
    address: 'Via Roma 1, Roma',
    city: 'Roma',
    industry: 'Plumber',
    language: 'en',
    image_base_url: 'https://rossi-idraulica.it/wp-content/uploads/2026/10',
  });
  assert.equal(p.readiness.ready, false, 'no kit/provider yet');

  // 2. Services
  const s1 = await api('POST', `/projects/${pid}/services`, { name: 'Riparazione caldaie', description: 'Riparazioni rapide' });
  const s2 = await api('POST', `/projects/${pid}/services`, { name: 'Bagni su misura' });
  assert.equal(s1.slug, 'riparazione-caldaie');

  // 3. Images (one invalid file must be rejected)
  const form = new FormData();
  for (const [name, color] of [['hero.png', '#f00'], ['sub.png', '#0f0'], ['s1.png', '#00f'], ['s2.png', '#ff0'], ['logo.png', '#000']]) {
    form.append('files', new Blob([await png(color)], { type: 'image/png' }), name);
  }
  form.append('files', new Blob(['not an image'], { type: 'image/png' }), 'fake.png');
  const up = await (await fetch(`${base}/projects/${pid}/images`, { method: 'POST', body: form })).json();
  assert.equal(up.created.length, 5);
  assert.equal(up.errors.length, 1);
  const [hero, sub, i1, i2, logo] = up.created;
  await api('PATCH', `/images/${hero.id}`, { role: 'hero_home', alt_text: 'Idraulico a Roma' });
  await api('PATCH', `/images/${sub.id}`, { role: 'subheader' });
  await api('PATCH', `/images/${i1.id}`, { role: `service:${s1.slug}` });
  await api('PATCH', `/images/${i2.id}`, { role: 'service', service_id: s2.id });
  await api('PATCH', `/images/${logo.id}`, { role: 'logo' });
  const renamed = await api('POST', `/projects/${pid}/images/seo-rename`);
  assert.ok(renamed.find((i) => i.id === i1.id).file_name.startsWith('plumber-roma-riparazione-caldaie'));

  // Download all the uploaded images (originals, current names)
  const imgRes = await fetch(`${base}/projects/${pid}/images/download`);
  assert.equal(imgRes.status, 200);
  assert.match(imgRes.headers.get('content-disposition'), /rossi-idraulica-images\.zip/);
  const imgZip = new AdmZip(Buffer.from(await imgRes.arrayBuffer()));
  const imgNames = imgZip.getEntries().map((e) => e.entryName).sort();
  assert.equal(imgNames.length, 5);
  assert.ok(imgNames.includes('plumber-roma-riparazione-caldaie.png'), imgNames.join(', '));
  assert.equal((await sharp(imgZip.readFile('plumber-roma-riparazione-caldaie.png')).metadata()).width, 2400, 'original file, not resized');
  const empty = await api('POST', '/projects', { site_name: 'Empty' });
  assert.equal((await fetch(`${base}/projects/${empty.id}/images/download`)).status, 404);
  await api('DELETE', `/projects/${empty.id}`);

  // 4. Kit
  const kform = new FormData();
  kform.append('file', new Blob([fs.readFileSync(SAMPLE_KIT)], { type: 'application/zip' }), 'sample.zip');
  const kit = await (await fetch(`${base}/kits`, { method: 'POST', body: kform })).json();
  assert.equal(kit.format, 'template-kit');
  assert.equal(kit.templates.length, 10);
  assert.ok(kit.contacts.emails.includes('hello@plumbix-demo.com'));
  await api('PUT', `/projects/${pid}/kit`, { kit_id: kit.id });
  for (const t of kit.templates.filter((x) => ['Our Services', 'Gallery', 'Single Post'].includes(x.title))) {
    await api('PUT', `/projects/${pid}/kit-mapping`, { template_id: t.id, page_role: 'ignore' });
  }
  const mapping = await api('GET', `/projects/${pid}/kit-mapping`);
  const roleOf = (title) => mapping.templates.find((t) => t.title === title).role;
  assert.equal(roleOf('Home'), 'home');
  assert.equal(roleOf('Service Single'), 'ignore', 'no page per service: services are articles');
  assert.equal(roleOf('Global Kit Styles'), 'ignore');
  assert.ok(!mapping.pageRoles.includes('service') && !mapping.pageRoles.includes('other'));
  await assert.rejects(api('PUT', `/projects/${pid}/kit-mapping`, { template_id: mapping.templates[0].id, page_role: 'other' }), /Invalid page role/);
  // One template per page: mapping a second template as "about" un-maps the first one
  const aboutTpl = mapping.templates.find((t) => t.title === 'About Us');
  await api('PUT', `/projects/${pid}/kit-mapping`, { template_id: mapping.templates.find((t) => t.title === 'Service Single').id, page_role: 'about' });
  assert.equal((await api('GET', `/projects/${pid}/kit-mapping`)).templates.find((t) => t.id === aboutTpl.id).role, 'ignore');
  await api('PUT', `/projects/${pid}/kit-mapping`, { template_id: mapping.templates.find((t) => t.title === 'Service Single').id, page_role: 'ignore' });
  await api('PUT', `/projects/${pid}/kit-mapping`, { template_id: aboutTpl.id, page_role: 'about' });
  // Home: service cards get the service images in order by default, testimonial photo is kept
  const homeTpl = mapping.templates.find((t) => t.title === 'Home');
  const cardSlots = homeTpl.slots.filter((s) => s.label.startsWith('image-box'));
  assert.equal(cardSlots.length, 2, "home shows one card per service (max the cards of the template)");
  for (const s of cardSlots) assert.equal(homeTpl.slotRoles[s.id], 'service_list');
  assert.equal(homeTpl.slotRoles[homeTpl.slots.find((s) => s.label.startsWith('testimonial')).id], 'keep');
  // Overrides are saved per slot
  const aboutImg = homeTpl.slots.find((s) => s.label.startsWith('image ·'));
  await api('PUT', `/projects/${pid}/kit-mapping`, { template_id: homeTpl.id, image_slots: { [aboutImg.id]: 'keep' } });
  const mapping2 = await api('GET', `/projects/${pid}/kit-mapping`);
  assert.equal(mapping2.templates.find((t) => t.id === homeTpl.id).slotRoles[aboutImg.id], 'keep');

  // 5. Provider (mock) + prompt selection
  const provider = await api('POST', '/providers', { type: 'mock', name: 'Demo' });
  assert.equal(provider.has_key, false);
  assert.equal((await api('POST', `/providers/${provider.id}/test`)).ok, true);
  const real = await api('POST', '/providers', { type: 'anthropic', api_key: 'sk-ant-test-key-9876', model: 'claude-sonnet-5' });
  assert.equal(real.key_hint, 'sk-...9876');
  assert.ok(!JSON.stringify(await api('GET', '/providers')).includes('test-key'), 'key never returned');

  p = await api('PATCH', `/projects/${pid}`, {
    settings: { layout: 'kit', generation: { providerId: provider.id }, demoValues: { brand: 'Plumbix', address: '123 Demo Street, Springfield' } },
  });
  assert.equal(p.readiness.ready, true, JSON.stringify(p.readiness.items));
  const kitWarnings = p.readiness.items.filter((i) => i.step === 'kit').map((i) => i.message);
  assert.ok(kitWarnings.some((m) => /Gallery page: the WordPress plugin creates it with a standard WordPress gallery/.test(m)), kitWarnings.join('\n'));
  assert.ok(kitWarnings.some((m) => /Services page: the WordPress plugin creates it empty/.test(m)), kitWarnings.join('\n'));

  // One built-in prompt for every site: it cannot be uploaded, created or chosen
  const sitePrompt = await api('GET', '/prompts/site');
  assert.equal(sitePrompt.name, 'Sito completo Elementor (IT)');
  for (const [method, url] of [['GET', '/prompts'], ['POST', '/prompts'], ['POST', '/prompts/upload'], ['DELETE', '/prompts/1']]) {
    assert.equal((await fetch(base + url, { method })).status, 404, `${method} ${url} is gone`);
  }
  const preview = await api('POST', '/prompts/preview', { projectId: pid, content: 'Hello {{site_name}}' });
  assert.match(preview.prompt, /^# Prompt – Creazione sito web WordPress con Elementor Template Kit/, 'custom content is ignored');
  assert.match(preview.prompt, /\| Nome sito \| `Rossi Idraulica` \|/);
  assert.match(preview.prompt, /OUTPUT FORMAT/);
  assert.match(preview.prompt, /Values: strings written in English/, 'the site language wins over the Italian text of the prompt');

  const plan = await api('GET', `/projects/${pid}/plan`);
  assert.deepEqual(
    plan.pages.map((pg) => pg.key),
    ['home', 'about', 'contact', `post-${s1.slug}`, `post-${s2.slug}`, 'header', 'footer']
  );
  assert.ok(plan.estimatedTokens > 0);
  assert.ok(plan.pages.every((pg) => pg.prompt === 'Sito completo Elementor (IT)'), 'same prompt for every page and article');

  // 6. Generation
  let gen = await api('POST', `/projects/${pid}/generations`);
  for (let i = 0; i < 100 && ['queued', 'running'].includes(gen.status); i++) {
    await new Promise((r) => setTimeout(r, 200));
    gen = await api('GET', `/generations/${gen.id}`);
  }
  assert.equal(gen.status, 'completed', gen.error || '');
  assert.equal(gen.pages_done, 7);
  const home = gen.pages.find((pg) => pg.key === 'home');
  assert.ok(home.seo.title);
  const phoneField = home.fields.find((f) => f.original === '+1 (555) 010-2030');
  assert.equal(phoneField.source, 'auto');
  assert.equal(phoneField.value, '+39 06 1234 5678');

  // 7. Manual edit + single field regeneration
  const titleField = home.fields.find((f) => f.id === 'home.hero.heading1.title');
  await api('PATCH', `/generations/${gen.id}/pages/home`, { fields: { [titleField.id]: 'Idraulico a Roma 24/7' } });
  const regen = await api('POST', `/generations/${gen.id}/pages/about/fields/regenerate`, { fieldId: 'about.intro.heading1.title' });
  assert.ok(regen.fields.find((f) => f.id === 'about.intro.heading1.title').value);

  // 8. Export + inspect
  const exp = await api('POST', `/generations/${gen.id}/export`);
  assert.equal(exp.pages, 5, 'home, about, contact, header, footer');
  assert.equal(exp.posts, 2);
  assert.equal(exp.plugin, 'rossi-idraulica-site.zip');
  const zipRes = await fetch(base.replace('/api', '') + exp.download);
  const zip = new AdmZip(Buffer.from(await zipRes.arrayBuffer()));
  const names = zip.getEntries().map((e) => e.entryName);
  const root = 'output-rossi-idraulica/';
  for (const f of ['rossi-idraulica-site.zip', 'elementor-kit.zip', 'content.md', 'seo.csv', 'INSTRUCTIONS.md', 'CHECKS.md', 'menu.md', 'wordpress-import.xml', 'templates/home.json', 'templates/header.json']) {
    assert.ok(names.includes(root + f), `missing ${f}`);
  }
  assert.ok(!names.some((n) => n.startsWith(root + 'templates/service-')), 'no service pages');
  assert.match(zip.readAsText(root + 'INSTRUCTIONS.md'), /Upload Plugin\*\* → choose `rossi-idraulica-site\.zip`/);
  assert.equal(names.filter((n) => n.startsWith(root + 'images/') && n.endsWith('.webp')).length, 7, '5 images + hero and subheader crops');
  // Home hero and page subheaders: images cropped to their exact size
  for (const [file, width, height] of [['plumber-roma-home-hero.webp', 1920, 1080], ['plumber-roma-banner-subheader.webp', 1920, 600]]) {
    const meta = await sharp(zip.readFile(root + 'images/' + file)).metadata();
    assert.deepEqual([meta.width, meta.height], [width, height], file);
  }
  assert.equal((await sharp(zip.readFile(root + 'images/plumber-roma-home.webp')).metadata()).height, 960, 'the full photo is kept for the gallery');

  const homeJson = zip.readAsText(root + 'templates/home.json');
  const homeDoc = JSON.parse(homeJson);
  assert.equal(homeDoc.type, 'page');
  assert.equal(homeDoc.content[0].settings.background_image.url, 'https://rossi-idraulica.it/wp-content/uploads/2026/10/plumber-roma-home-hero.webp');
  const aboutDoc = JSON.parse(zip.readAsText(root + 'templates/about.json'));
  assert.equal(aboutDoc.content[0].settings.background_image.url, 'https://rossi-idraulica.it/wp-content/uploads/2026/10/plumber-roma-banner-subheader.webp');
  assert.match(homeJson, /Idraulico a Roma 24\/7/);
  assert.doesNotMatch(homeJson, /plumbix-demo\.com|555\) 010|Plumbix|123 Demo Street/);
  assert.match(homeJson, /tel:\+390612345678/);
  assert.match(homeJson, /plumber-roma-riparazione-caldaie\.webp/, 'service_list slot uses the 1st service image');

  const inner = new AdmZip(zip.readFile(root + 'elementor-kit.zip'));
  const manifest = JSON.parse(inner.readAsText('manifest.json'));
  const names2 = manifest.templates.map((t) => t.name);
  assert.ok(!names2.includes('Service Single') && names2.includes('Global Kit Styles'), names2.join(','));
  for (const t of manifest.templates) assert.ok(inner.getEntry(t.source), `kit file ${t.source} exists`);

  const csv = zip.readAsText(root + 'seo.csv');
  assert.match(csv, /"\/riparazione-caldaie\/"/);

  // WordPress plugin: same file in the zip and from its own download link
  const pluginRes = await fetch(base.replace('/api', '') + exp.pluginDownload);
  assert.equal(pluginRes.status, 200);
  const plugin = new AdmZip(Buffer.from(await pluginRes.arrayBuffer()));
  const entryNames = (z) => z.getEntries().map((e) => e.entryName).sort();
  assert.deepEqual(entryNames(plugin), entryNames(new AdmZip(zip.readFile(root + 'rossi-idraulica-site.zip'))));
  const pr = 'rossi-idraulica-site/';
  const php = plugin.readAsText(pr + 'rossi-idraulica-site.php');
  assert.match(php, /Plugin Name: Rossi Idraulica – Site builder/);
  assert.match(php, /Requires Plugins: elementor/);
  assert.match(php, /^namespace ESG\\Site_[0-9a-f]{8};$/m);
  assert.doesNotMatch(php, /\{\{[A-Z_]+\}\}/, 'no unfilled placeholder');
  const site = JSON.parse(plugin.readAsText(pr + 'data/site.json'));
  assert.deepEqual(site.pages.map((x) => [x.role, x.title, x.slug]), [
    ['home', 'Home', 'home'],
    ['about', 'About Us', 'about-us'],
    ['services', 'Services', 'services'],
    ['gallery', 'Gallery', 'gallery'],
    ['contact', 'Contact', 'contact'],
  ]);
  assert.deepEqual(site.pages.map((x) => Boolean(x.elementor)), [true, true, false, false, true], 'unmapped pages are created without template');
  assert.deepEqual(site.posts.map((x) => [x.title, x.slug, x.image]), [
    ['Riparazione caldaie', 'riparazione-caldaie', 'plumber-roma-riparazione-caldaie.webp'],
    ['Bagni su misura', 'bagni-su-misura', 'plumber-roma-bagni-su-misura.webp'],
  ]);
  assert.ok(site.posts.every((x) => x.content.length > 100 && x.seo));
  assert.equal(site.images.length, 7);
  assert.equal(site.images.filter((i) => i.photo).length, 4, 'every image except the logo is a gallery photo');
  assert.equal(site.logo, site.images.find((i) => !i.photo).file);
  for (const img of site.images) assert.ok(plugin.getEntry(pr + 'images/' + img.file), `bundled ${img.file}`);
  assert.deepEqual(site.templates.map((x) => x.type), ['header', 'footer']);
  assert.deepEqual(site.globalStyles, { system_colors: [{ _id: 'primary', title: 'Primary', color: '#0B2545' }] });
  assert.equal(site.menu.slug, 'main-menu');
  assert.equal(site.ui.run, 'Create the website');
  const pluginHome = plugin.readAsText(pr + 'data/elementor/home.json');
  assert.match(pluginHome, /"url":"esg-image:\/\/plumber-roma-home[^"]*\.webp"/, 'images point to the bundled files');
  assert.doesNotMatch(pluginHome, /rossi-idraulica\.it\/wp-content|demo\.example\.com/, 'no base URL / demo image in the plugin');
  assert.match(pluginHome, /Idraulico a Roma 24\/7/);

  // 9. Duplicate + delete project
  const copy = await api('POST', `/projects/${pid}/duplicate`);
  assert.equal(copy.site_name, 'Rossi Idraulica (copy)');
  await api('DELETE', `/projects/${copy.id}`);
});

test('kit upload rejects zip-slip archives', async () => {
  const evil = new AdmZip();
  evil.addFile('manifest.json', Buffer.from('{"templates":[]}'));
  evil.addFile('placeholder.txt', Buffer.from('x'));
  // adm-zip normalizes names on addFile, so patch the entry name afterwards
  evil.getEntry('placeholder.txt').entryName = '../../evil.txt';
  const form = new FormData();
  form.append('file', new Blob([evil.toBuffer()]), 'evil.zip');
  const res = await fetch(`${base}/kits`, { method: 'POST', body: form });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /Unsafe path/);
  assert.ok(!fs.existsSync(path.join(storage, '..', 'evil.txt')));
});

test('website-kit format: only the site pages are kept in the kit manifest', async () => {
  const el = (widgetType, settings) => ({ id: Math.random().toString(16).slice(2, 9), elType: 'widget', widgetType, settings, elements: [] });
  const page = (title, extra = []) => ({
    content: [
      { id: 'c1', elType: 'container', settings: { background_background: 'classic', background_image: { url: 'https://demo.test/bg.jpg', id: 1 } }, elements: [el('heading', { title }), el('text-editor', { editor: '<p>Call 555-123-4567 today</p>' }), ...extra] },
    ],
    settings: { hide_title: 'yes' },
    metadata: [],
  });
  const kitZip = new AdmZip();
  kitZip.addFile('manifest.json', Buffer.from(JSON.stringify({
    name: 'demo', title: 'Demo Website Kit', version: '3.0',
    templates: { 10: { title: 'Main Header', doc_type: 'header', location: 'header' } },
    content: { page: { 20: { title: 'Home', doc_type: 'wp-page', show_on_front: true }, 21: { title: 'Service', doc_type: 'wp-page' } } },
  })));
  kitZip.addFile('templates/10.json', Buffer.from(JSON.stringify(page('Header', [el('image', { image: { url: 'https://demo.test/logo.png', id: 2 } })]))));
  kitZip.addFile('content/page/20.json', Buffer.from(JSON.stringify(page('Welcome home'))));
  kitZip.addFile('content/page/21.json', Buffer.from(JSON.stringify(page('Our service'))));

  const form = new FormData();
  form.append('file', new Blob([kitZip.toBuffer()]), 'website-kit.zip');
  const kit = await (await fetch(`${base}/kits`, { method: 'POST', body: form })).json();
  assert.equal(kit.format, 'website-kit');
  assert.deepEqual(kit.templates.map((t) => t.suggestedRole).sort(), ['header', 'home', 'ignore']);

  const p = await api('POST', '/projects', { site_name: 'Kit Two' });
  await api('PATCH', `/projects/${p.id}`, { settings: { autoRemoveSections: false } });
  const provider = await api('POST', '/providers', { type: 'mock' });
  await api('PATCH', `/projects/${p.id}`, { phone: '+1 212 555 0199', email: 'a@b.co', address: 'X', language: 'en', settings: { layout: 'kit', generation: { providerId: provider.id } } });
  for (const name of ['Alpha', 'Beta']) await api('POST', `/projects/${p.id}/services`, { name });
  await api('PUT', `/projects/${p.id}/kit`, { kit_id: kit.id });

  let gen = await api('POST', `/projects/${p.id}/generations`);
  while (['queued', 'running'].includes(gen.status)) {
    await new Promise((r) => setTimeout(r, 150));
    gen = await api('GET', `/generations/${gen.id}`);
  }
  assert.equal(gen.status, 'completed');
  const exp = await api('POST', `/generations/${gen.id}/export`);
  const zip = new AdmZip(Buffer.from(await (await fetch(base.replace('/api', '') + exp.download)).arrayBuffer()));
  const inner = new AdmZip(zip.readFile('output-kit-two/elementor-kit.zip'));
  const manifest = JSON.parse(inner.readAsText('manifest.json'));
  const pages = Object.entries(manifest.content.page);
  assert.deepEqual(pages.map(([, v]) => v.title), ['Home'], 'the "Service" page of the kit is dropped');
  for (const [id] of pages) assert.ok(inner.getEntry(`content/page/${id}.json`), `content/page/${id}.json`);
  assert.doesNotMatch(inner.readAsText('content/page/20.json'), /555-123-4567/, 'demo phone removed');
  const header = JSON.parse(zip.readAsText('output-kit-two/templates/header.json'));
  assert.equal(header.type, 'header');
  assert.deepEqual(header.page_settings, { hide_title: 'yes' });
});

test('Gallery library: categories, upload, pick images in a project', async () => {
  const kitchens = await api('POST', '/library/categories', { name: 'Kitchens' });
  const baths = await api('POST', '/library/categories', { name: 'Bathrooms' });
  await assert.rejects(api('POST', '/library/categories', { name: 'kitchens' }), /already exists/);
  await assert.rejects(api('POST', '/library/categories', { name: '  ' }), /400/);

  const upload = async (category, names) => {
    const form = new FormData();
    if (category) form.append('category_id', String(category));
    for (const n of names) form.append('files', new Blob([await png('#336699')]), n);
    return api('POST', '/library/images', form);
  };
  const k = await upload(kitchens.id, ['Kitchen One.png', 'kitchen-two.png']);
  assert.equal(k.created.length, 2);
  assert.equal(k.created[0].file_name, 'kitchen-one.png');
  assert.equal(k.created[0].category_id, kitchens.id);
  const loose = await upload(null, ['misc.png']);
  assert.equal(loose.created[0].category_id, null);

  let cats = await api('GET', '/library/categories');
  assert.equal(cats.total, 3);
  assert.equal(cats.uncategorized, 1);
  assert.deepEqual(cats.categories.map((c) => [c.name, c.image_count]), [['Bathrooms', 0], ['Kitchens', 2]]);
  assert.equal((await api('GET', `/library/images?category=${kitchens.id}`)).length, 2);
  assert.equal((await api('GET', '/library/images?category=none')).length, 1);

  // Move to another category, edit ALT; the file is served
  const moved = await api('PATCH', `/library/images/${loose.created[0].id}`, { category_id: baths.id, alt_text: 'Modern bathroom' });
  assert.equal(moved.category_id, baths.id);
  assert.equal((await fetch(`${base}/library/images/${moved.id}/file`)).headers.get('content-type'), 'image/png');

  // Pick from the Gallery in a new project: copied with ALT text, duplicates skipped
  const p = await api('POST', '/projects', { site_name: 'Library Test' });
  const ids = [k.created[0].id, moved.id];
  const added = await api('POST', `/projects/${p.id}/images/from-library`, { ids });
  assert.equal(added.created.length, 2);
  assert.equal(added.created[1].alt_text, 'Modern bathroom');
  assert.equal(added.created[1].library_image_id, moved.id);
  assert.equal(added.created[0].width, 2400);
  const again = await api('POST', `/projects/${p.id}/images/from-library`, { ids: [...ids, k.created[1].id] });
  assert.deepEqual([again.created.length, again.skipped], [1, 2]);

  // Deleting from the Gallery (or a category) leaves the project's copy intact
  await api('DELETE', `/library/images/${moved.id}`);
  await api('DELETE', `/library/categories/${kitchens.id}`);
  cats = await api('GET', '/library/categories');
  assert.deepEqual([cats.total, cats.uncategorized], [2, 2]);
  const projImages = await api('GET', `/projects/${p.id}/images`);
  assert.equal(projImages.length, 3);
  for (const img of projImages) assert.equal((await fetch(`${base}/images/${img.id}/file`)).status, 200);
});
