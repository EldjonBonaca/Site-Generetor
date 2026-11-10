/** Static website (HTML, CSS, JavaScript) rendered from the Elementor documents of a site (src/static). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'esg-static-'));
process.env.ENCRYPTION_KEY ||= 'a'.repeat(64);

const { Sheet, elementCss, globalsCss, color, unit, box, BASE_CSS } = await import('../src/static/css.js');
const { renderDocument, SITE_JS } = await import('../src/static/render.js');
const { buildStaticSite, relativeLink, IMAGE_SCHEME } = await import('../src/static/site.js');
const { sanitizeSpec } = await import('../src/templates/spec.js');
const { buildSite } = await import('../src/templates/builder.js');

const R = { texts: { name: 'Nome', email: 'Email', phone: 'Telefono', message: 'Messaggio', privacy: 'Accetto', send: 'Invia', sent: 'ok', failed: 'ko', menu: 'Menu', prev: 'Prec', next: 'Succ' }, menu: [{ title: 'Home', url: '/' }, { title: 'Contatti', url: '/contatti/' }], current: '/', formAction: 'send.php', title: 'Titolo', siteName: 'Rossi', home: '/' };

test('values and links: units, sides, global colors, relative addresses', () => {
  assert.equal(unit({ unit: 'px', size: 12 }), '12px');
  assert.equal(unit({ unit: 'em', size: 1.5 }), '1.5em');
  assert.equal(unit({ unit: 'px', size: '' }), null);
  assert.equal(box({ unit: 'px', top: '1', right: '2', bottom: '3', left: '4' }), '1px 2px 3px 4px');
  assert.equal(box({ unit: 'px', top: '', right: '', bottom: '', left: '' }), null);
  assert.equal(color({ title_color: '#112233' }, 'title_color'), '#112233');
  assert.equal(color({ title_color: '#112233', __globals__: { title_color: 'globals/colors?id=primary' } }, 'title_color'), 'var(--e-global-color-primary,#112233)');
  assert.equal(relativeLink('/', 0), 'index.html');
  assert.equal(relativeLink('/', 1), '../index.html');
  assert.equal(relativeLink('/chi-siamo/', 0), 'chi-siamo/index.html');
  assert.equal(relativeLink('/contatti/#modulo', 1), '../contatti/index.html#modulo');
  assert.equal(relativeLink('/cookie-policy', 1), '../cookie-policy/index.html');
  assert.equal(relativeLink('https://example.com/x', 1), 'https://example.com/x');
  assert.equal(relativeLink('tel:+39061234', 1), 'tel:+39061234');
  assert.match(globalsCss({ system_colors: [{ _id: 'primary', color: '#0A6E8A' }], system_typography: [{ _id: 'text', typography_font_family: 'Inter', typography_font_weight: '400' }] }), /^:root\{--e-global-color-primary:#0A6E8A;--e-global-typography-text-font-family:"Inter";--e-global-typography-text-font-weight:400\}$/);
});

test('an Elementor document as HTML and CSS: containers, widgets, responsive rules, menu, form, accordion', () => {
  const doc = {
    content: [
      {
        id: 'c000001',
        elType: 'container',
        isInner: false,
        settings: {
          content_width: 'boxed',
          boxed_width: { unit: 'px', size: 1200 },
          flex_direction: 'row',
          flex_gap: { unit: 'px', size: 28, column: '28', row: '28' },
          padding: { unit: 'px', top: '80', right: '20', bottom: '80', left: '20' },
          padding_mobile: { unit: 'px', top: '48', right: '16', bottom: '48', left: '16' },
          background_background: 'classic',
          background_color: '#101820',
          background_image: { url: `${IMAGE_SCHEME}hero.webp`, id: '' },
          background_overlay_background: 'gradient',
          background_overlay_color: 'rgba(0,0,0,.2)',
          background_overlay_color_b: 'rgba(0,0,0,.8)',
          background_overlay_gradient_angle: { unit: 'deg', size: 180 },
          shape_divider_bottom: 'tilt',
          shape_divider_bottom_color: '#FFFFFF',
          animation: 'fadeInUp',
          animation_delay: 120,
          css_classes: 'esg-under',
        },
        elements: [
          { id: 'w000001', elType: 'widget', widgetType: 'heading', settings: { title: 'Idraulico a <b>Roma</b>', header_size: 'h1', align: 'center', title_color: '#FFFFFF', typography_typography: 'custom', typography_font_family: 'Oswald', typography_font_size: { unit: 'px', size: 56 }, typography_font_size_mobile: { unit: 'px', size: 32 }, typography_font_weight: '700', __globals__: { title_color: 'globals/colors?id=primary' } }, elements: [] },
          { id: 'w000002', elType: 'widget', widgetType: 'button', settings: { text: 'Chiama <ora>', link: { url: '/contatti/', is_external: '' }, background_color: '#F2A541', button_text_color: '#111111', button_background_hover_color: '#000000', hover_color: '#FFFFFF', border_radius: { unit: 'px', top: '6', right: '6', bottom: '6', left: '6' }, text_padding: { unit: 'px', top: '16', right: '32', bottom: '16', left: '32' } }, elements: [] },
          { id: 'w000003', elType: 'widget', widgetType: 'navigation-menu', settings: { color_menu_item: '#222222', color_menu_item_hover: '#F2A541', menu_space_between: { unit: 'px', size: 30 } }, elements: [] },
          { id: 'w000004', elType: 'widget', widgetType: 'shortcode', settings: { shortcode: '[contact-form-7 id="1"]' }, elements: [] },
          { id: 'w000005', elType: 'widget', widgetType: 'accordion', settings: { tabs: [{ _id: 'a', tab_title: 'Domanda?', tab_content: '<p>Risposta.</p>' }], title_color: '#111111' }, elements: [] },
          { id: 'w000006', elType: 'widget', widgetType: 'image', settings: { image: { url: `${IMAGE_SCHEME}foto.webp`, alt: 'Una "foto"' }, width: { unit: 'px', size: 180 }, hide_mobile: 'hidden-mobile' }, elements: [] },
          { id: 'w000007', elType: 'widget', widgetType: 'html', settings: { html: '<p class="x">{{esg:t1}}</p><img {{esg:i2}}>', esg_parts: [{ _id: 't1', text: 'Testo nuovo' }, { _id: 'i2', image: { url: `${IMAGE_SCHEME}a.webp`, alt: 'A' } }] }, elements: [] },
          { id: 'w000008', elType: 'widget', widgetType: 'some-pro-widget', settings: {}, elements: [] },
        ],
      },
    ],
  };
  const { html, css, unknown } = renderDocument(doc, R);
  // Markup of Elementor: the CSS written for the WordPress sites applies to it
  assert.match(html, /^<div class="elementor-element elementor-element-c000001 e-flex e-con-boxed e-con e-parent esg-under esg-anim" data-id="c000001" style="--anim:esg-fadeInUp;--delay:120ms;"><div class="e-con-inner">/);
  assert.match(html, /<h1 class="elementor-heading-title elementor-size-default">Idraulico a <b>Roma<\/b><\/h1>/);
  assert.match(html, /<a class="elementor-button elementor-button-link elementor-size-sm" href="\/contatti\/">.*<span class="elementor-button-text">Chiama &lt;ora&gt;<\/span>/, 'plain texts are escaped');
  assert.match(html, /<div class="elementor-shape elementor-shape-bottom" aria-hidden="true"><svg viewBox="0 0 1000 100" preserveAspectRatio="none" style="height:70px"><path d="M0,100 L1000,100 L1000,0 Z" fill="#FFFFFF"\/>/);
  // The menu of the site with the current page; the contact form instead of the WordPress shortcode
  assert.match(html, /<ul class="hfe-nav-menu"><li class="menu-item current-menu-item"><a class="hfe-menu-item" href="\/" aria-current="page">Home<\/a><\/li><li class="menu-item"><a class="hfe-menu-item" href="\/contatti\/">Contatti<\/a><\/li><\/ul>/);
  assert.match(html, /<form class="wpcf7-form esg-contact-form" action="send\.php" method="post" novalidate>/);
  assert.doesNotMatch(html, /contact-form-7/);
  assert.match(html, /<details class="elementor-accordion-item" open><summary class="elementor-tab-title">/);
  assert.match(html, /<img src="esg-image:\/\/foto\.webp" alt="Una &quot;foto&quot;" loading="lazy" decoding="async">/);
  assert.match(html, /elementor-widget-image elementor-hidden-mobile/);
  assert.match(html, /<p class="x">Testo nuovo<\/p><img src="esg-image:\/\/a\.webp" alt="A">/, 'copied markup: its parts put back');
  assert.deepEqual(unknown, ['some-pro-widget'], 'a widget that cannot be rendered is reported');

  // What Elementor would generate from the settings
  assert.match(css, /\.elementor-element-c000001\{--flex-direction:row;--row-gap:28px;--column-gap:28px;--padding-top:80px;--padding-right:20px;--padding-bottom:80px;--padding-left:20px\}/);
  assert.match(css, /\.elementor-element-c000001\{--content-width:1200px\}/);
  assert.match(css, /\.elementor-element-c000001\{background-color:#101820;background-image:url\("esg-image:\/\/hero\.webp"\);background-position:center center;background-size:cover;background-repeat:no-repeat\}/);
  assert.match(css, /\.elementor-element-c000001::before\{--background-overlay:'';background-image:linear-gradient\(180deg,rgba\(0,0,0,\.2\) 0%,rgba\(0,0,0,\.8\) 100%\)\}/);
  assert.match(css, /\.elementor-element-w000001 \.elementor-heading-title\{color:var\(--e-global-color-primary,#FFFFFF\)\}/);
  assert.match(css, /\.elementor-element-w000001 \.elementor-heading-title\{font-family:"Oswald",sans-serif;font-weight:700\}/);
  assert.match(css, /\.elementor-element-w000002 \.elementor-button\{background-color:#F2A541;color:#111111;border-radius:6px 6px 6px 6px;padding:16px 32px 16px 32px\}/);
  assert.match(css, /\.elementor-element-w000002 \.elementor-button:hover,\.elementor-element-w000002 \.elementor-button:focus\{background-color:#000000;color:#FFFFFF\}/);
  assert.match(css, /@media\(max-width:767px\)\{\n[\s\S]*\.elementor-element-c000001\{--padding-top:48px;--padding-right:16px;--padding-bottom:48px;--padding-left:16px\}[\s\S]*\.elementor-element-w000001 \.elementor-heading-title\{font-size:32px\}/);
  // The base stylesheet turns the variables into the layout; the script is valid JavaScript
  assert.match(BASE_CSS, /\.e-con-boxed>\.e-con-inner\{[^}]*flex-direction:var\(--flex-direction\)[^}]*max-width:var\(--content-width\)/);
  assert.doesNotThrow(() => new Function('window', 'document', 'matchMedia', SITE_JS));

  const sheet = new Sheet();
  elementCss(sheet, { id: 'x1', elType: 'widget', widgetType: 'heading', settings: {} });
  assert.equal(sheet.toString(), '', 'no empty rule for an element without style settings');
});

test('a whole site of a template as static files: every widget of the builder is rendered, addresses relative per page', () => {
  const spec = sanitizeSpec({ sections: ['about', 'features', 'cta', 'services', 'gallery', 'reviews', 'stats', 'process', 'faq', 'highlights'], layout: { hero: 'slideshow', header: 'topbar', footerCta: 'large' } });
  const pages = { home: { title: 'Home', url: '/' }, about: { title: 'Chi siamo', url: '/chi-siamo/' }, services: { title: 'Servizi', url: '/servizi/' }, gallery: { title: 'Galleria', url: '/galleria/' }, contact: { title: 'Contatti', url: '/contatti/' } };
  const site = buildSite(spec, { lang: 'it', siteName: 'Rossi', phone: '+39 06 1234', email: 'info@rossi.it', address: 'Via Roma 1', copyright: '© Rossi', hasLogo: true, mapEmbed: true, contactShortcode: '[contact-form-7 id="1" title="Modulo"]', pages, services: [{ name: 'Caldaie', url: '/caldaie/' }], socials: [{ key: 'facebook', icon: 'fab fa-facebook-f', url: 'https://facebook.com/rossi' }] });
  const slugs = { home: '', about: 'chi-siamo', services: 'servizi', gallery: 'galleria', contact: 'contatti' };
  const out = buildStaticSite(
    {
      ctx: { project: { site_name: 'Rossi', language: 'it', email: 'info@rossi.it' } },
      pages: Object.keys(pages).map((role) => ({ role, title: pages[role].title, slug: slugs[role], seo: { title: `${pages[role].title} – Rossi`, description: 'Descrizione "della" pagina' }, doc: site.docs[role].doc })),
      templates: ['header', 'footer', 'single_post'].map((role) => ({ role, doc: site.docs[role].doc })),
      posts: [],
      images: [{ file: 'logo.png', logo: true }],
      siteCss: site.siteCss,
      globalStyles: site.globalStyles,
    },
    { siteIcon: 'logo-icon.png', legalPages: [{ text: 'Cookie Policy', url: '/cookie-policy' }] }
  );
  assert.deepEqual(out.notes, [], 'every widget the templates use has a renderer');
  const file = (p) => out.files.find((f) => f.path === p)?.data;
  for (const p of ['index.html', 'chi-siamo/index.html', 'servizi/index.html', 'galleria/index.html', 'contatti/index.html', 'cookie-policy/index.html', 'assets/css/site.css', 'assets/js/site.js', 'send.php', 'LEGGIMI.txt']) assert.ok(file(p), `missing ${p}`);
  const home = file('index.html');
  const contact = file('contatti/index.html');
  assert.match(home, /<title>Home – Rossi<\/title>\n<meta name="description" content="Descrizione &quot;della&quot; pagina">\n<link rel="icon" type="image\/png" href="assets\/img\/logo-icon\.png">/);
  assert.match(contact, /<link rel="icon" type="image\/png" href="\.\.\/assets\/img\/logo-icon\.png">/);
  assert.match(home, /fonts\.googleapis\.com\/css2\?family=/);
  assert.match(contact, /action="\.\.\/send\.php"/);
  assert.match(contact, /<a class="hfe-menu-item" href="\.\.\/index\.html">Home<\/a>/);
  assert.match(contact, /href="\.\.\/cookie-policy\/index\.html"/, 'the legal link of the footer leads to its page');
  for (const html of [home, contact]) assert.doesNotMatch(html, /esg-image:\/\/|href="\/[a-z]|contact-form-7|\{\{esg:/);
  // Wrapped like an Elementor page: the CSS copied with a website (….elementor .elementor-element-…) applies
  assert.match(home, /<main><div class="elementor">/);
  const css = file('assets/css/site.css');
  assert.match(css, /\.e-con\{--display:flex/);
  assert.match(css, /:root\{--e-global-color-primary:/);
  assert.match(file('send.php'), /\$to = "info@rossi\.it";/);
  assert.match(file('send.php'), /!filter_var\(\$email, FILTER_VALIDATE_EMAIL\)/);
});
