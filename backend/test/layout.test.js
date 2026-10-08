/**
 * End-to-end test of the built-in clean layout (no Template Kit): exact sections of every page,
 * fixed links, real reviews, brand color from the logo, service articles as Elementor documents.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'esg-layout-'));
process.env.ENCRYPTION_KEY ||= 'd'.repeat(64);

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
const png = (color, width = 800, height = 500) => sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer();

/** Logo: a red mark on a white background (the white must be ignored). */
const logoPng = () =>
  sharp({ create: { width: 300, height: 100, channels: 3, background: '#ffffff' } })
    .composite([{ input: { create: { width: 120, height: 80, channels: 3, background: '#c0392b' } }, left: 10, top: 10 }])
    .png()
    .toBuffer();

const widgets = (el, out = []) => {
  if (el?.elType === 'widget') out.push(el);
  for (const c of el?.elements || []) widgets(c, out);
  return out;
};

test('built-in layout: clean pages, fixed links, reviews, logo color, Elementor articles', async () => {
  const p = await api('POST', '/projects', { site_name: 'Salone Manuel' });
  const pid = p.id;
  assert.equal(p.settings.layout, 'builtin', 'new projects use the built-in layout');
  await api('PATCH', `/projects/${pid}`, {
    phone: '+39 02 555 1234',
    email: 'info@salonemanuel.it',
    address: 'Via Roma 1\n20100 Milano',
    image_base_url: 'https://salonemanuel.it/wp-content/uploads/',
    settings: {
      reviews: [
        { name: 'Giulia R.', role: 'Cliente', text: 'Taglio perfetto e personale gentilissimo.' },
        { name: 'Marco T.', text: 'Colore fatto benissimo, tornerò sicuramente.' },
        { name: '', text: '   ' }, // empty review: ignored
      ],
    },
  });
  const services = [];
  for (const name of ['Taglio', 'Colore', 'Piega', 'Trattamenti']) services.push(await api('POST', `/projects/${pid}/services`, { name }));

  const fd = new FormData();
  fd.append('files', new Blob([await logoPng()], { type: 'image/png' }), 'logo.png');
  const colors = ['#223', '#334', '#445', '#556', '#667', '#778', '#889', '#99a'];
  for (const [i, c] of colors.entries()) fd.append('files', new Blob([await png(c)], { type: 'image/png' }), `foto-${i}.png`);
  const { created } = await api('POST', `/projects/${pid}/images`, fd);
  await api('PATCH', `/images/${created[0].id}`, { role: 'logo', alt_text: 'Logo' });
  await api('PATCH', `/images/${created[1].id}`, { role: 'hero_home', alt_text: 'Salone' });
  await api('PATCH', `/images/${created[2].id}`, { role: 'subheader', alt_text: 'Banner' });
  for (const [i, s] of services.entries()) await api('PATCH', `/images/${created[3 + i].id}`, { role: 'service', service_id: s.id, alt_text: s.name });

  const color = await api('GET', `/projects/${pid}/brand-color`);
  assert.equal(color.logo, '#c0392b', 'brand color detected in the logo');

  const provider = await api('POST', '/providers', { type: 'mock' });
  await api('PATCH', `/projects/${pid}`, { settings: { generation: { providerId: provider.id } } });

  const plan = await api('GET', `/projects/${pid}/plan`);
  assert.deepEqual(plan.pages.map((x) => x.key), ['home', 'about', 'services', 'gallery', 'contact', ...services.map((s) => `post-${s.slug}`), 'header', 'footer']);
  assert.equal(plan.readiness.ready, true, JSON.stringify(plan.readiness.items));
  assert.ok(!plan.readiness.items.some((i) => i.step === 'kit'), 'no kit needed');

  let gen = await api('POST', `/projects/${pid}/generations`);
  while (['queued', 'running'].includes(gen.status)) {
    await new Promise((r) => setTimeout(r, 150));
    gen = await api('GET', `/generations/${gen.id}`);
  }
  assert.equal(gen.status, 'completed', gen.error || '');
  const page = (key) => gen.pages.find((x) => x.key === key);
  // Links and contact/structural texts are not AI fields
  for (const pg of gen.pages) assert.ok(!pg.fields.some((f) => f.format === 'link'), `${pg.key} has no link field`);
  assert.ok(!page('footer').fields.some((f) => /icon_list/.test(f.id)), 'footer link lists are fixed');
  assert.ok(!page('home').fields.some((f) => f.widget === 'testimonial'), 'reviews are never written by the AI');
  // Service cards: name = service, description by the AI with a hint
  const cardTitles = page('services').fields.filter((f) => f.card != null && f.widget === 'heading');
  assert.deepEqual(cardTitles.map((f) => f.value), services.map((s) => s.name));
  assert.ok(page('services').fields.some((f) => f.card != null && f.widget === 'text-editor' && f.source === 'ai' && f.maxLength === 280));
  assert.equal(page('about').fields.find((f) => f.id === 'about.intro.heading1.title').value, 'Chi Siamo', 'banner title = page title');

  const exp = await api('POST', `/generations/${gen.id}/export`);
  assert.ok(!exp.checks.some((c) => c.level === 'error'), JSON.stringify(exp.checks));
  const zip = new AdmZip(Buffer.from(await (await fetch(base.replace('/api', '') + exp.download)).arrayBuffer()));
  const root = 'output-salone-manuel/';
  const files = zip.getEntries().map((e) => e.entryName.slice(root.length));
  assert.ok(!files.includes('elementor-kit.zip'), 'no kit in the built-in layout');
  const doc = (key) => JSON.parse(zip.readAsText(`${root}templates/${key}.json`));
  const baseUrl = 'https://salonemanuel.it/wp-content/uploads/';

  // Home: hero, about, services, carousel, reviews — nothing else
  const home = doc('home');
  assert.equal(home.content.length, 5);
  assert.match(home.content[0].settings.background_image.url, /-hero\.webp$/);
  const homeWidgets = widgets({ elements: home.content });
  const buttons = homeWidgets.filter((w) => w.widgetType === 'button').map((w) => w.settings.link.url);
  assert.deepEqual(buttons, ['/contatti/', '/chi-siamo/', ...services.map((s) => `/${s.slug}/`), '/servizi/', '/galleria/']);
  const carousel = homeWidgets.find((w) => w.widgetType === 'image-carousel');
  assert.equal(carousel.settings.carousel.length, 8, 'carousel shows every photo');
  assert.ok(carousel.settings.carousel.every((i) => i.url.startsWith(baseUrl)));
  const reviews = homeWidgets.filter((w) => w.widgetType === 'testimonial');
  assert.deepEqual(reviews.map((w) => w.settings.testimonial_name), ['Giulia R.', 'Marco T.']);
  assert.equal(reviews[0].settings.testimonial_content, 'Taglio perfetto e personale gentilissimo.');

  // About: banner + 2 text/photo blocks, no team
  const about = doc('about');
  assert.equal(about.content.length, 3);
  assert.match(about.content[0].settings.background_image.url, /-subheader\.webp$/);
  assert.ok(!JSON.stringify(about).includes('team'));

  // Services: banner + one card per service with its photo and article link
  const servicesDoc = doc('services');
  assert.equal(servicesDoc.content.length, 2);
  const svcWidgets = widgets({ elements: servicesDoc.content });
  assert.equal(svcWidgets.filter((w) => w.widgetType === 'image').length, 4);
  assert.deepEqual(svcWidgets.filter((w) => w.widgetType === 'heading').slice(1).map((w) => w.settings.title), services.map((s) => s.name));
  assert.deepEqual(svcWidgets.filter((w) => w.widgetType === 'button').map((w) => w.settings.link.url), services.map((s) => `/${s.slug}/`));

  // Gallery: banner + every photo in an image gallery with lightbox
  const gallery = widgets({ elements: doc('gallery').content }).find((w) => w.widgetType === 'image-gallery');
  assert.equal(gallery.settings.wp_gallery.length, 8);
  assert.equal(gallery.settings.open_lightbox, 'yes');

  // Contact: details, styled CF7 form, map
  const contact = JSON.stringify(doc('contact'));
  assert.ok(contact.includes('[contact-form-7 id=\\"INSERIRE_ID\\"'));
  assert.match(contact, /"css_classes":"esg-form"/);
  assert.match(contact, /\.esg-form input\[type=submit\]\{width:100%;background:#c0392b/);
  assert.match(contact, /tel:\+390255512\d+/);
  assert.match(contact, /maps\?q=Via%20Roma%201%2C%2020100%20Milano/);

  // Header (logo + menu + phone) and footer (links, contacts, copyright)
  const header = JSON.stringify(doc('header'));
  assert.match(header, /"widgetType":"nav-menu"/);
  assert.match(header, /"menu":"menu-principale"/);
  assert.match(header, new RegExp(`"url":"${baseUrl}logo\\.webp"`));
  const footer = JSON.stringify(doc('footer'));
  assert.match(footer, /"text":"Chi Siamo","selected_icon".*"url":"\/chi-siamo\/"/);
  assert.match(footer, new RegExp(`© ${new Date().getFullYear()} Salone Manuel\\. Tutti i diritti riservati\\.`));

  // WordPress plugin: each article has its Elementor document (logo-colored banner + text)
  const plugin = new AdmZip(zip.readFile(root + 'salone-manuel-site.zip'));
  const site = JSON.parse(plugin.readAsText('salone-manuel-site/data/site.json'));
  assert.deepEqual(site.templates.map((t) => t.role), ['header', 'footer'], 'no single post template needed');
  assert.ok(site.posts.every((x) => x.elementor && !('doc' in x)));
  const post = JSON.parse(plugin.readAsText(`salone-manuel-site/data/${site.posts[0].elementor}`));
  assert.equal(post.content.length, 2);
  assert.equal(post.content[0].settings.background_color, '#c0392b');
  assert.equal(widgets(post.content[0])[0].settings.title, services[0].name);
  assert.ok(widgets(post.content[1])[0].settings.editor.replace(/<[^>]+>/g, '').length >= 300);
  assert.equal(site.globalStyles.system_colors[0].color, '#c0392b');
  const php = plugin.readAsText('salone-manuel-site/salone-manuel-site.php');
  assert.match(php, /'comment_status' => 'closed'/);
});

test('brand palette: light logo colors are darkened for readable buttons', async () => {
  const { makeDesign } = await import('../src/elementor/layout.js');
  assert.equal(makeDesign('#c0392b').onPrimary, '#ffffff');
  const yellow = makeDesign('#ffe14d');
  assert.notEqual(yellow.primary, '#ffe14d');
  assert.equal(makeDesign('not-a-color').primary, '#1f4e79');
});
