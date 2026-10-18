/**
 * End-to-end test of the Italian full-site prompt ("Sito completo Elementor (IT)") with a
 * category template: Home / Chi Siamo / Servizi / Galleria / Contatti, services as articles (WXR),
 * header/footer, service cards, shared image archive, reviews, Contact Form 7, map, menu and final checks.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'esg-it-'));
process.env.ENCRYPTION_KEY ||= 'c'.repeat(64);

const { default: app } = await import('../src/app.js');
const { default: sharp } = await import('sharp');
const { AdmZip } = await import('../src/lib/zip.js');

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

test('Italian full site: template, articles, gallery, reviews, contact form, menu, final checks', async () => {
  const p = await api('POST', '/projects', { site_name: 'Edil Bianchi' });
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
  await api('PATCH', `/images/${created[8].id}`, { alt_text: 'Squadra al lavoro' });
  await api('POST', `/projects/${pid}/images/seo-rename`);

  // Category "Edilizia" + a template generated for it (Italian sample texts), used by the project
  const provider = await api('POST', '/providers', { type: 'mock' });
  const cat = await api('POST', '/template-categories', { name: 'Edilizia', description: 'Imprese edili e ristrutturazioni' });
  const draft = await api('POST', `/template-categories/${cat.id}/templates/generate`, { providerId: provider.id, instructions: 'stile solido e moderno' });
  assert.match(draft.spec.copy.heroTitle, /^Edilizia/);
  const spec = { ...draft.spec, sections: ['about', 'features', 'cta', 'services', 'gallery', 'reviews'], layout: { ...draft.spec.layout, features: 'icons', featureCount: '4', homeGallery: 'carousel', cta: 'banner', header: 'topbar', footerCta: 'none', contact: 'split' } };
  const tpl = await api('POST', `/template-categories/${cat.id}/templates`, { name: 'Edilizia moderna', spec, instructions: 'stile solido e moderno', language: 'it' });
  await api('PUT', `/projects/${pid}/template`, { template_id: tpl.id });
  await api('PATCH', `/projects/${pid}`, { settings: { generation: { providerId: provider.id } } });

  // The built-in site prompt is used automatically, with every variable filled
  const preview = await api('POST', '/prompts/preview', { projectId: pid, pageKey: 'about' });
  assert.match(preview.prompt, /\| Nome sito \| `Edil Bianchi` \|/);
  assert.match(preview.prompt, /\| Settore \/ tipo di cliente \| `Edilizia` \|/, 'no industry: the template category');
  assert.match(preview.prompt, /5\. `Pavimenti`/, '{{SERVIZIO_N}} expanded for the 5th service');
  assert.match(preview.prompt, /\| Immagine in evidenza Servizio 4 – `Cartongesso` \| `[^`]*cartongesso[^`]*\.webp/, 'table row expanded with image file name');
  assert.match(preview.prompt, /unico archivio condiviso\*\* \(`[^`]*Cantiere[^`]*pavimenti\.webp[^`]*Squadra al lavoro[^`]*`\)/, '{{ELENCO_IMMAGINI}}: every photo');
  assert.doesNotMatch(preview.prompt.match(/unico archivio condiviso[^\n]*/)[0], /logo/, 'the logo is not in the archive');
  assert.match(preview.prompt, /\| Altre immagini \| `foto-8\.webp \(ALT: Squadra al lavoro\), foto-9\.webp` \|/);
  assert.match(preview.prompt, /dal template Elementor `Edilizia moderna` della categoria `Edilizia`/);
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
  assert.ok(!files.some((f) => f.startsWith('templates/service-')), 'no service pages: services are articles');
  // Templates are pretty-printed: compact them so the regexes below match reliably
  const read = (f) => (f.endsWith('.json') ? JSON.stringify(JSON.parse(zip.readAsText(root + f))) : zip.readAsText(root + f));
  const baseUrl = 'https://edilbianchi.it/wp-content/uploads/2026/10/';

  // No placeholder image anywhere, and every image slot is filled
  let scanned = 0;
  for (const f of files.filter((x) => x.startsWith('templates/'))) {
    const urls = [...read(f).matchAll(/"url":"([^"]*)"/g)].map((m) => m[1]).filter((u) => /\.(jpe?g|png|webp)$/.test(u));
    scanned += urls.length;
    for (const u of urls) assert.ok(u.startsWith(baseUrl), `${f}: placeholder image ${u}`);
    // The reviews have no photo of the customer: their image is intentionally empty
    // (and the hero of the single post template shows the featured image of each article: dynamic tag)
    const json = read(f).replace(/"testimonial_image":\{"url":"","id":""\}/g, '').replace(/"background_image":\{"url":"","id":""\}(?=.*post-featured-image)/g, '');
    assert.doesNotMatch(json, /template\.invalid|"url":""/, `${f}: empty or placeholder image`);
  }
  assert.ok(scanned > 20, `image URLs scanned: ${scanned}`);

  // Services grid: 5 cards, title = service name, link = article URL
  const servicesJson = read('templates/services.json');
  const servicesDoc = JSON.parse(servicesJson);
  assert.equal(servicesDoc.title, 'Servizi');
  assert.equal(servicesDoc.content.length, 2, 'subheader + only one section: all services');
  assert.equal([...servicesJson.matchAll(/"link_to":"custom"/g)].length, 5, 'one card (linked image) per service');
  for (const s of services) {
    assert.match(servicesJson, new RegExp(`"title":"${s.name}"`));
    assert.match(servicesJson, new RegExp(`"url":"/${s.slug}/"`));
  }
  // Home: hero, chi siamo, perché sceglierci, call to action, 3 featured services, photo carousel, reviews
  const homeJson = read('templates/home.json');
  assert.equal(JSON.parse(homeJson).content.length, 7);
  assert.equal([...homeJson.matchAll(/"link_to":"custom"/g)].length, 3);
  assert.equal([...homeJson.matchAll(/"widgetType":"testimonial"/g)].length, 3);
  assert.equal([...homeJson.matchAll(/"testimonial_image":\{"url":"","id":""\}/g)].length, 3, 'reviews without photos');
  // "Perché sceglierci": 4 boxes written by the AI, no Elementor default text
  const boxes = JSON.parse(homeJson).content[2].elements[1].elements.map((e) => e.elements[0].settings);
  assert.equal(boxes.length, 4);
  for (const b of boxes) assert.ok(b.title_text && b.description_text && !/lorem|This is the heading/i.test(b.title_text + b.description_text));
  // Chi Siamo: one "Chi siamo" section, no "La nostra storia" / "Missione" titles
  const aboutJson = read('templates/about.json');
  assert.match(aboutJson, /"title":"Chi siamo"/);
  assert.doesNotMatch(aboutJson, /nostra storia|missione e valori/i);
  // Gallery: all provided images except the logo, lightbox on
  const galleryWidget = JSON.parse(read('templates/gallery.json')).content[1].elements[0];
  assert.equal(galleryWidget.settings.wp_gallery.length, 9);
  assert.equal(galleryWidget.settings.gallery_link, 'file');
  assert.equal(galleryWidget.settings.open_lightbox, 'yes');
  // Contact: Contact Form 7 placeholder shortcode + map with the real address + tel/mailto links
  const contact = read('templates/contact.json');
  assert.ok(contact.includes('"shortcode":"[contact-form-7 id=\\"INSERIRE_ID\\" title=\\"Modulo di contatto\\"]"'));
  assert.match(contact, /google\.com\/maps\?q=Via%20Milano%2010%2C%2020100%20Milano/);
  assert.match(contact, /tel:\+39021234567/);
  assert.match(contact, /mailto:info@edilbianchi\.it/);
  // Header (top bar with phone and email) + footer in 4 columns with the copyright
  const header = read('templates/header.json');
  assert.match(header, /"text":"\+39 02 1234 567"/);
  assert.match(header, /href=\\"\/chi-siamo\/\\"/);
  const footer = read('templates/footer.json');
  for (const t of ['"title":"Link"', '"title":"Servizi"', '"title":"Contatti"', '"text":"Pavimenti"', '"url":"/pavimenti/"', 'Via Milano 10, 20100 Milano', '© 2026 Edil Bianchi S.r.l. – P.IVA 01234567890']) {
    assert.ok(footer.includes(t), `footer: ${t}`);
  }
  assert.equal(JSON.parse(footer).content[0].elements.length, 4, '4 columns');
  assert.equal(JSON.parse(read('templates/single-post.json')).type, 'single-post');
  // Same 3 reviews in Home and Chi Siamo
  const reviews = (json) => json.match(/"testimonial_(content|name|job)":"[^"]*"/g);
  assert.deepEqual(reviews(read('templates/about.json')), reviews(homeJson));

  // WordPress import file
  const xml = read('wordpress-import.xml');
  assert.equal([...xml.matchAll(/<wp:post_type><!\[CDATA\[post\]\]><\/wp:post_type>/g)].length, 5);
  assert.equal([...xml.matchAll(/<wp:post_type><!\[CDATA\[nav_menu_item\]\]><\/wp:post_type>/g)].length, 5);
  assert.equal([...xml.matchAll(/_thumbnail_id/g)].length, 5);
  assert.match(xml, /<category domain="category" nicename="servizi"><!\[CDATA\[Servizi\]\]><\/category>/);
  assert.match(xml, /<wp:post_name><!\[CDATA\[chi-siamo\]\]><\/wp:post_name>/);
  const istruzioni = read('ISTRUZIONI.md');
  assert.match(istruzioni, /template \*\*Edilizia moderna\*\* \(categoria \*Edilizia\*\)/);
  assert.match(istruzioni, /Contact Form 7/);
  assert.match(istruzioni, /senza Pro crea header e footer come template di UAE/);
  assert.match(read('menu.md'), /\| 2 \| Chi Siamo \| `\/chi-siamo\/` \|/);

  // WordPress plugin: 5 pages, 5 articles, every photo in the gallery, Contact Form 7 form, Italian admin texts
  assert.match(istruzioni, /Carica plugin\*\* → scegli `edil-bianchi-site\.zip`/);
  const plugin = new AdmZip(zip.readFile(root + 'edil-bianchi-site.zip'));
  const site = JSON.parse(plugin.readAsText('edil-bianchi-site/data/site.json'));
  assert.deepEqual(site.pages.map((x) => [x.title, x.slug]), [['Home', 'home'], ['Chi Siamo', 'chi-siamo'], ['Servizi', 'servizi'], ['Galleria', 'galleria'], ['Contatti', 'contatti']]);
  assert.ok(site.pages.every((x) => x.elementor && x.seo.title), 'every page has its Elementor layout and SEO title');
  assert.deepEqual(site.posts.map((x) => x.slug), services.map((s) => s.slug));
  assert.ok(site.posts.every((x) => x.image && x.content.replace(/<[^>]+>/g, '').length >= 300));
  assert.deepEqual(site.category, { name: 'Servizi', slug: 'servizi' });
  assert.deepEqual(site.menu, { name: 'Menu principale', slug: 'menu-principale' });
  assert.deepEqual(site.templates.map((x) => x.type), ['header', 'footer', 'single-post']);
  assert.equal(site.contactForm.plugin, 'cf7');
  assert.equal(site.contactForm.title, 'Modulo di contatto');
  assert.equal(site.contactForm.recipient, 'info@edilbianchi.it');
  assert.match(site.contactForm.form, /<label> Nome e cognome\n    \[text\* your-name/);
  assert.match(site.contactForm.form, /\[submit "Invia messaggio"\]/);
  assert.equal(site.ui.run, 'Crea il sito');
  assert.match(site.ui.hfNotice, /restano sul sito anche dopo aver eliminato questo plugin/);
  const photos = site.images.filter((i) => i.photo).map((i) => `esg-image://${i.file}`);
  assert.equal(photos.length, 9);
  const pluginGallery = JSON.parse(plugin.readAsText('edil-bianchi-site/data/elementor/gallery.json')).content[1].elements[0];
  assert.deepEqual(pluginGallery.settings.wp_gallery.map((i) => i.url), photos, 'the gallery shows every uploaded photo');
  // Photos are also used on the other pages (shared archive: not only in the gallery and on the services)
  const used = new Set(site.pages.filter((x) => x.role !== 'gallery').flatMap((x) => [...plugin.readAsText(`edil-bianchi-site/data/${x.elementor}`).matchAll(/esg-image:\/\/([^"]+)/g)].map((m) => m[1].replace(/-(hero|subheader)(\.\w+)$/, '$2')))); // hero/subheader crops count as their photo
  assert.ok(site.images.filter((i) => i.photo).filter((i) => used.has(i.file)).length >= 8, `photos used outside the gallery: ${used.size}`);
});
