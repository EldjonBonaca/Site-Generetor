/**
 * End-to-end test of the Italian full-site prompt ("Sito completo Elementor (IT)"):
 * Home / Chi Siamo / Servizi / Galleria / Contatti, services as articles (WXR), header/footer,
 * removed sections, card cloning, contact form shortcode, map, menu and final checks.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'esg-it-'));
process.env.ENCRYPTION_KEY ||= 'c'.repeat(64);

const { default: app } = await import('../src/app.js');
const { default: sharp } = await import('sharp');
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
  const res = await fetch(base + url, {
    method,
    headers: body && !isForm ? { 'content-type': 'application/json' } : {},
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}
const png = (color) => sharp({ create: { width: 800, height: 500, channels: 3, background: color } }).png().toBuffer();

test('Italian full site: articles, gallery, contact form, menu, final checks', async () => {
  const p = await api('POST', '/projects', { site_name: 'Edil Bianchi' });
  await api('PATCH', `/projects/${p.id}`, { settings: { autoRemoveSections: false } });
  assert.equal(p.language, 'it', 'new projects default to Italian');
  const pid = p.id;
  await api('PATCH', `/projects/${pid}`, {
    phone: '+39 02 1234 567',
    email: 'info@edilbianchi.it',
    address: 'Via Milano 10\n20100 Milano',
    copyright: '© 2026 Edil Bianchi S.r.l. – P.IVA 01234567890',
    image_base_url: 'https://edilbianchi.it/wp-content/uploads/2026/10/',
  });
  const services = [];
  for (const name of ['Ristrutturazioni', 'Impianti idraulici', 'Tinteggiature', 'Cartongesso', 'Pavimenti']) {
    services.push(await api('POST', `/projects/${pid}/services`, { name }));
  }

  // Images: logo, hero, subheader, one per service, 2 extra
  const fd = new FormData();
  const colors = ['#111', '#222', '#333', '#444', '#555', '#666', '#777', '#888', '#999', '#aaa'];
  for (const [i, c] of colors.entries()) fd.append('files', new Blob([await png(c)], { type: 'image/png' }), `foto-${i}.png`);
  const { created } = await api('POST', `/projects/${pid}/images`, fd);
  await api('PATCH', `/images/${created[0].id}`, { role: 'logo', alt_text: 'Logo' });
  await api('PATCH', `/images/${created[1].id}`, { role: 'hero_home', alt_text: 'Cantiere' });
  await api('PATCH', `/images/${created[2].id}`, { role: 'subheader', alt_text: 'Banner' });
  for (const [i, s] of services.entries()) await api('PATCH', `/images/${created[3 + i].id}`, { role: 'service', service_id: s.id, alt_text: s.name });
  await api('POST', `/projects/${pid}/images/seo-rename`);

  // Kit + roles
  const kform = new FormData();
  kform.append('file', new Blob([fs.readFileSync(SAMPLE_KIT)]), 'sample.zip');
  const kit = await api('POST', '/kits', kform);
  await api('PUT', `/projects/${pid}/kit`, { kit_id: kit.id });
  let mapping = await api('GET', `/projects/${pid}/kit-mapping`);
  const tpl = (title) => mapping.templates.find((t) => t.title === title);
  assert.deepEqual(
    ['Home', 'About Us', 'Our Services', 'Gallery', 'Contact', 'Single Post', 'Header', 'Footer', 'Service Single'].map((t) => tpl(t).role),
    ['home', 'about', 'services', 'gallery', 'contact', 'single_post', 'header', 'footer', 'ignore']
  );
  assert.equal(tpl('Our Services').cardCount, 5, 'services grid cloned to one card per service');
  assert.equal(tpl('Home').cardCount, 3, 'home keeps 3 featured services');

  // Remove the extra section of the services page ("only one section: all services")
  const extra = tpl('Our Services').sections.find((s) => /Not sure/.test(s.label));
  await api('PUT', `/projects/${pid}/kit-mapping`, { template_id: tpl('Our Services').id, removed_sections: [extra.id] });
  mapping = await api('GET', `/projects/${pid}/kit-mapping`);
  assert.equal(tpl('Our Services').sections.find((s) => s.id === extra.id).removed, true);

  // Provider + the Italian full-site prompt for every page type
  const provider = await api('POST', '/providers', { type: 'mock' });
  await api('PATCH', `/projects/${pid}`, {
    settings: { layout: 'kit', generation: { providerId: provider.id }, demoValues: { brand: 'Plumbix', address: '123 Demo Street, Springfield' } },
  });

  // The built-in site prompt is used automatically
  const preview = await api('POST', '/prompts/preview', { projectId: pid, pageKey: 'about' });
  assert.match(preview.prompt, /\| Nome sito \| `Edil Bianchi` \|/);
  assert.match(preview.prompt, /5\. `Pavimenti`/, '{{SERVIZIO_N}} expanded for the 5th service');
  assert.match(preview.prompt, /\| Servizio 4 – `Cartongesso` \| `[^`]*cartongesso[^`]*\.webp/, 'table row expanded with image file name');
  assert.match(preview.prompt, /Via%20Milano%2010%2C%2020100%20Milano/);
  assert.match(preview.prompt, /\/chi-siamo\//);
  assert.match(preview.prompt, /overrides any output format requested above/);
  assert.doesNotMatch(preview.prompt, /\{\{[A-Z_]+\}\}/, 'no unresolved Italian variable');

  const plan = await api('GET', `/projects/${pid}/plan`);
  assert.deepEqual(
    plan.pages.map((x) => x.key),
    ['home', 'about', 'services', 'gallery', 'contact', ...services.map((s) => `post-${s.slug}`), 'single-post', 'header', 'footer']
  );
  assert.deepEqual(plan.pages.slice(0, 5).map((x) => x.title), ['Home', 'Chi Siamo', 'Servizi', 'Galleria', 'Contatti']);
  assert.equal(plan.readiness.ready, true, JSON.stringify(plan.readiness.items));
  const sizeWarnings = plan.readiness.items.filter((i) => /may look blurry/.test(i.message)).map((i) => i.message);
  assert.equal(sizeWarnings.length, 2, 'the 800×500 hero and subheader photos are smaller than their crop');
  assert.match(sizeWarnings[0], /is 800×500px: it is cropped to 1920×1080px/);
  assert.match(sizeWarnings[1], /is 800×500px: it is cropped to 1920×600px/);

  let gen = await api('POST', `/projects/${pid}/generations`);
  while (['queued', 'running'].includes(gen.status)) {
    await new Promise((r) => setTimeout(r, 150));
    gen = await api('GET', `/generations/${gen.id}`);
  }
  assert.equal(gen.status, 'completed', gen.error || '');
  const about = gen.pages.find((x) => x.key === 'about');
  assert.equal(about.fields.find((f) => f.id === 'about.intro.heading1.title').value, 'Chi Siamo', 'subheader title = page title');
  const post = gen.pages.find((x) => x.role === 'post');
  assert.ok(post.fields.find((f) => f.id === 'post.content').value.replace(/<[^>]+>/g, '').length >= 300);
  for (const pg of gen.pages) for (const f of pg.fields.filter((x) => x.format === 'link')) {
    assert.ok(gen.links.some((l) => l.url === f.value), `${f.id}: ${f.value} is a site link`);
  }

  const exp = await api('POST', `/generations/${gen.id}/export`);
  assert.equal(exp.posts, 5);
  assert.ok(!exp.checks.some((c) => c.level === 'error'), JSON.stringify(exp.checks));
  const zip = new AdmZip(Buffer.from(await (await fetch(base.replace('/api', '') + exp.download)).arrayBuffer()));
  const root = 'output-edil-bianchi/';
  const files = zip.getEntries().map((e) => e.entryName.slice(root.length));
  for (const f of ['ISTRUZIONI.md', 'CONTROLLI.md', 'menu.md', 'wordpress-import.xml', 'templates/home.json', 'templates/about.json', 'templates/services.json', 'templates/gallery.json', 'templates/contact.json', 'templates/single-post.json', 'templates/header.json', 'templates/footer.json']) {
    assert.ok(files.includes(f), `missing ${f}`);
  }
  assert.ok(!files.some((f) => f.startsWith('templates/service-')), 'no service pages in article mode');
  // Templates are pretty-printed: compact them so the regexes below match reliably
  const read = (f) => (f.endsWith('.json') ? JSON.stringify(JSON.parse(zip.readAsText(root + f))) : zip.readAsText(root + f));
  const baseUrl = 'https://edilbianchi.it/wp-content/uploads/2026/10/';

  // No demo image or demo text anywhere
  let scanned = 0;
  for (const f of files.filter((x) => x.startsWith('templates/'))) {
    const urls = [...read(f).matchAll(/"url":"([^"]*)"/g)].map((m) => m[1]).filter((u) => /\.(jpe?g|png|webp)$/.test(u));
    scanned += urls.length;
    for (const u of urls) assert.ok(u.startsWith(baseUrl), `${f}: demo image ${u}`);
    assert.doesNotMatch(read(f), /plumbix-demo|555\) 010|Demo Street/, f);
  }
  assert.ok(scanned > 20, `image URLs scanned: ${scanned}`);

  // Services grid: 5 cards, title = service name, link = article URL
  const servicesJson = read('templates/services.json');
  const servicesDoc = JSON.parse(servicesJson);
  assert.equal(servicesDoc.title, 'Servizi');
  assert.equal(servicesDoc.content.length, 3, 'subheader + 2 rows of cards (extra section removed)');
  assert.doesNotMatch(servicesJson, /Not sure what you need/);
  assert.equal([...servicesJson.matchAll(/"widgetType":"image-box"/g)].length, 5);
  for (const s of services) {
    assert.match(servicesJson, new RegExp(`"title_text":"${s.name}"`));
    assert.match(servicesJson, new RegExp(`"url":"/${s.slug}/"`));
  }
  // Home: 3 featured services
  assert.equal([...read('templates/home.json').matchAll(/"widgetType":"image-box"/g)].length, 3);
  // Gallery: all provided images except the logo, lightbox on
  const galleryWidget = JSON.parse(read('templates/gallery.json')).content[1].elements[0].elements[0];
  assert.equal(galleryWidget.settings.wp_gallery.length, 9);
  assert.equal(galleryWidget.settings.gallery_link, 'file');
  // Contact: CF7 placeholder shortcode + map with the real address + tel link
  const contact = read('templates/contact.json');
  assert.ok(contact.includes('"shortcode":"[contact-form-7 id=\\"INSERIRE_ID\\" title=\\"Modulo di contatto\\"]"'));
  assert.doesNotMatch(contact, /"widgetType":"form"/);
  assert.match(contact, /"address":"Via Milano 10, 20100 Milano"/);
  assert.match(contact, /tel:\+39021234567/);
  // Header menu + footer copyright
  assert.match(read('templates/header.json'), /"menu":"menu-principale"/);
  assert.match(read('templates/footer.json'), /© 2026 Edil Bianchi S\.r\.l\. – P\.IVA 01234567890/);
  assert.equal(JSON.parse(read('templates/single-post.json')).type, 'single-post');

  // WordPress import file
  const xml = read('wordpress-import.xml');
  assert.equal([...xml.matchAll(/<wp:post_type><!\[CDATA\[post\]\]><\/wp:post_type>/g)].length, 5);
  assert.equal([...xml.matchAll(/<wp:post_type><!\[CDATA\[nav_menu_item\]\]><\/wp:post_type>/g)].length, 5);
  assert.equal([...xml.matchAll(/_thumbnail_id/g)].length, 5);
  assert.match(xml, /<category domain="category" nicename="servizi"><!\[CDATA\[Servizi\]\]><\/category>/);
  assert.match(xml, /<wp:post_name><!\[CDATA\[chi-siamo\]\]><\/wp:post_name>/);
  assert.match(read('ISTRUZIONI.md'), /Contact Form 7/);
  assert.match(read('menu.md'), /\| 2 \| Chi Siamo \| `\/chi-siamo\/` \|/);

  // The output kit drops the unused service page template, keeps global styles
  const inner = new AdmZip(zip.readFile(root + 'elementor-kit.zip'));
  const kitNames = JSON.parse(inner.readAsText('manifest.json')).templates.map((t) => t.name);
  assert.ok(!kitNames.includes('Service Single') && kitNames.includes('Global Kit Styles'), kitNames.join(','));

  // WordPress plugin: 5 pages, 5 articles, every photo in the gallery, CF7 placeholder, Italian admin texts
  assert.match(read('ISTRUZIONI.md'), /Carica plugin\*\* → scegli `edil-bianchi-site\.zip`/);
  const plugin = new AdmZip(zip.readFile(root + 'edil-bianchi-site.zip'));
  const site = JSON.parse(plugin.readAsText('edil-bianchi-site/data/site.json'));
  assert.deepEqual(site.pages.map((x) => [x.title, x.slug]), [['Home', 'home'], ['Chi Siamo', 'chi-siamo'], ['Servizi', 'servizi'], ['Galleria', 'galleria'], ['Contatti', 'contatti']]);
  assert.ok(site.pages.every((x) => x.elementor && x.seo.title), 'every page has its Elementor layout and SEO title');
  assert.deepEqual(site.posts.map((x) => x.slug), services.map((s) => s.slug));
  assert.ok(site.posts.every((x) => x.image && x.content.replace(/<[^>]+>/g, '').length >= 300));
  assert.deepEqual(site.category, { name: 'Servizi', slug: 'servizi' });
  assert.deepEqual(site.menu, { name: 'Menu principale', slug: 'menu-principale' });
  assert.deepEqual(site.templates.map((x) => x.type), ['header', 'footer', 'single-post']);
  assert.deepEqual(site.contactForm, { placeholder: '[contact-form-7 id="INSERIRE_ID" title="Modulo di contatto"]', title: 'Modulo di contatto', recipient: 'info@edilbianchi.it' });
  assert.equal(site.ui.run, 'Crea il sito');
  const photos = site.images.filter((i) => i.photo).map((i) => `esg-image://${i.file}`);
  assert.equal(photos.length, 9);
  const pluginGallery = JSON.parse(plugin.readAsText('edil-bianchi-site/data/elementor/gallery.json')).content[1].elements[0].elements[0];
  assert.deepEqual(pluginGallery.settings.wp_gallery.map((i) => i.url), photos, 'the gallery shows every uploaded photo');
  // Photos are also used on the other pages (not only in the gallery and on the services)
  const used = new Set(site.pages.filter((x) => x.role !== 'gallery').flatMap((x) => [...plugin.readAsText(`edil-bianchi-site/data/${x.elementor}`).matchAll(/esg-image:\/\/([^"]+)/g)].map((m) => m[1].replace(/-(hero|subheader)(\.\w+)$/, '$2')))); // hero/subheader crops count as their photo
  assert.ok(site.images.filter((i) => i.photo).filter((i) => used.has(i.file)).length >= 8, `photos used outside the gallery: ${used.size}`);
});

test('gallery page without a gallery widget gets one with every photo', async () => {
  const { prepareDocument } = await import('../src/elementor/prepare.js');
  const { analyzeDocument } = await import('../src/elementor/analyze.js');
  const img = (n) => ({ id: `i${n}`, elType: 'widget', widgetType: 'image', settings: { image: { url: `https://demo.test/${n}.jpg`, id: n } }, elements: [] });
  const doc = {
    content: [
      { id: 'sub', elType: 'container', settings: {}, elements: [{ id: 'h', elType: 'widget', widgetType: 'heading', settings: { title: 'Gallery' }, elements: [] }] },
      { id: 'grid', elType: 'container', settings: {}, elements: [img(1), img(2)] },
    ],
  };
  const { doc: prepared } = prepareDocument(structuredClone(doc), { role: 'gallery', ensureGallery: true });
  assert.equal(prepared.content.length, 3);
  assert.equal(prepared.content[1].elements[0].widgetType, 'image-gallery', 'added right after the subheader');
  assert.equal(analyzeDocument(prepared).slots.filter((s) => s.kind === 'gallery').length, 1);
  // Not on other pages, and not twice
  assert.equal(prepareDocument(structuredClone(doc), { role: 'about', ensureGallery: true }).doc.content.length, 2);
  assert.equal(prepareDocument(structuredClone(prepared), { role: 'gallery', ensureGallery: true }).doc.content.length, 3);
});
