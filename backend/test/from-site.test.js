/** A website built with Elementor turned into a Template Kit with the same structure (kits/from-site.js). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'esg-fromsite-'));
process.env.ENCRYPTION_KEY ||= 'a'.repeat(64);

const { crawlSite, writeKitFromSite, adaptCss, globalStylesFromCss } = await import('../src/kits/from-site.js');
const { readKit, loadKitTemplate } = await import('../src/kits/read.js');
const { heuristicAnalysis, effectiveRoles } = await import('../src/kits/analysis.js');
const { outlineDocument } = await import('../src/kits/read.js');
const { analyzeDocument } = await import('../src/elementor/analyze.js');
const { buildKitSite } = await import('../src/kits/site.js');

const header = `<header class="ehf-header"><div data-elementor-type="wp-post" data-elementor-id="10" class="elementor elementor-10">
<div class="elementor-element elementor-element-a1b2c3d e-flex e-con-boxed e-con e-parent" data-id="a1b2c3d" data-element_type="container"><div class="e-con-inner">
 <div class="elementor-element elementor-element-10a0001 elementor-widget elementor-widget-image" data-id="10a0001" data-element_type="widget" data-widget_type="image.default"><div class="elementor-widget-container"><a href="/"><img src="https://ref.example/wp-content/uploads/logo.png"></a></div></div>
 <nav><a href="/">Home</a><a href="/chi-siamo/">Chi siamo</a><a href="/contatti/">Contatti</a><a href="#top">Top</a></nav>
</div></div></div></header>`;

const page = (id, body) => `<!doctype html><html lang="it"><head><title>Bianchi Impianti</title>
<link rel="stylesheet" id="elementor-post-${id}-css" href="/wp-content/uploads/elementor/css/post-${id}.css?ver=1">
<link rel="stylesheet" href="/wp-content/uploads/elementor/css/post-5.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Montserrat:400,700">
<link rel="stylesheet" href="/wp-content/themes/astra/style.css">
<style id="elementor-frontend-inline-css">.elementor-${id} .elementor-element.elementor-element-c0ffee1{--flex-direction:row;}</style>
</head><body>${header}
<div data-elementor-type="wp-page" data-elementor-id="${id}" class="elementor elementor-${id}">${body}</div>
<footer><div data-elementor-type="footer" data-elementor-id="11" class="elementor elementor-11 elementor-location-footer">
<div class="elementor-element elementor-element-f00f001 e-con-full e-flex e-con e-parent" data-id="f00f001" data-element_type="container">
 <div class="elementor-element elementor-element-f00f002 elementor-widget elementor-widget-text-editor" data-id="f00f002" data-element_type="widget" data-widget_type="text-editor.default"><div class="elementor-widget-container"><p>© Bianchi Impianti 2024</p></div></div>
</div></div></footer></body></html>`;

const home = page(
  20,
  `<div class="elementor-element elementor-element-c0ffee1 e-flex e-con-boxed e-con e-parent" data-id="c0ffee1" data-element_type="container" data-settings="{&quot;background_background&quot;:&quot;classic&quot;,&quot;animation&quot;:&quot;fadeIn&quot;}"><div class="e-con-inner">
  <div class="elementor-element elementor-element-a000001 elementor-widget elementor-widget-heading" data-id="a000001" data-element_type="widget" data-widget_type="heading.default"><div class="elementor-widget-container"><h1 class="elementor-heading-title elementor-size-default">Impianti idraulici a Torino</h1></div></div>
  <div class="elementor-element elementor-element-a000002 elementor-widget elementor-widget-text-editor" data-id="a000002" data-element_type="widget" data-widget_type="text-editor.default"><div class="elementor-widget-container"><p>Dal 1990 al vostro servizio.</p></div></div>
  <div class="elementor-element elementor-element-a000003 elementor-widget elementor-widget-button" data-id="a000003" data-element_type="widget" data-widget_type="button.default"><div class="elementor-widget-container"><div class="elementor-button-wrapper"><a class="elementor-button elementor-button-link elementor-size-sm" href="/contatti/"><span class="elementor-button-content-wrapper"><span class="elementor-button-text">Chiedi un preventivo</span></span></a></div></div></div>
  <div class="elementor-element elementor-element-c0ffee2 e-con-full e-flex e-con e-child" data-id="c0ffee2" data-element_type="container">
   <div class="elementor-element elementor-element-a000004 elementor-widget elementor-widget-icon-box" data-id="a000004" data-element_type="widget" data-widget_type="icon-box.default"><div class="elementor-widget-container"><div class="elementor-icon-box-wrapper"><div class="elementor-icon-box-icon"><span class="elementor-icon"><svg class="e-font-icon-svg e-fas-wrench"></svg></span></div><div class="elementor-icon-box-content"><h3 class="elementor-icon-box-title"><span>Pronto intervento</span></h3><p class="elementor-icon-box-description">In 2 ore a casa vostra.</p></div></div></div></div>
   <div class="elementor-element elementor-element-a000005 elementor-widget elementor-widget-counter" data-id="a000005" data-element_type="widget" data-widget_type="counter.default"><div class="elementor-widget-container"><div class="elementor-counter"><div class="elementor-counter-number-wrapper"><span class="elementor-counter-number" data-from-value="0" data-to-value="35">0</span><span class="elementor-counter-number-suffix">+</span></div><div class="elementor-counter-title">Anni di esperienza</div></div></div></div>
   <div class="elementor-element elementor-element-a000006 elementor-widget elementor-widget-image" data-id="a000006" data-element_type="widget" data-widget_type="image.default"><div class="elementor-widget-container"><img src="data:image/gif;base64,R0lGOD" data-src="/wp-content/uploads/2024/furgone.jpg"></div></div>
   <div class="elementor-element elementor-element-a000007 elementor-widget elementor-widget-ekit-heading" data-id="a000007" data-element_type="widget" data-widget_type="ekit-heading.default"><div class="elementor-widget-container"><div class="ekit-heading"><h2>Addon title</h2></div></div></div>
  </div>
 </div></div>`
);

const about = page(
  30,
  `<section class="elementor-section elementor-top-section elementor-element elementor-element-5ec7001 elementor-section-boxed elementor-section-height-default" data-id="5ec7001" data-element_type="section"><div class="elementor-background-overlay"></div><div class="elementor-container elementor-column-gap-wide">
  <div class="elementor-column elementor-col-50 elementor-top-column elementor-element elementor-element-c01a001" data-id="c01a001" data-element_type="column"><div class="elementor-widget-wrap elementor-element-populated">
   <div class="elementor-element elementor-element-b000001 elementor-widget elementor-widget-heading" data-id="b000001" data-element_type="widget" data-widget_type="heading.default"><div class="elementor-widget-container"><h2 class="elementor-heading-title">Chi siamo</h2></div></div>
  </div></div>
  <div class="elementor-column elementor-col-50 elementor-top-column elementor-element elementor-element-c01a002" data-id="c01a002" data-element_type="column"><div class="elementor-widget-wrap"><div class="deco"></div></div></div>
 </div></section>`
);

const css = {
  'post-20.css': `.elementor-20 .elementor-element.elementor-element-c0ffee1:not(.elementor-motion-effects-element-type-background){background-image:url("../../2024/hero.jpg");background-position:center center;background-size:cover;}
.elementor-20 .elementor-element.elementor-element-a000001 .elementor-heading-title{color:var(--e-global-color-primary);font-family:"Montserrat",sans-serif;font-size:58px;}
@media(max-width:767px){.elementor-20 .elementor-element.elementor-element-a000001 .elementor-heading-title{font-size:32px;}}`,
  'post-30.css': `.elementor-30 .elementor-element.elementor-element-5ec7001 > .elementor-background-overlay{background-color:#00000080;}
.elementor-30 .elementor-element.elementor-element-5ec7001{background-image:url(https://ref.example/wp-content/uploads/team.jpg);padding:120px 0}
.elementor-30 .elementor-element.elementor-element-5ec7001 .deco{background-image:url(/wp-content/uploads/wave.svg)}`,
  'post-5.css': `.elementor-kit-5{--e-global-color-primary:#0A6E8A;--e-global-color-secondary:#F4B400;--e-global-color-6a1b2c3:#F7F3EE;--e-global-typography-primary-font-family:"Montserrat";--e-global-typography-primary-font-weight:700;}
.elementor-kit-5 a{color:var(--e-global-color-primary);}`,
};

const fakeFetch = async (url) => {
  const u = new URL(url);
  const file = u.pathname.split('/').pop();
  if (u.pathname.endsWith('.css')) return new Response(css[file] || 'body{}', { headers: { 'content-type': 'text/css' } });
  const html = u.pathname === '/' ? home : u.pathname === '/chi-siamo/' ? about : null;
  return html ? new Response(html, { headers: { 'content-type': 'text/html' } }) : new Response('not found', { status: 404 });
};
const lookup = async () => [{ address: '93.184.216.34', family: 4 }];

test('an Elementor website becomes a Template Kit with the same structure, its CSS and global styles', async () => {
  const site = await crawlSite('ref.example', { fetchImpl: fakeFetch, lookup });
  assert.deepEqual(site.pages.map((p) => p.url.pathname), ['/', '/chi-siamo/'], 'home + the menu pages that answer');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esg-kit-'));
  const out = writeKitFromSite(site, dir);
  assert.equal(out.pages, 2);
  assert.ok(out.header && out.footer);
  assert.deepEqual(out.notes, ['ekit-heading'], 'the addon widget is kept as HTML');

  const info = readKit(dir);
  assert.deepEqual(info.templates.map((t) => [t.title, t.suggestedRole]), [['Home', 'home'], ['Chi siamo (chi-siamo)', 'about'], ['Header', 'header'], ['Footer', 'footer']]);
  assert.equal(info.globalStyles.system_colors.find((c) => c._id === 'primary').color, '#0A6E8A');
  assert.equal(info.globalStyles.custom_colors[0]._id, '6a1b2c3');

  // Same elements, same ids, content in the settings
  const homeDoc = loadKitTemplate(dir, info.templates[0].id);
  const hero = homeDoc.content[0];
  assert.equal(hero.id, 'c0ffee1');
  assert.equal(hero.elType, 'container');
  assert.equal(hero.settings.animation, 'fadeIn', 'data-settings kept');
  assert.equal(hero.settings.background_image.url, 'https://ref.example/wp-content/uploads/2024/hero.jpg', 'background photo from the CSS into the settings');
  const [h1, txt, btn, row] = hero.elements;
  assert.deepEqual([h1.widgetType, h1.settings.title, h1.settings.header_size], ['heading', 'Impianti idraulici a Torino', 'h1']);
  assert.equal(txt.settings.editor, '<p>Dal 1990 al vostro servizio.</p>');
  assert.equal(btn.settings.text, 'Chiedi un preventivo');
  assert.equal(btn.settings.link.url, '/contatti/', 'links to the pages of the site: relative (pages of the new site)');
  assert.ok(row.isInner && row.settings.content_width === 'full');
  const [box, counter, img, addon] = row.elements;
  assert.deepEqual([box.settings.title_text, box.settings.selected_icon.value], ['Pronto intervento', 'fas fa-wrench']);
  assert.deepEqual([counter.settings.ending_number, counter.settings.suffix, counter.settings.title], [35, '+', 'Anni di esperienza']);
  assert.equal(img.settings.image.url, 'https://ref.example/wp-content/uploads/2024/furgone.jpg', 'lazy image: the real url');
  assert.equal(addon.widgetType, 'html');

  // The kit analyzer sees texts to rewrite and photos to replace
  const a = analyzeDocument(homeDoc, { prefix: 'x', htmlText: true, numbers: true });
  assert.ok(a.fields.some((f) => f.original === 'Impianti idraulici a Torino'));
  assert.ok(a.slots.some((s) => s.key === 'background_image') && a.slots.some((s) => s.key === 'image'));

  // Sections + columns (older Elementor), the overlay of the section
  const aboutDoc = loadKitTemplate(dir, info.templates[1].id);
  const sec = aboutDoc.content[0];
  assert.deepEqual([sec.elType, sec.settings.layout, sec.settings.gap, sec.settings.background_overlay_background], ['section', 'boxed', 'wide', 'classic']);
  assert.deepEqual(sec.elements.map((c) => [c.elType, c.settings._column_size]), [['column', 50], ['column', 50]]);
  assert.equal(sec.settings.background_image.url, 'https://ref.example/wp-content/uploads/team.jpg');

  // CSS: scoped to the same ids, photos removed (they are in the settings), svg decoration kept absolute, fonts imported
  const siteCss = fs.readFileSync(path.join(dir, 'site.css'), 'utf8');
  assert.match(siteCss, /body \.elementor \.elementor-element\.elementor-element-a000001 \.elementor-heading-title\{color:var\(--e-global-color-primary\)/);
  assert.match(siteCss, /@media\(max-width:767px\)\{body \.elementor \.elementor-element\.elementor-element-a000001/);
  assert.doesNotMatch(siteCss, /hero\.jpg|team\.jpg/);
  assert.match(siteCss, /url\("https:\/\/ref\.example\/wp-content\/uploads\/wave\.svg"\)/);
  assert.match(siteCss, /body\{--e-global-color-primary:#0A6E8A/);
  assert.match(siteCss, /@import url\("https:\/\/fonts\.googleapis\.com\/css\?family=Montserrat:100,200,300/);
  assert.match(siteCss, /padding:120px 0/);
  assert.ok(siteCss.indexOf('{--flex-direction:row;}') > siteCss.indexOf('body{}'), 'the CSS keeps the order of the page: the inline style after the theme stylesheet');

  // Built as a kit site: the CSS goes to the Additional CSS of WordPress
  const outlines = Object.fromEntries(info.templates.map((t) => [t.id, outlineDocument(loadKitTemplate(dir, t.id))]));
  const analysis = heuristicAnalysis(info.templates, outlines);
  const kit = { id: 1, name: 'x', dir, info, analysis, roles: effectiveRoles(info, analysis, {}), demoImages: {} };
  const built = buildKitSite(kit, { lang: 'it', siteName: 'Rossi', pages: { home: { title: 'Home', url: '/' }, about: { title: 'Chi siamo', url: '/chi-siamo/' }, services: { title: 'Servizi', url: '/servizi/' }, gallery: { title: 'Galleria', url: '/galleria/' }, contact: { title: 'Contatti', url: '/contatti/' } }, services: [], copyright: '' });
  assert.match(built.siteCss, /elementor-element-a000001/);
});

test('preview of a kit page: the Elementor markup of the structure, its CSS, no scripts', async () => {
  const { previewPage, renderDocument, PREVIEW_CSP } = await import('../src/kits/preview.js');
  const site = await crawlSite('ref.example', { fetchImpl: fakeFetch, lookup });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esg-kit-'));
  writeKitFromSite(site, dir);
  const info = readKit(dir);
  const by = (role) => loadKitTemplate(dir, info.templates.find((t) => t.suggestedRole === role).id);
  const html = previewPage({ dir, info }, { header: by('header'), page: by('home'), footer: by('footer') }, 'Home');
  // Same classes and ids as on Elementor: the copied CSS styles them
  assert.match(html, /class="elementor-element elementor-element-c0ffee1 e-flex e-con-boxed e-con e-parent[^"]*" data-id="c0ffee1"/);
  assert.match(html, /<h1 class="elementor-heading-title elementor-size-default">Impianti idraulici a Torino<\/h1>/);
  assert.match(html, /background-image:url\('https:\/\/ref\.example\/wp-content\/uploads\/2024\/hero\.jpg'\)/, 'background photo from the settings');
  assert.match(html, /elementor-widget-ekit-heading/, 'the widget class of an add-on kept as HTML stays');
  assert.match(html, /body \.elementor \.elementor-element\.elementor-element-a000001/, 'the CSS of the site');
  assert.match(html, /--e-global-color-primary:#0A6E8A/);
  assert.match(PREVIEW_CSP, /sandbox/);
  assert.doesNotMatch(PREVIEW_CSP, /script-src|allow-scripts/);
  // Texts are escaped where Elementor escapes them
  assert.match(renderDocument([{ id: 'x1', elType: 'widget', widgetType: 'button', settings: { text: '<b>Go</b>', link: { url: '/' } } }]), /&lt;b&gt;Go&lt;\/b&gt;/);
});

test('a website not built with Elementor is refused with an explanation', async () => {
  const plain = async () => new Response('<html><body><h1>Hello</h1><nav><a href="/x">x</a></nav></body></html>', { headers: { 'content-type': 'text/html' } });
  const site = await crawlSite('plain.example', { fetchImpl: plain, lookup });
  assert.throws(() => writeKitFromSite(site, fs.mkdtempSync(path.join(os.tmpdir(), 'esg-kit-'))), /not built with Elementor/);
});

test('global styles and CSS helpers', () => {
  assert.equal(globalStylesFromCss('body{}'), null);
  // The colors and fonts of a new Elementor kit are not the palette of the site
  assert.equal(globalStylesFromCss('.elementor-kit-5{--e-global-color-primary:#6EC1E4;--e-global-color-secondary:#54595F;--e-global-color-text:#7A7A7A;--e-global-color-accent:#61CE70;--e-global-typography-primary-font-family:"Roboto"}'), null);
  assert.deepEqual(globalStylesFromCss('x{--e-global-color-primary:#6EC1E4;--e-global-color-accent:#FF5500}').system_colors.map((c) => c._id), ['accent']);
  const { backgrounds } = adaptCss([{ base: 'https://a.example/x/', text: '.elementor-1 .elementor-element.elementor-element-abc1234::before{background-image:url(a.jpg)}' }], new Map([['abc1234', {}]]));
  assert.equal(backgrounds.size, 0, 'overlays / pseudo elements are not photos of the element');
});
