/**
 * Template Kits end-to-end, with the offline mock provider: upload an Envato-style kit made for a
 * gym, AI analysis, roles, then a plumber site built from it -> generation -> export. No demo text,
 * image, phone, email or client logo of the kit may remain in the exported site.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'esg-kits-'));
process.env.STORAGE_DIR = storage;
process.env.ENCRYPTION_KEY ||= 'c'.repeat(64);

const { default: app } = await import('../src/app.js');
const { default: sharp } = await import('sharp');
const { AdmZip } = await import('../src/lib/zip.js');
const { prepareDocument } = await import('../src/kits/site.js');
const { guessSectionType } = await import('../src/kits/analysis.js');
const { outlineDocument } = await import('../src/kits/read.js');
const { compareStructure } = await import('../src/kits/structure.js');

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
  const data = text ? (res.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text) : null;
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}: ${text}`);
  return data;
}
const png = (color, w = 2000, h = 1200) => sharp({ create: { width: w, height: h, channels: 3, background: color } }).png().toBuffer();
async function waitFor(gen) {
  for (let i = 0; i < 200 && ['queued', 'running'].includes(gen.status); i++) {
    await new Promise((r) => setTimeout(r, 150));
    gen = await api('GET', `/generations/${gen.id}`);
  }
  return gen;
}

// ---------------------------------------------------------------------------
// A gym Template Kit (Envato format) full of demo content
// ---------------------------------------------------------------------------
const DEMO = 'https://demo-gymzilla.example.com/wp-content/uploads/2024/';
let n = 0;
const id = () => `k${(++n).toString(36).padStart(6, '0')}`;
const img = (name) => ({ url: DEMO + name, id: 100 + n, size: '', alt: '', source: 'library' });
const link = (url) => ({ url, is_external: '', nofollow: '', custom_attributes: '' });
const w = (widgetType, settings) => ({ id: id(), elType: 'widget', widgetType, settings, elements: [] });
const box = (elements, settings = {}) => ({ id: id(), elType: 'container', settings: { flex_direction: 'column', ...settings }, elements, isInner: false });
const row = (elements) => box(elements, { flex_direction: 'row' });
const heading = (title, size = 'h2') => w('heading', { title, header_size: size });
const text = (html) => w('text-editor', { editor: html });
const button = (t, url = '#') => w('button', { text: t, link: link(url) });
const card = (title, desc, image) => box([w('image', { image: img(image) }), heading(title, 'h3'), text(`<p>${desc}</p>`), button('Read more', '/programs/')]);
const banner = (title) => box([heading(title, 'h1'), text('<p>Gymzilla – Home / ' + title + '</p>')], { background_background: 'classic', background_image: img('banner.jpg') });
const tpl = (title, type, content, page_settings = { hide_title: 'yes' }) => ({ version: '0.4', title, type, content, page_settings });

function gymKit() {
  const home = tpl('Home', 'page', [
    box([heading('Gymzilla: Train Harder, Live Stronger', 'h1'), text('<p>Join the toughest gym in Springfield since 2009.</p>'), button('Join Gymzilla', '#join')], { background_background: 'classic', background_image: img('hero.jpg') }),
    box([heading('Our Programs'), row([card('CrossFit', 'High intensity group classes.', 'p1.jpg'), card('Yoga', 'Stretch and breathe.', 'p2.jpg'), card('Boxing', 'Punch your limits.', 'p3.jpg')])]),
    box([heading('About Gymzilla'), text('<p>Founded by coach Mike Tyson Jr in 2009, Gymzilla has 3 locations.</p>'), w('video', { youtube_url: 'https://www.youtube.com/watch?v=demo123', video_type: 'youtube' })]),
    box([w('counter', { starting_number: 0, ending_number: 2500, suffix: '+', title: 'Members' }), w('counter', { ending_number: '15', title: 'Coaches' })]),
    box([heading('What our members say'), w('testimonial', { testimonial_content: 'Gymzilla changed my life, I lost 20kg!', testimonial_name: 'Jane Cooper', testimonial_job: 'Member since 2019', testimonial_image: img('jane.jpg') })]),
    box([w('image', { image: img('logo-nike.png') }), w('image', { image: img('logo-adidas.png') }), w('image', { image: img('logo-puma.png') }), w('image', { image: img('logo-reebok.png') }), w('image', { image: img('logo-ua.png') })]),
    box([w('price-table', { heading: 'Gold Plan', price: '49', period: 'Monthly', button_text: 'Sign up' })]),
    box([heading('Visit us'), w('html', { html: '<p>Open <strong>Mon–Sun</strong> at Gymzilla HQ</p>' }), w('icon-list', { icon_list: [{ _id: 'a1', text: '+1 (555) 010-2030', link: link('tel:+15550102030') }, { _id: 'a2', text: 'hello@gymzilla-demo.com', link: link('mailto:hello@gymzilla-demo.com') }] })], { background_background: 'video', background_video_link: 'https://www.youtube.com/watch?v=bg' }),
  ]);
  const about = tpl('About Us', 'page', [banner('About Us'), box([heading('Our Story'), text('<p>Gymzilla started in a garage in Springfield.</p>'), w('image', { image: img('garage.jpg') })]), box([heading('Meet the Coaches'), w('image', { image: img('coach.jpg') }), heading('Mike Tyson Jr', 'h4')])]);
  const services = tpl('Programs', 'page', [banner('Programs'), box([row([card('CrossFit', 'High intensity group classes.', 'p1.jpg'), card('Yoga', 'Stretch and breathe.', 'p2.jpg')])])]);
  const contact = tpl('Contact Us', 'page', [banner('Contact Us'), box([heading('Get in touch'), w('form', { form_name: 'Gym form', form_fields: [{ _id: 'f1', field_label: 'Name', placeholder: 'Your name' }], button_text: 'Send' }), w('google_maps', { address: 'Gymzilla HQ, Springfield' })])]);
  const header = tpl('Header', 'header', [row([w('image', { image: img('gymzilla-logo.png') }), w('nav-menu', { menu: 'gym-menu' }), button('Free Trial', '#join')])]);
  const footer = tpl('Footer', 'footer', [row([w('image', { image: img('gymzilla-logo-white.png') }), text('<p>The toughest gym in town.</p>')]), box([text('<p>© 2024 Gymzilla. All rights reserved.</p>')])]);
  const single = tpl('Single Post', 'single-post', [box([w('theme-post-title', {}), w('theme-post-featured-image', { __dynamic__: { image: '[elementor-tag id="x" name="post-featured-image"]' } }), w('theme-post-content', {}), heading('Join the club today')])]);
  const notFound = tpl('404 Page', 'page', [box([heading('Oops! Page not found')])]);
  const globals = tpl('Global Kit Styles', 'global-styles', [], {
    system_colors: [{ _id: 'primary', title: 'Primary', color: '#E63946' }, { _id: 'text', title: 'Text', color: '#333333' }],
    custom_colors: [{ _id: 'c1a2b3c', title: 'Dark', color: '#111111' }],
    system_typography: [{ _id: 'primary', title: 'Primary', typography_typography: 'custom', typography_font_family: 'Oswald' }],
    body_background_image: img('texture.jpg'),
    site_name: 'Gymzilla',
  });
  const files = { home, about, services, contact, header, footer, single, notFound, globals };
  const manifest = {
    manifest_version: '1.0.2',
    title: 'Gymzilla – Fitness Template Kit',
    page_builder: 'elementor',
    required_plugins: [
      { name: 'Elementor', version: '3.20', file: 'elementor/elementor.php' },
      { name: 'ElementsKit Lite', version: '3.0', file: 'elementskit-lite/elementskit-lite.php' },
      { name: 'Elementor Pro', version: '3.20', file: 'elementor-pro/elementor-pro.php' },
    ],
    templates: [
      { name: 'Global Kit Styles', source: 'templates/globals.json', type: 'global', metadata: { template_type: 'global-styles' } },
      { name: 'Home', source: 'templates/home.json', type: 'single-page', screenshot: 'screenshots/home.jpg' },
      { name: 'About Us', source: 'templates/about.json', type: 'single-page' },
      { name: 'Programs', source: 'templates/services.json', type: 'single-page' },
      { name: 'Contact Us', source: 'templates/contact.json', type: 'single-page' },
      { name: 'Header', source: 'templates/header.json', type: 'section', metadata: { template_type: 'header' } },
      { name: 'Footer', source: 'templates/footer.json', type: 'section', metadata: { template_type: 'footer' } },
      { name: 'Single Post', source: 'templates/single.json', type: 'single-post' },
      { name: '404 Page', source: 'templates/notFound.json', type: 'error-404' },
    ],
  };
  const zip = new AdmZip();
  zip.addFile('gymzilla/manifest.json', Buffer.from(JSON.stringify(manifest)));
  for (const [k, doc] of Object.entries(files)) zip.addFile(`gymzilla/templates/${k}.json`, Buffer.from(JSON.stringify(doc)));
  return zip;
}

// Demo content that must not remain. The structure of the kit stays, so its demo videos and the
// client logos (graphics, kept and reported in the checks) are the only demo content left.
const DEMO_STRINGS = ['Gymzilla', 'gymzilla', '555', 'hello@gymzilla-demo.com', 'Jane Cooper', 'Mike Tyson', 'Springfield', 'gym-menu', 'CrossFit', 'Train Harder', 'Gold Plan', '2500'];
const KEPT_DEMO_IMAGE = /^https:\/\/demo-gymzilla\.example\.com\/wp-content\/uploads\/2024\/logo-(nike|adidas|puma|reebok|ua)\.png$/;

test('section types and kit document preparation', () => {
  assert.equal(guessSectionType({ widgets: ['testimonial'], texts: [], images: 1 }, 'home', 3), 'testimonials');
  assert.equal(guessSectionType({ widgets: ['image'], texts: [], images: 5 }, 'home', 4), 'clients');
  assert.equal(guessSectionType({ widgets: ['heading', 'text-editor'], texts: ['About us'], images: 1 }, 'about', 0), 'page_title');

  // Services page: the cards of the kit stay (never cloned or removed); the first ones get the services
  const doc = { content: [banner('Programs'), box([row([card('A', 'a', 'a.jpg'), card('B', 'b', 'b.jpg')])])] };
  const before = structuredClone(doc);
  const site = { siteName: 'Rossi', phone: '+39 06 1234 5678', email: 'info@rossi.it', address: 'Via Roma 1', copyright: '© Rossi', hasLogo: true, mapEmbed: true, contactShortcode: '[contact-form-7 id="INSERIRE_ID"]', menuSlug: 'main', pages: { services: { title: 'Servizi', url: '/servizi/' } }, services: [1, 2, 3].map((i) => ({ name: `Service ${i}`, url: `/service-${i}/` })) };
  const { doc: out, marks, sections, notes } = prepareDocument(doc, 'services', [{ type: 'page_title' }, { type: 'services', description: 'program cards' }], site);
  const json = JSON.stringify(out);
  for (const i of [1, 2]) assert.ok(json.includes(`"Service ${i}"`) && json.includes(`/service-${i}/`), `card of service ${i}`);
  assert.ok(!json.includes('"Service 3"'), 'no card added for the 3rd service');
  assert.equal(notes.hiddenServices, 1);
  assert.ok(json.includes('"Servizi"'), 'banner title = page title');
  assert.equal(sections.length, 2);
  const slots = [...marks.values()].filter((m) => m.slot === 'service_list');
  assert.deepEqual(slots.map((m) => m.service), [0, 1]);
  assert.equal(outlineDocument(out).length, 2);
  assert.ok(compareStructure(before, out).ok, 'same structure as the kit');

  // More cards than services: the extra card stays, written by the AI, linked to the services page
  const two = { content: [box([row([card('A', 'a', 'a.jpg'), card('B', 'b', 'b.jpg'), card('C', 'c', 'c.jpg')])])] };
  const extra = prepareDocument(two, 'home', [{ type: 'services' }], { ...site, pages: { services: { title: 'Servizi', url: '/servizi/' } }, services: site.services.slice(0, 2) });
  assert.equal(extra.notes.extraCards, 1);
  assert.equal(JSON.stringify(extra.doc).match(/"title":"C"/g).length, 1, 'the title of the extra card is left to the AI');
  assert.ok([...extra.marks.values()].some((m) => /card beyond the listed services/.test(m.hint || '')));
  assert.ok(JSON.stringify(extra.doc).includes('/servizi/'));

  // Images: transparent PNG / SVG graphics of the design stay; photos are cropped like the demo photo
  const ornament = DEMO + 'leaf.png';
  const photo = DEMO + 'spa.jpg';
  const imgs = { content: [box([w('image', { image: { url: ornament, id: 1 }, image_size: 'medium' }), w('image', { image: { url: photo, id: 2 } }), w('image', { image: { url: photo, id: 3 }, image_size: 'custom', image_custom_dimension: { width: '500', height: '700' } })])] };
  const demo = { [ornament]: { file: 'a.png', width: 228, height: 288, opaque: false, format: 'png' }, [photo]: { file: 'b.jpg', width: 1920, height: 1080, opaque: true, format: 'jpg' } };
  const roles = [...prepareDocument(structuredClone(imgs), 'about', [{ type: 'about' }], site, demo).marks.entries()].filter(([k]) => k.includes(':image')).map(([, m]) => m);
  assert.deepEqual(roles.map((m) => m.slot), ['keep', 'photo', 'photo']);
  assert.deepEqual(roles[1].crop, { width: 1920, height: 1080 }, 'crop = size of the demo photo');
  assert.deepEqual(roles[2].crop, { width: 1920, height: 2688 }, 'crop = proportions of the custom size');
  // Not measured: a PNG shown small is a graphic, a JPG is a photo
  const guessed = [...prepareDocument(structuredClone(imgs), 'about', [{ type: 'about' }], site).marks.values()].map((m) => m.slot);
  assert.deepEqual(guessed, ['keep', 'photo', 'photo']);

  // The structure check sees every change that is not a text or an image
  const kitDoc = { content: [box([heading('Hello'), w('video', { youtube_url: 'x' }), text('<p>a</p>')], { background_color: '#fff' })] };
  const same = structuredClone(kitDoc);
  same.content[0].elements[0].settings.title = 'Ciao';
  assert.ok(compareStructure(kitDoc, same).ok, 'a new text is not a structure change');
  const broken = structuredClone(kitDoc);
  broken.content[0].elements[1].widgetType = 'image';
  broken.content[0].elements.pop();
  broken.content[0].settings.background_color = '#000';
  const report = compareStructure(kitDoc, broken);
  assert.equal(report.ok, false);
  assert.equal(report.changed.length, 1);
  assert.equal(report.removed.length, 1);
  assert.match(report.settings[0], /background_color/);
});

test('template kits: upload, AI analysis, roles, site generation and export without demo content', async () => {
  const provider = await api('POST', '/providers', { type: 'mock', name: 'Demo' });

  // Not a kit
  const bad = new FormData();
  bad.append('file', new Blob([new AdmZip().toBuffer()], { type: 'application/zip' }), 'empty.zip');
  await assert.rejects(api('POST', '/template-kits', bad), /No Elementor template/);

  // 1. Upload + AI analysis
  const zip = gymKit();
  zip.addFile('gymzilla/screenshots/home.jpg', await sharp({ create: { width: 40, height: 30, channels: 3, background: '#e63946' } }).jpeg().toBuffer());
  const form = new FormData();
  form.append('file', new Blob([zip.toBuffer()], { type: 'application/zip' }), 'gymzilla.zip');
  form.append('providerId', String(provider.id));
  const kit = await api('POST', '/template-kits', form);
  assert.equal(kit.analysis_error, null);
  assert.equal(kit.name, 'Gymzilla – Fitness Template Kit');
  assert.equal(kit.format, 'template-kit');
  assert.equal(kit.analyzed, true);
  assert.equal(kit.analyzed_by, 'Demo · mock-1');
  assert.equal(kit.page_count, 8, 'the global styles are not a page');
  assert.deepEqual(kit.roles, { home: 'Home', about: 'About Us', services: 'Programs', gallery: null, contact: 'Contact Us', single_post: 'Single Post', header: 'Header', footer: 'Footer' });
  assert.deepEqual(kit.required_plugins.map((p) => [p.slug, p.pro]), [['elementor', false], ['elementskit-lite', false], ['elementor-pro', true]]);
  assert.ok(kit.pro_widgets.includes('nav-menu') && kit.pro_widgets.includes('form'));
  assert.deepEqual(kit.styles.fonts, ['Oswald']);
  const homeTpl = kit.templates.find((t) => t.title === 'Home');
  assert.equal(homeTpl.sections.length, 8);
  assert.equal(homeTpl.sections[0].type, 'hero');
  assert.equal(homeTpl.sections[5].type, 'clients');
  assert.equal(kit.templates.find((t) => t.title === '404 Page').role, 'ignore');
  const shot = await fetch(`${base}/template-kits/${kit.id}/screenshot?path=${encodeURIComponent(kit.cover)}`);
  assert.equal(shot.status, 200);
  assert.equal((await fetch(`${base}/template-kits/${kit.id}/screenshot?path=manifest.json`)).status, 404, 'only screenshots are served');

  // 2. Roles: one template per role; null = back to the analysis
  const notFoundTpl = kit.templates.find((t) => t.title === '404 Page');
  let k = await api('PATCH', `/template-kits/${kit.id}`, { roles: { [notFoundTpl.id]: 'about' } });
  assert.equal(k.roles.about, '404 Page');
  assert.equal(k.templates.find((t) => t.title === 'About Us').role, 'ignore');
  k = await api('PATCH', `/template-kits/${kit.id}`, { roles: { [notFoundTpl.id]: null, [kit.templates.find((t) => t.title === 'About Us').id]: null }, name: 'Gym kit' });
  assert.equal(k.roles.about, 'About Us');
  assert.equal(k.name, 'Gym kit');
  await assert.rejects(api('PATCH', `/template-kits/${kit.id}`, { roles: { [notFoundTpl.id]: 'blog' } }), /Invalid role/);

  // 3. A plumber site made with the gym kit
  const pid = (await api('POST', '/projects', { site_name: 'Rossi Idraulica' })).id;
  await api('PATCH', `/projects/${pid}`, { phone: '+39 06 1234 5678', email: 'info@rossi-idraulica.it', address: 'Via Roma 1, Roma', city: 'Roma', language: 'en', settings: { generation: { providerId: provider.id } } });
  const services = [];
  for (const name of ['Boiler repair', 'Bathroom renovation', 'Leak detection', 'Water heaters']) services.push(await api('POST', `/projects/${pid}/services`, { name }));
  const imgs = new FormData();
  for (const [name, color] of [['hero.png', '#f00'], ['sub.png', '#0f0'], ['logo.png', '#000'], ['s1.png', '#00f'], ['s2.png', '#ff0'], ['s3.png', '#0ff'], ['s4.png', '#f0f'], ['work.png', '#888']]) {
    imgs.append('files', new Blob([await png(color)], { type: 'image/png' }), name);
  }
  const up = await (await fetch(`${base}/projects/${pid}/images`, { method: 'POST', body: imgs })).json();
  const [hero, sub, logo, ...rest] = up.created;
  await api('PATCH', `/images/${hero.id}`, { role: 'hero_home', alt_text: 'Plumber in Rome' });
  await api('PATCH', `/images/${sub.id}`, { role: 'subheader', alt_text: 'Bathroom' });
  await api('PATCH', `/images/${logo.id}`, { role: 'logo', alt_text: 'Logo' });
  for (const [i, s] of services.entries()) await api('PATCH', `/images/${rest[i].id}`, { role: 'service', service_id: s.id, alt_text: s.name });

  await assert.rejects(api('PUT', `/projects/${pid}/template-kit`, { kit_id: 9999 }), /404/);
  await api('PUT', `/projects/${pid}/template-kit`, { kit_id: kit.id });
  let p = await api('GET', `/projects/${pid}`);
  assert.equal(p.template_kit_id, kit.id);
  assert.ok(p.readiness.items.some((i) => i.step === 'site' && i.level === 'error' && /Industry is required/.test(i.message)), 'the business category is needed');
  p = await api('PATCH', `/projects/${pid}`, { industry: 'Plumber' });
  assert.equal(p.readiness.ready, true, JSON.stringify(p.readiness.items));
  assert.equal((await api('GET', '/template-kits')).find((x) => x.id === kit.id).used_by, 1);

  // The Template Kit prompt, with the analysis of the kit and the sections of the page
  assert.equal((await api('GET', `/prompts/site?project=${pid}`)).name, 'Sito da Template Kit Elementor (IT)');
  const preview = await api('POST', '/prompts/preview', { projectId: pid, pageKey: 'home' });
  assert.match(preview.prompt, /Template Kit Elementor `Gym kit`/);
  assert.match(preview.prompt, /Demo analysis of "Gymzilla – Fitness Template Kit"/, "the AI analysis of the kit");
  assert.match(preview.prompt, /1\. Hero/);
  assert.match(preview.prompt, /made for another business/);
  assert.doesNotMatch(preview.prompt, /\{\{[A-Z_]+\}\}/, 'no unresolved variable');

  const plan = await api('GET', `/projects/${pid}/plan`);
  assert.deepEqual(plan.pages.map((pg) => pg.key).filter((key) => !key.startsWith('post-')), ['home', 'about', 'services', 'gallery', 'contact', 'single-post', 'header', 'footer']);

  // 4. Generation
  const gen = await waitFor(await api('POST', `/projects/${pid}/generations`));
  assert.equal(gen.status, 'completed', gen.error || '');
  const page = (key) => gen.pages.find((pg) => pg.key === key);
  assert.match(page('home').templateTitle, /Gym kit – Home/);
  assert.match(page('gallery').templateTitle, /composed/);
  const homeFields = page('home').fields;
  assert.ok(homeFields.filter((f) => f.source === 'auto').some((f) => f.value === 'Boiler repair'), 'service card title = service name');
  assert.ok(homeFields.some((f) => f.format === 'number' && f.source === 'ai'), 'counters are written by the AI');
  assert.ok(homeFields.some((f) => f.widget === 'html' && f.source === 'ai'), 'texts of HTML widgets are written by the AI');
  assert.ok(homeFields.find((f) => f.widget === 'testimonial' && f.label.includes('name')).hint.includes('Testimonials'), 'hint = section of the kit');
  assert.equal(page('about').fields.find((f) => f.id === 'about.intro.heading1.title').value, 'About Us', 'banner title = page title');
  assert.ok(page('footer').fields.some((f) => f.source === 'auto' && /Rossi Idraulica/.test(f.value)), 'copyright of the site');

  // 5. Export: no demo content anywhere in the pages of the WordPress plugin
  const exp = await api('POST', `/generations/${gen.id}/export`);
  assert.ok(!exp.checks.some((c) => c.level === 'error'), JSON.stringify(exp.checks));
  const check = (re) => exp.checks.find((c) => re.test(c.message));
  assert.match(check(/Kit structure verified/).message, /^\*\*Kit structure verified\*\*: 8 pages and templates/, 'every page compared with its kit template (the composed gallery page with its composition)');
  assert.equal(check(/demo video/)?.level, 'warning', 'demo video reported');
  assert.equal(check(/client \/ partner logos/)?.level, 'warning', 'client logos reported');
  assert.equal(check(/could not be downloaded/)?.level, 'warning', 'graphics not bundled reported');
  const out = new AdmZip(Buffer.from(await (await fetch(base.replace(/\/api$/, '') + exp.pluginDownload)).arrayBuffer()));
  const entries = out.getEntries();
  const read = (suffix) => out.readAsText(entries.find((e) => e.entryName.endsWith(suffix)));
  const site = JSON.parse(read('data/site.json'));
  assert.deepEqual(site.requiredPlugins.map((x) => x.slug), ['elementskit-lite'], 'free plugins of the kit, not Elementor / Pro');
  assert.deepEqual(site.globalStyles.custom_colors, [{ _id: 'c1a2b3c', title: 'Dark', color: '#111111' }], 'global styles of the kit');
  assert.equal(site.globalStyles.body_background_image, undefined, 'no demo image in the global styles');
  assert.equal(site.globalStyles.site_name, undefined);

  const docs = entries.filter((e) => e.entryName.includes('data/elementor/')).map((e) => [e.entryName, out.readAsText(e)]);
  assert.ok(docs.length >= 12);
  for (const [name, json] of docs) {
    for (const url of json.match(/https:\/\/demo-gymzilla[^"]*/g) || []) assert.match(url, KEPT_DEMO_IMAGE, `${name}: demo photo left`);
    const content = json.replace(/https:\/\/demo-gymzilla[^"]*/g, '');
    for (const demo of DEMO_STRINGS) assert.ok(!content.includes(demo), `${name} still contains the demo "${demo}"`);
    assert.ok(!json.includes('kit.invalid'), `${name}: placeholder image left`);
  }
  const doc = (key) => docs.find(([name]) => name.endsWith(`/${key}.json`))[1];
  const servicesDoc = doc('services');
  // The services page of the kit has 2 cards: the first 2 services (no card is cloned)
  for (const s of services.slice(0, 2)) assert.ok(servicesDoc.includes(s.name) && servicesDoc.includes(`/${s.slug}/`), `card of ${s.name}`);
  assert.equal((servicesDoc.match(/"title_text"|"widgetType":"image"/g) || []).length, 2, 'the 2 cards of the kit');
  assert.equal(check(/fewer cards than services: 2 service/)?.level, 'warning', 'services not in the cards reported');
  assert.equal((doc('home').match(/"title":"(Boiler repair|Bathroom renovation|Leak detection|Water heaters)"/g) || []).length, 3, 'home keeps its 3 cards');
  assert.ok(doc('contact').includes('"widgetType":"form"') && doc('contact').includes('"field_label":"'), 'the Elementor Pro form of the kit stays (the plugin swaps it only without Pro)');
  assert.ok(!doc('contact').includes('"Your name"'), 'texts of the form written by the AI');
  assert.ok(doc('contact').includes('Via Roma 1'), 'map with the site address');
  assert.ok(/"widgetType":"image-gallery"/.test(doc('gallery')) && doc('gallery').includes('esg-image://'), 'gallery page with every photo');
  assert.ok(doc('header').includes('esg-image://') && doc('header').includes('"menu":"main-menu"'), 'logo and menu of the site');
  assert.ok(doc('home').includes('"testimonial_image":{') && /"testimonial_image":\{[^}]*"url":""/.test(doc('home')), 'demo avatar removed');
  assert.ok(/"widgetType":"video"/.test(doc('home')), 'the video widget of the kit stays');
  assert.ok((doc('home').match(/logo-(nike|adidas|puma|reebok|ua)\.png/g) || []).length === 5, 'client logos section kept');
  const post = doc(`post-${services[0].slug}`);
  assert.ok(post.includes('"widgetType":"image"') && post.includes('esg-image://'), 'article: featured image of the service');

  // 6. Sections of the pages chosen in the project: remove the client logos and the pricing table,
  //    add the "Our Story" section of the About template after the hero
  let sections = await api('GET', `/projects/${pid}/kit-sections`);
  const homeSections = sections.pages.find((pg) => pg.role === 'home');
  assert.equal(homeSections.sections.length, 8);
  assert.equal(homeSections.custom, false);
  const story = sections.templates.find((tp) => tp.title === 'About Us').sections[1];
  assert.match(story.texts.join(' '), /Our Story/);
  const chosen = homeSections.sections.filter((s) => !['clients', 'pricing'].includes(s.type)).map(({ template, index }) => ({ template, index }));
  chosen.splice(1, 0, { template: story.template, index: story.index });
  sections = await api('PUT', `/projects/${pid}/kit-sections`, { role: 'home', sections: chosen });
  assert.equal(sections.pages.find((pg) => pg.role === 'home').custom, true);
  const expectedTypes = homeSections.sections.filter((s) => !['clients', 'pricing'].includes(s.type)).map((s) => s.type);
  expectedTypes.splice(1, 0, 'about');
  assert.deepEqual(sections.pages.find((pg) => pg.role === 'home').sections.map((s) => s.type), expectedTypes);
  assert.equal(expectedTypes.length, 7);
  await assert.rejects(api('PUT', `/projects/${pid}/kit-sections`, { role: 'home', sections: [{ template: 'nope.json', index: 0 }] }), /only sections of the kit/);
  await assert.rejects(api('POST', `/generations/${gen.id}/export`), /sections of Home changed/, 'the page must be generated again');
  // Regenerating the page writes its texts for the new sections (the other pages keep theirs)
  const aboutBefore = JSON.stringify(gen.pages.find((pg) => pg.key === 'about').fields);
  await api('POST', `/generations/${gen.id}/pages/home/regenerate`);
  const regen = await waitFor(await api('GET', `/generations/${gen.id}`));
  assert.equal(regen.status, 'completed', regen.error || '');
  assert.equal(JSON.stringify(regen.pages.find((pg) => pg.key === 'about').fields), aboutBefore);
  assert.match(regen.pages.find((pg) => pg.key === 'home').templateTitle, /sections chosen for this site/);
  const exp2 = await api('POST', `/generations/${gen.id}/export`);
  assert.ok(!exp2.checks.some((c) => c.level === 'error'), JSON.stringify(exp2.checks));
  assert.ok(exp2.checks.some((c) => /Kit structure verified/.test(c.message)));
  assert.ok(!exp2.checks.some((c) => /client \/ partner logos/.test(c.message)), 'no client logos left');
  const out2 = new AdmZip(Buffer.from(await (await fetch(base.replace(/\/api$/, '') + exp2.pluginDownload)).arrayBuffer()));
  const home2 = out2.readAsText(out2.getEntries().find((e) => e.entryName.endsWith('data/elementor/home.json')));
  assert.ok(!/logo-nike|"widgetType":"price-table"/.test(home2), 'removed sections are not in the page');
  assert.equal(JSON.parse(home2).content.length, 7);
  // Back to the sections of the kit
  sections = await api('PUT', `/projects/${pid}/kit-sections`, { role: 'home', sections: null });
  assert.equal(sections.pages.find((pg) => pg.role === 'home').custom, false);

  // 7. Switching to a category template removes the kit, deleting the kit frees the projects
  const cat = await api('POST', '/template-categories', { name: 'Plumbers' });
  const draft = await api('POST', `/template-categories/${cat.id}/templates/generate`, { providerId: provider.id, language: 'en' });
  const tplRow = await api('POST', `/template-categories/${cat.id}/templates`, { name: 'Blue', spec: draft.spec });
  await api('PUT', `/projects/${pid}/template`, { template_id: tplRow.id });
  p = await api('GET', `/projects/${pid}`);
  assert.equal(p.template_kit_id, null);
  await assert.rejects(api('POST', `/generations/${gen.id}/export`), /another template/);
  await api('PUT', `/projects/${pid}/template-kit`, { kit_id: kit.id });
  assert.equal((await api('GET', `/projects/${pid}`)).template_id, null);
  // A kit changed after the generation must be generated again
  await api('PATCH', `/template-kits/${kit.id}`, { roles: { [notFoundTpl.id]: 'gallery' } });
  await assert.rejects(api('POST', `/generations/${gen.id}/export`), /Template Kit was changed/);

  await api('DELETE', `/template-kits/${kit.id}`);
  assert.equal((await api('GET', `/projects/${pid}`)).template_kit_id, null);
  assert.ok(!fs.existsSync(path.join(storage, 'kits', String(kit.id))));
});
