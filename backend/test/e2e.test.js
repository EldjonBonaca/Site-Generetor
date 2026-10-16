/**
 * End-to-end flow through the HTTP API with the offline mock provider:
 * project -> services -> images -> template category -> generated template (saved, edited)
 * -> provider -> generation -> edit -> export -> inspect zip.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'esg-e2e-'));
process.env.STORAGE_DIR = storage;
process.env.ENCRYPTION_KEY ||= 'b'.repeat(64);

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
  const data = text ? (res.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text) : null;
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}: ${text}`);
  return data;
}

const png = (color) => sharp({ create: { width: 2400, height: 1200, channels: 3, background: color } }).png().toBuffer();

async function waitFor(gen) {
  for (let i = 0; i < 150 && ['queued', 'running'].includes(gen.status); i++) {
    await new Promise((r) => setTimeout(r, 150));
    gen = await api('GET', `/generations/${gen.id}`);
  }
  return gen;
}

test('templates: categories, AI generation, save, edit, duplicate, delete', async () => {
  const cat = await api('POST', '/template-categories', { name: 'Plumbers', description: 'Plumbing repairs and bathroom installations' });
  assert.equal(cat.template_count, 0);
  await assert.rejects(api('POST', '/template-categories', { name: 'plumbers' }), /already exists/);
  await assert.rejects(api('POST', '/template-categories', { name: ' ' }), /400/);
  const renamed = await api('PATCH', `/template-categories/${cat.id}`, { name: 'Plumbers & heating' });
  assert.equal(renamed.name, 'Plumbers & heating');

  // The template prompt is built in and read-only
  const tplPrompt = await api('GET', '/prompts/template');
  assert.equal(tplPrompt.name, 'Template per categoria (IT)');
  assert.match(tplPrompt.content, /\{\{CATEGORIA\}\}/);
  const options = await api('GET', '/template-options');
  assert.ok(options.fonts.includes('Poppins') && options.layouts.hero.includes('split'));

  // Generation needs a provider; it returns a spec without saving it
  await assert.rejects(api('POST', `/template-categories/${cat.id}/templates/generate`, {}), /Select an AI provider/);
  const provider = await api('POST', '/providers', { type: 'mock', name: 'Demo' });
  const draft = await api('POST', `/template-categories/${cat.id}/templates/generate`, { providerId: provider.id, instructions: 'fresh colors', language: 'en' });
  assert.ok(draft.tokens > 0);
  assert.equal(draft.generated_by, 'Demo · mock-1');
  assert.match(draft.spec.copy.heroTitle, /Plumbers & heating/);
  assert.match(draft.spec.style.colors.primary, /^#[0-9A-F]{6}$/);
  assert.equal((await api('GET', `/templates?category=${cat.id}`)).length, 0, 'not saved yet');

  // Save, edit (invalid values are sanitized), duplicate, delete
  await assert.rejects(api('POST', `/template-categories/${cat.id}/templates`, { name: 'x' }), /Generate the template first/);
  const tpl = await api('POST', `/template-categories/${cat.id}/templates`, { name: 'Blue classic', spec: draft.spec, instructions: 'fresh colors', language: 'en', generated_by: draft.generated_by, tokens_used: draft.tokens });
  assert.equal(tpl.category_name, 'Plumbers & heating');
  assert.equal(tpl.used_by, 0);
  const edited = await api('PATCH', `/templates/${tpl.id}`, { name: 'Blue classic v2', spec: { ...tpl.spec, style: { ...tpl.spec.style, colors: { ...tpl.spec.style.colors, primary: '#123abc', text: 'blue' } } } });
  assert.equal(edited.name, 'Blue classic v2');
  assert.equal(edited.spec.style.colors.primary, '#123ABC');
  assert.match(edited.spec.style.colors.text, /^#[0-9A-F]{6}$/, 'invalid color replaced');
  const copy = await api('POST', `/templates/${tpl.id}/duplicate`);
  assert.equal(copy.name, 'Blue classic v2 (copy)');
  assert.equal((await api('GET', '/template-categories')).find((c) => c.id === cat.id).template_count, 2);
  await api('DELETE', `/templates/${copy.id}`);
  assert.equal((await api('GET', `/templates?category=${cat.id}`)).length, 1);
});

test('full generation flow (English, template, WordPress plugin)', async () => {
  // 1. Project + site data
  const project = await api('POST', '/projects', { site_name: 'Rossi Idraulica' });
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
  assert.equal(p.readiness.ready, false, 'no template/provider yet');
  assert.ok(p.readiness.items.some((i) => i.step === 'template' && i.level === 'error'));

  // 2. Services
  const s1 = await api('POST', `/projects/${pid}/services`, { name: 'Riparazione caldaie', description: 'Riparazioni rapide' });
  const s2 = await api('POST', `/projects/${pid}/services`, { name: 'Bagni su misura' });
  assert.equal(s1.slug, 'riparazione-caldaie');

  // 3. Images (one invalid file must be rejected)
  const form = new FormData();
  for (const [name, color] of [['hero.png', '#f00'], ['sub.png', '#0f0'], ['s1.png', '#00f'], ['s2.png', '#ff0'], ['logo.png', '#000'], ['team.png', '#0ff']]) {
    form.append('files', new Blob([await png(color)], { type: 'image/png' }), name);
  }
  form.append('files', new Blob(['not an image'], { type: 'image/png' }), 'fake.png');
  const up = await (await fetch(`${base}/projects/${pid}/images`, { method: 'POST', body: form })).json();
  assert.equal(up.created.length, 6);
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
  assert.equal(imgZip.getEntries().length, 6);
  assert.equal((await sharp(imgZip.readFile('plumber-roma-riparazione-caldaie.png')).metadata()).width, 2400, 'original file, not resized');

  // 4. Template: category + generated template, chosen by the project
  const provider = await api('POST', '/providers', { type: 'mock', name: 'Demo' });
  assert.equal(provider.has_key, false);
  assert.equal((await api('POST', `/providers/${provider.id}/test`)).ok, true);
  const real = await api('POST', '/providers', { type: 'anthropic', api_key: 'sk-ant-test-key-9876', model: 'claude-sonnet-5' });
  assert.equal(real.key_hint, 'sk-...9876');
  assert.ok(!JSON.stringify(await api('GET', '/providers')).includes('test-key'), 'key never returned');

  const cat = await api('POST', '/template-categories', { name: 'Idraulici' });
  const draft = await api('POST', `/template-categories/${cat.id}/templates/generate`, { providerId: provider.id, language: 'en' });
  const spec = { ...draft.spec, sections: ['about', 'features', 'cta', 'services', 'gallery', 'reviews'], layout: { ...draft.spec.layout, hero: 'center', cta: 'banner', contact: 'split', header: 'classic', subheader: 'photo' } };
  const tpl = await api('POST', `/template-categories/${cat.id}/templates`, { name: 'Plumber blue', spec });
  await assert.rejects(api('PUT', `/projects/${pid}/template`, { template_id: 9999 }), /404/);
  await api('PUT', `/projects/${pid}/template`, { template_id: tpl.id });

  p = await api('PATCH', `/projects/${pid}`, { settings: { generation: { providerId: provider.id } } });
  assert.equal(p.readiness.ready, true, JSON.stringify(p.readiness.items));
  assert.equal((await api('GET', `/templates/${tpl.id}`)).used_by, 1);

  // One built-in prompt for every site: it cannot be uploaded, created or chosen
  const sitePrompt = await api('GET', '/prompts/site');
  assert.equal(sitePrompt.name, 'Sito completo Elementor (IT)');
  for (const [method, url] of [['GET', '/prompts'], ['POST', '/prompts'], ['GET', '/kits'], ['POST', '/kits']]) {
    assert.equal((await fetch(base + url, { method })).status, 404, `${method} ${url} is gone`);
  }
  const preview = await api('POST', '/prompts/preview', { projectId: pid, content: 'Hello {{site_name}}' });
  assert.match(preview.prompt, /^# Prompt – Creazione sito web WordPress con Elementor\n/, 'custom content is ignored');
  assert.match(preview.prompt, /\| Nome sito \| `Rossi Idraulica` \|/);
  assert.match(preview.prompt, /\| Settore \/ tipo di cliente \| `Plumber` \|/);
  assert.match(preview.prompt, /template Elementor `Plumber blue` della categoria `Idraulici`/);
  assert.match(preview.prompt, new RegExp(`Font: ${spec.style.fonts.heading} \\(titoli\\)`), 'template style described');
  assert.match(preview.prompt, /realizzato con \*\*Contact Form 7\*\*/);
  assert.match(preview.prompt, /\| Altre immagini \| `team\.webp` \|/, 'images without a specific use');
  assert.doesNotMatch(preview.prompt, /\{\{[A-Z_]+\}\}/, 'no unresolved variable');
  assert.doesNotMatch(preview.prompt, /Template Kit/);
  assert.match(preview.prompt, /OUTPUT FORMAT/);
  assert.match(preview.prompt, /Values: strings written in English/, 'the site language wins over the Italian text of the prompt');

  const plan = await api('GET', `/projects/${pid}/plan`);
  assert.deepEqual(
    plan.pages.map((pg) => pg.key),
    ['home', 'about', 'services', 'gallery', 'contact', `post-${s1.slug}`, `post-${s2.slug}`, 'single-post', 'header', 'footer']
  );
  assert.ok(plan.estimatedTokens > 0);
  assert.equal(plan.pages.find((pg) => pg.key === 'header').aiFields, 1, 'header: only the button text is written by the AI');
  assert.equal(plan.pages.find((pg) => pg.key === 'about').sharedFields, 9, 'the 3 reviews of About are the ones of Home');

  // 5. Generation
  let gen = await waitFor(await api('POST', `/projects/${pid}/generations`));
  assert.equal(gen.status, 'completed', gen.error || '');
  assert.equal(gen.pages_done, 10);
  const home = gen.pages.find((pg) => pg.key === 'home');
  assert.ok(home.seo.title);
  assert.ok(home.seo.keyphrase, 'Yoast focus keyphrase written with the SEO fields');
  assert.ok(home.fields.some((f) => f.id.startsWith('home.s5.heading') && f.value === 'Riparazione caldaie'), 'service card title = service name');
  const about = gen.pages.find((pg) => pg.key === 'about');
  assert.equal(about.fields.find((f) => f.id === 'about.intro.heading1.title').value, 'About Us', 'subheader title = page title');
  const shared = about.fields.filter((f) => f.source === 'shared');
  assert.equal(shared.length, 9);
  assert.ok(shared.every((f) => f.sharedFrom.page === 'home' && f.value === null));
  for (const pg of gen.pages) for (const f of pg.fields.filter((x) => x.format === 'link')) {
    assert.ok(gen.links.some((l) => l.url === f.value), `${f.id}: ${f.value} is a site link`);
  }

  // 6. Manual edit + single field regeneration (shared texts are edited on their first page)
  const titleField = home.fields.find((f) => f.id === 'home.hero.heading2.title');
  await api('PATCH', `/generations/${gen.id}/pages/home`, { fields: { [titleField.id]: 'Idraulico a Roma 24/7', 'home.s7.testimonial1.testimonial_name': 'Anna Neri' } });
  await api('PATCH', `/generations/${gen.id}/pages/about`, { fields: { [shared[0].id]: 'ignored' } });
  const regen = await api('POST', `/generations/${gen.id}/pages/about/fields/regenerate`, { fieldId: 'about.s2.heading1.title' });
  assert.ok(regen.fields.find((f) => f.id === 'about.s2.heading1.title').value);
  await assert.rejects(api('POST', `/generations/${gen.id}/pages/about/fields/regenerate`, { fieldId: shared[0].id }), /same as on another page/);

  // 7. Export + inspect
  const exp = await api('POST', `/generations/${gen.id}/export`);
  assert.equal(exp.pages, 8, '5 pages, single post, header, footer');
  assert.equal(exp.posts, 2);
  assert.equal(exp.plugin, 'rossi-idraulica-site.zip');
  assert.ok(!exp.checks.some((c) => c.level === 'error'), JSON.stringify(exp.checks));
  const zipRes = await fetch(base.replace('/api', '') + exp.download);
  const zip = new AdmZip(Buffer.from(await zipRes.arrayBuffer()));
  const names = zip.getEntries().map((e) => e.entryName);
  const root = 'output-rossi-idraulica/';
  for (const f of ['rossi-idraulica-site.zip', 'content.md', 'seo.csv', 'INSTRUCTIONS.md', 'CHECKS.md', 'menu.md', 'wordpress-import.xml', 'templates/home.json', 'templates/header.json', 'templates/single-post.json']) {
    assert.ok(names.includes(root + f), `missing ${f}`);
  }
  assert.ok(!names.includes(root + 'elementor-kit.zip'), 'no kit anymore');
  const instructions = zip.readAsText(root + 'INSTRUCTIONS.md');
  assert.match(instructions, /Upload Plugin\*\* → choose `rossi-idraulica-site\.zip`/);
  assert.match(instructions, /template \*\*Plumber blue\*\* \(category \*Idraulici\*\)/);
  assert.match(instructions, /\*\*Contact Form 7\*\*/);
  assert.match(instructions, /without Pro it creates the header and footer as UAE templates/);
  const webp = names.filter((n) => n.startsWith(root + 'images/') && n.endsWith('.webp'));
  assert.equal(webp.filter((n) => !/-(hero|subheader|carousel)\.webp$/.test(n)).length, 6, '6 images');
  assert.equal(webp.filter((n) => /-(hero|subheader)\.webp$/.test(n)).length, 2, 'hero and subheader crops');
  assert.ok(webp.some((n) => /-carousel\.webp$/.test(n)), 'photos of the Home carousel cropped to the same size');
  for (const [file, width, height] of [['plumber-roma-home-hero.webp', 1920, 1080], ['plumber-roma-banner-subheader.webp', 1920, 600]]) {
    const meta = await sharp(zip.readFile(root + 'images/' + file)).metadata();
    assert.deepEqual([meta.width, meta.height], [width, height], file);
  }
  assert.equal((await sharp(zip.readFile(root + 'images/plumber-roma-home.webp')).metadata()).height, 960, 'the full photo is kept for the gallery');

  const homeJson = zip.readAsText(root + 'templates/home.json');
  const homeDoc = JSON.parse(homeJson);
  assert.equal(homeDoc.type, 'page');
  assert.equal(homeDoc.title, 'Home');
  const baseUrl = 'https://rossi-idraulica.it/wp-content/uploads/2026/10/';
  assert.equal(homeDoc.content[0].settings.background_image.url, `${baseUrl}plumber-roma-home-hero.webp`);
  const aboutDoc = JSON.parse(zip.readAsText(root + 'templates/about.json'));
  assert.equal(aboutDoc.content[0].settings.background_image.url, `${baseUrl}plumber-roma-banner-subheader.webp`);
  assert.match(homeJson, /Idraulico a Roma 24\/7/);
  assert.match(homeJson, /tel:\+390612345678/);
  assert.match(homeJson, /plumber-roma-riparazione-caldaie\.webp/, 'service card uses the service image');
  for (const f of names.filter((n) => n.startsWith(root + 'templates/'))) {
    const urls = [...JSON.stringify(JSON.parse(zip.readAsText(f))).matchAll(/"url":"([^"]*)"/g)].map((m) => m[1]).filter((u) => /\.(jpe?g|png|webp)$/.test(u));
    for (const u of urls) assert.ok(u.startsWith(baseUrl), `${f}: placeholder image ${u}`);
  }
  // The 3 reviews of About are the ones of Home (including manual edits)
  const reviewsOf = (doc) => JSON.stringify(doc).match(/"testimonial_(content|name|job)":"[^"]*"/g);
  assert.deepEqual(reviewsOf(aboutDoc), reviewsOf(homeDoc));
  assert.match(JSON.stringify(aboutDoc), /"testimonial_name":"Anna Neri"/);
  // Header: logo + menu of the 5 pages; footer: services + contacts + copyright
  const header = zip.readAsText(root + 'templates/header.json');
  assert.equal(JSON.parse(header).type, 'header');
  assert.match(header, /rossi-idraulica-logo\.webp/);
  for (const url of ['/about-us/', '/services/', '/gallery/', '/contact/']) assert.ok(header.includes(`href=\\"${url}\\"`), `header menu: ${url}`);
  const footer = zip.readAsText(root + 'templates/footer.json');
  for (const t of ['Riparazione caldaie', '/bagni-su-misura/', 'mailto:info@rossi-idraulica.it', `© ${new Date().getFullYear()} Rossi Idraulica. All rights reserved.`]) assert.ok(footer.includes(t), `footer: ${t}`);
  // Legal pages created later by the site owner
  assert.ok(footer.includes('<a href=\\"/cookie-policy/\\"'), 'footer: Cookie Policy link');
  assert.ok(footer.includes('<a href=\\"/informativa-sul-trattamento-dei-dati-personali/\\"'), 'footer: Privacy Policy link');
  const contact = zip.readAsText(root + 'templates/contact.json');
  assert.ok(contact.includes('[contact-form-7 id=\\"INSERIRE_ID\\" title=\\"Contact form\\"]'));
  assert.match(contact, /"css_classes":\s*"esg-form"/, 'Contact Form 7 styled by the template');
  assert.match(contact, /\.esg-form input\[type=submit\]\{width:100%/);

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
  // Without Elementor Pro the header/footer are UAE templates (they survive the deletion of this plugin)
  assert.match(php, /'slug' => 'header-footer-elementor'/);
  assert.match(php, /'post_type' => 'elementor-hf'/);
  assert.ok(php.includes("'ehf_template_type', $tpl['role'] === 'header' ? 'type_header' : 'type_footer'"), 'UAE header / footer type');
  assert.ok(php.includes("array('rule' => array('basic-global')"), 'shown on the entire site');
  assert.ok(!php.includes("'metform") && !php.includes('metform-form') && !php.includes('[metform'), 'Contact Form 7 only');
  const site = JSON.parse(plugin.readAsText(pr + 'data/site.json'));
  assert.deepEqual(site.pages.map((x) => [x.role, x.title, x.slug]), [
    ['home', 'Home', 'home'],
    ['about', 'About Us', 'about-us'],
    ['services', 'Services', 'services'],
    ['gallery', 'Gallery', 'gallery'],
    ['contact', 'Contact', 'contact'],
  ]);
  assert.ok(site.pages.every((x) => x.elementor), 'every page has its Elementor layout');
  assert.deepEqual(site.posts.map((x) => [x.title, x.slug, x.image]), [
    ['Riparazione caldaie', 'riparazione-caldaie', 'plumber-roma-riparazione-caldaie.webp'],
    ['Bagni su misura', 'bagni-su-misura', 'plumber-roma-bagni-su-misura.webp'],
  ]);
  assert.ok(site.posts.every((x) => x.content.length > 100 && x.seo));
  // Yoast SEO: installed by the plugin, focus keyphrase / title / description on pages and articles
  assert.ok(site.posts.every((x) => x.seo.keyphrase) && site.pages.every((x) => x.seo.keyphrase), 'every page and article has a focus keyphrase');
  assert.ok(php.includes("'slug' => 'wordpress-seo'") && php.includes("'_yoast_wpseo_focuskw'") && php.includes("'wpseo_titles'"), 'Yoast SEO installed and filled in');
  assert.equal(site.images.length, 13, '6 images + hero / subheader crops + 5 carousel crops');
  assert.equal(site.images.filter((i) => i.photo).length, 5, 'every image except the logo is a gallery photo');
  assert.equal(site.logo, site.images.find((i) => !i.photo && !/-(hero|subheader|carousel)\./.test(i.file)).file);
  // Each article is designed: hero with its featured image, its content, the OTHER services in the sidebar, no comments
  for (const post of site.posts) {
    const doc = JSON.parse(plugin.readAsText(pr + 'data/' + post.elementor));
    const json = JSON.stringify(doc);
    assert.ok(json.includes(`"url":"esg-image://${post.image}"`), `${post.title}: featured image in the hero`);
    assert.ok(json.includes(`"title":"${post.title}"`), `${post.title}: title`);
    assert.doesNotMatch(json, /theme-post-|__dynamic__/, 'no Elementor Pro widget or dynamic tag');
    const other = site.posts.find((x) => x !== post);
    assert.ok(json.includes(`"text":"${other.title}"`) && !json.includes(`"text":"${post.title}"`), `${post.title}: other services only`);
    assert.doesNotMatch(json, /post-comments|comments/i);
  }
  const pluginPhp = plugin.readAsText(plugin.getEntries().find((e) => e.entryName.endsWith('.php')).entryName);
  assert.match(pluginPhp, /add_filter\('comments_open'/, 'comments closed by the plugin');
  assert.match(pluginPhp, /'comment_status' => 'closed'/);
  for (const img of site.images) assert.ok(plugin.getEntry(pr + 'images/' + img.file), `bundled ${img.file}`);
  assert.deepEqual(site.templates.map((x) => [x.role, x.type]), [['header', 'header'], ['footer', 'footer'], ['single_post', 'single-post']]);
  assert.equal(site.headerFooter, true);
  assert.equal(site.globalStyles.system_colors[0].color, spec.style.colors.primary, 'template colors -> Elementor global colors');
  assert.equal(site.globalStyles.system_typography[0].typography_font_family, spec.style.fonts.heading);
  assert.equal(site.contactForm.plugin, 'cf7');
  assert.equal(site.contactForm.placeholder, '[contact-form-7 id="INSERIRE_ID" title="Contact form"]');
  assert.equal(site.contactForm.recipient, 'info@rossi-idraulica.it');
  // Same fields as before: name, email, phone, message, privacy consent; reply goes to the visitor
  for (const tag of ['[text* your-name', '[email* your-email', '[tel your-phone', '[textarea* your-message', '[acceptance your-consent]', '[submit "Send message"]']) assert.ok(site.contactForm.form.includes(tag), tag);
  assert.match(site.contactForm.body, /Phone: \[your-phone\]/);
  assert.equal(site.contactForm.replyTo, 'Reply-To: [your-name] <[your-email]>');
  assert.equal(site.menu.slug, 'main-menu');
  assert.equal(site.ui.run, 'Create the website');
  const pluginHome = plugin.readAsText(pr + 'data/elementor/home.json');
  assert.match(pluginHome, /"url":"esg-image:\/\/plumber-roma-home[^"]*\.webp"/, 'images point to the bundled files');
  assert.doesNotMatch(pluginHome, /rossi-idraulica\.it\/wp-content|template\.invalid/, 'no base URL / placeholder image in the plugin');
  assert.match(pluginHome, /Idraulico a Roma 24\/7/);

  // 9. Another template: the old generation cannot be exported with it
  const other = await api('POST', `/template-categories/${cat.id}/templates`, { name: 'Other', spec: draft.spec });
  await api('PUT', `/projects/${pid}/template`, { template_id: other.id });
  await assert.rejects(api('POST', `/generations/${gen.id}/export`), /400.*made with another template/);

  // 10. Duplicate keeps the template; deleting the category leaves the project without one
  const copy = await api('POST', `/projects/${pid}/duplicate`);
  assert.equal(copy.site_name, 'Rossi Idraulica (copy)');
  assert.equal(copy.template_id, other.id);
  await api('DELETE', `/template-categories/${cat.id}`);
  const after = await api('GET', `/projects/${pid}`);
  assert.equal(after.template_id, null);
  assert.ok(after.readiness.items.some((i) => i.step === 'template' && i.level === 'error'));
  await api('DELETE', `/projects/${copy.id}`);
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
