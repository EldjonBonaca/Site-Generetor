/**
 * Unit tests of the category templates: spec validation and the Elementor builder.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'esg-tpl-'));
process.env.ENCRYPTION_KEY ||= 'd'.repeat(64);

const { analyzeDocument } = await import('../src/elementor/analyze.js');
const { sanitizeSpec, DEFAULT_SPEC, FONTS, tint, siteColors: siteColorsOf } = await import('../src/templates/spec.js');
const { buildSite, DOC_ROLES, TEMPLATE_IMAGE, highlightTitles } = await import('../src/templates/builder.js');
/** Documents of a built site, with the site CSS (Additional CSS of WordPress) as their non-enumerable `css`. */
const withCss = ({ docs, siteCss }) => Object.defineProperty(docs, 'css', { value: siteCss });
const { buildTemplatePrompt, generateTemplateSpec } = await import('../src/templates/generate.js');
const { default: MockProvider } = await import('../src/ai/providers/mock.js');

test('sanitizeSpec turns any AI answer into a valid template spec', () => {
  const spec = sanitizeSpec({
    style: { colors: { primary: '#abc', secondary: 'red', text: '#123456' }, fonts: { heading: 'comic sans', body: 'lato' }, radius: 99, spacing: 'huge' },
    layout: { hero: 'SPLIT', cta: 'nope' },
    icons: ['fa-bolt', 'fas fa-unknown'],
    copy: { heroTitle: '  Hello <script>x</script> world  ', features: [{ title: 'A' }], reviews: 'none' },
  });
  assert.equal(spec.style.colors.primary, '#AABBCC', 'short hex expanded');
  assert.equal(spec.style.colors.secondary, DEFAULT_SPEC.style.colors.secondary, 'invalid color -> default');
  assert.equal(spec.style.fonts.heading, DEFAULT_SPEC.style.fonts.heading, 'unknown font -> default');
  assert.equal(spec.style.fonts.body, 'Lato', 'font names are matched case-insensitively');
  assert.ok(FONTS.includes(spec.style.fonts.heading));
  assert.equal(spec.style.radius, 30);
  assert.equal(spec.style.spacing, 'normal');
  assert.equal(spec.layout.hero, 'split');
  assert.equal(spec.layout.cta, 'banner');
  assert.deepEqual(spec.icons.slice(0, 2), ['fas fa-bolt', DEFAULT_SPEC.icons[1]]);
  assert.equal(spec.copy.heroTitle, 'Hello x world');
  assert.equal(spec.copy.features.length, 6, 'six strengths, the layout shows the first ones');
  assert.equal(spec.copy.features[0].title, 'A');
  assert.equal(spec.copy.reviews.length, 3);
  assert.deepEqual(sanitizeSpec(null), sanitizeSpec({}), 'nothing -> the default template');
});

const sampleSite = (services = 4) => ({
  lang: 'it',
  siteName: 'Edil Test',
  phone: '+39 02 1234 567',
  email: 'info@ediltest.it',
  address: 'Via Roma 1, Milano',
  copyright: '© 2026 Edil Test',
  hasLogo: true,
  mapEmbed: true,
  contactShortcode: '[contact-form-7 id="INSERIRE_ID" title="Modulo di contatto"]',
  pages: {
    home: { title: 'Home', url: '/' },
    about: { title: 'Chi Siamo', url: '/chi-siamo/' },
    services: { title: 'Servizi', url: '/servizi/' },
    gallery: { title: 'Galleria', url: '/galleria/' },
    contact: { title: 'Contatti', url: '/contatti/' },
  },
  services: Array.from({ length: services }, (_, i) => ({ name: `Servizio ${i + 1}`, url: `/servizio-${i + 1}/` })),
});

test('buildSite: every variant builds valid documents whose marks match the analysis', () => {
  const variants = [
    {},
    { layout: { header: 'topbar', hero: 'split', features: 'cards', cta: 'split', services: 'boxed', contact: 'stacked', footer: 'light', testimonials: 'minimal', gallery: '4' } },
    { layout: { header: 'centered', hero: 'left' }, sections: ['highlights', 'about', 'stats', 'features', 'services', 'process', 'gallery', 'reviews', 'faq'] },
    // Every look and layout value of the design directions
    { style: { theme: 'dark', buttons: 'square', cards: 'accent', titles: 'bar', align: 'left', scale: 'xl', images: 'square', titleCase: 'upper' }, layout: { header: 'bold', hero: 'bottom', about: 'wide', features: 'list', services: 'overlay', testimonials: 'band', footer: 'brand', divider: 'tilt' } },
    { style: { theme: 'light', buttons: 'pill', cards: 'tinted', titles: 'plain', scale: 'large', images: 'framed' }, layout: { hero: 'card', about: 'image-right', features: 'cards', services: 'cards', testimonials: 'cards', footer: 'light', divider: 'waves' } },
    { style: { theme: 'dark', cards: 'outline', titles: 'line', images: 'framed' }, layout: { header: 'topbar', hero: 'split', features: 'icons', services: 'boxed', contact: 'stacked', footer: 'dark', divider: 'none' } },
    // Elegant variants: editorial hero, photo badge, numbered service rows, big quote, arched photos, labels
    { style: { images: 'arch', kicker: 'dash', titles: 'plain' }, layout: { hero: 'editorial', about: 'badge', services: 'list', testimonials: 'quote' }, sections: ['about', 'stats', 'features', 'services', 'gallery', 'reviews'] },
    { style: { theme: 'dark', images: 'arch', kicker: 'pill', align: 'left' }, layout: { hero: 'split', about: 'badge', services: 'list', testimonials: 'quote' } },
    // Page banners, key numbers, how we work and colored bands
    { style: { fill: 'flat', kicker: 'dash' }, layout: { subheader: 'plain', stats: 'inline', process: 'timeline', footer: 'brand' }, sections: ['highlights', 'about', 'stats', 'features', 'services', 'process', 'gallery', 'reviews'] },
    { style: { theme: 'dark', fill: 'deep', titles: 'bar', buttons: 'square' }, layout: { subheader: 'split', stats: 'cards', process: 'vertical', about: 'badge', testimonials: 'band' }, sections: ['about', 'stats', 'features', 'cta', 'services', 'process', 'gallery', 'reviews'] },
    { style: { fill: 'radial', align: 'center', kicker: 'pill' }, layout: { subheader: 'plain', stats: 'band', process: 'vertical', cta: 'split' }, sections: ['highlights', 'about', 'stats', 'features', 'cta', 'services', 'process', 'gallery', 'reviews', 'faq'] },
    // Entrance animations, card hover, edge shapes on the hero and on the colored bands
    { style: { motion: 'none', hover: 'glow', edges: 'all' }, layout: { divider: 'mountains', features: 'cards', testimonials: 'band', stats: 'band' }, sections: ['about', 'stats', 'features', 'cta', 'services', 'gallery', 'reviews'] },
    { style: { motion: 'slide', hover: 'underline', edges: 'all', theme: 'dark' }, layout: { divider: 'zigzag', cta: 'banner' }, sections: ['stats', 'about', 'features', 'cta', 'services', 'gallery', 'reviews'] },
    { style: { motion: 'fade', hover: 'still' }, layout: { divider: 'wave-brush', subheader: 'photo' } },
    // Highlighted words, signature details, scrolling strip
    { style: { highlight: 'outline', decor: 'grid', theme: 'dark' }, layout: { highlights: 'marquee', hero: 'editorial', subheader: 'split' }, sections: ['highlights', 'about', 'features', 'services', 'gallery', 'reviews'] },
    { style: { highlight: 'marker', decor: 'blob', rhythm: 'alternate' }, layout: { hero: 'split', about: 'image-right' } },
    { style: { highlight: 'color', decor: 'wordmark', rhythm: 'lines' }, layout: { footer: 'light' } },
    { style: { highlight: 'italic', decor: 'dropcap' }, layout: { footer: 'brand' } },
    { style: { decor: 'frame', theme: 'dark' }, layout: { about: 'wide', footer: 'brand' } },
    // Larger layouts: transparent header, slideshow hero, collage, bento
    { layout: { header: 'transparent', hero: 'slideshow', about: 'collage', features: 'bento' }, sections: ['about', 'stats', 'features', 'cta', 'services', 'gallery', 'reviews'] },
    { style: { theme: 'dark', rhythm: 'alternate', decor: 'blob', edges: 'all' }, layout: { header: 'transparent', hero: 'split', about: 'collage', features: 'bento', subheader: 'photo', divider: 'waves' } },
    { style: { decor: 'grid', cards: 'tinted' }, layout: { header: 'transparent', hero: 'card', subheader: 'plain', features: 'bento' } },
    // Varied structures: hero buttons and height, about between two photos / stacked, why us beside or around a photo
    { style: { titles: 'line', decor: 'dropcap' }, layout: { heroButtons: 'link', heroHeight: 'full', about: 'triptych', features: 'center' } },
    { style: { titles: 'bar', theme: 'dark' }, layout: { hero: 'split', heroButtons: 'one', heroHeight: 'compact', about: 'stacked', features: 'split' } },
    { layout: { hero: 'bottom', heroHeight: 'full', about: 'image-right', features: 'split' }, sections: ['features', 'about', 'services', 'gallery', 'reviews'] },
    // 3 to 6 strengths
    { layout: { features: 'bento', featureCount: '5' } },
    { layout: { features: 'center', featureCount: '6' } },
    { layout: { features: 'cards', featureCount: '3' } },
    { layout: { features: 'list', featureCount: '6' } },
    // Rotating phrases under the hero title, about: text | photo | text
    { layout: { hero: 'slideshow', heroPhrases: 'rotating', about: 'sandwich' } },
    { style: { theme: 'dark', titles: 'bar' }, layout: { hero: 'split', heroPhrases: 'rotating', about: 'sandwich' } },
    // Home gallery, call to action and reviews
    { layout: { homeGallery: 'mosaic', cta: 'phone', testimonials: 'side' }, sections: ['about', 'features', 'cta', 'services', 'gallery', 'reviews'] },
    { style: { theme: 'dark', edges: 'all', images: 'arch' }, layout: { homeGallery: 'masonry', cta: 'photo-split', divider: 'waves' }, sections: ['about', 'features', 'cta', 'services', 'gallery', 'reviews'] },
    { style: { rhythm: 'lines' }, layout: { homeGallery: 'strip', testimonials: 'side' } },
    // Logo in the middle of the menu, footer opening with an invitation
    { layout: { header: 'split', footerCta: 'large', footer: 'light' } },
    { style: { theme: 'dark', decor: 'wordmark' }, layout: { header: 'split', footerCta: 'large', footer: 'brand' } },
    // Photo treatment and ratio, textures, hero on the brand color
    { style: { photoTone: 'duotone', photoRatio: 'tall', decor: 'dots', images: 'arch' }, layout: { hero: 'color', heroHeight: 'full' } },
    { style: { photoTone: 'mono', photoRatio: 'wide', decor: 'lines', theme: 'dark' }, layout: { hero: 'color', header: 'transparent', homeGallery: 'mosaic' } },
    // Signature details
    { style: { signature: 'numbers', kicker: 'pill' }, layout: { about: 'sandwich' }, sections: ['about', 'features', 'services', 'process', 'gallery', 'reviews', 'faq'] },
    { style: { signature: 'tilted', images: 'framed', decor: 'grid' }, layout: { about: 'collage', features: 'split' } },
    { style: { signature: 'vertical', align: 'left', kicker: 'dash' }, layout: { about: 'triptych' } },
    { style: { signature: 'stamp' }, layout: { hero: 'editorial', heroHeight: 'full' } },
    { style: { signature: 'stamp' }, layout: { hero: 'slideshow', heroHeight: 'full' } },
  ];
  for (const v of variants) {
    const spec = sanitizeSpec(v);
    for (const site of [sampleSite(), sampleSite(0), { ...sampleSite(1), hasLogo: false, mapEmbed: false }]) {
      const { docs, globalStyles } = buildSite(spec, site);
      assert.deepEqual(Object.keys(docs), DOC_ROLES);
      assert.equal(globalStyles.system_colors[0].color, spec.style.colors.primary);
      for (const [role, { doc, marks }] of Object.entries(docs)) {
        const a = analyzeDocument(doc, { prefix: role });
        for (const f of a.fields) {
          const m = marks.get(f.ref) || {};
          assert.ok(m.fixed || m.hint, `${role}: ${f.id} is neither fixed nor an AI field with a hint`);
        }
        for (const s of a.slots) {
          assert.ok(marks.get(s.id)?.slot, `${role}: slot ${s.id} has a role`);
          assert.equal(s.url, TEMPLATE_IMAGE);
        }
        const ids = new Set();
        const walk = (el) => {
          assert.ok(!ids.has(el.id), `${role}: duplicate element id ${el.id}`);
          ids.add(el.id);
          el.elements.forEach(walk);
        };
        doc.content.forEach(walk);
      }
    }
  }
  // Same input -> same element ids (field and slot ids are stable between generation and export)
  assert.deepEqual(buildSite(sanitizeSpec({}), sampleSite()), buildSite(sanitizeSpec({}), sampleSite()));
});

test('page banners, key numbers, how we work and colored bands follow the template', () => {
  const sections = ['about', 'stats', 'features', 'services', 'process', 'gallery', 'reviews'];
  const build = (style, layout) => buildSite(sanitizeSpec({ style, layout, sections }), sampleSite()).docs;
  const slots = (docs, role) => [...docs[role].marks.values()].filter((m) => m.slot === 'subheader').length;
  const json = (docs, role) => JSON.stringify(docs[role].doc);

  const photo = build({}, {});
  assert.equal(slots(photo, 'about'), 1, 'photo banner: one subheader image');
  assert.match(json(photo, 'home'), /"background_gradient_type":"linear"/, 'default colored bands: linear gradient');

  const plain = build({ fill: 'radial' }, { subheader: 'plain', stats: 'inline', process: 'timeline', footer: 'brand' });
  for (const role of ['about', 'services', 'gallery', 'contact']) {
    assert.equal(slots(plain, role), 0, `plain banner of ${role}: no photo`);
    assert.match(json(plain, role), /"header_size":"h1"/, `plain banner of ${role}: still the page title`);
  }
  assert.match(json(plain, 'about'), /Home \/ Chi Siamo/, 'plain banner: breadcrumb');
  assert.match(json(plain, 'footer'), /"background_gradient_type":"radial"/, 'radial fill');
  assert.equal(count(json(plain, 'home'), /"_element_custom_width":\{"unit":"px","size":56\}/g), 4, 'timeline: 4 numbered discs');

  const split = build({ fill: 'flat' }, { subheader: 'split', stats: 'cards', process: 'vertical' });
  const subheaderImages = [...split.about.marks.entries()].filter(([k, m]) => m.slot === 'subheader' && k.endsWith(':image'));
  assert.equal(subheaderImages.length, 1, 'split banner: the subheader photo is an image beside the title');
  assert.doesNotMatch(json(split, 'home'), /"background_background":"gradient"/, 'flat fill: no gradients');
});

const count = (s, re) => (s.match(re) || []).length;

test('signature details: highlighted words, decor, scrolling strip', () => {
  const sections = ['highlights', 'about', 'stats', 'features', 'services', 'gallery', 'reviews'];
  const build = (style, layout = {}) => withCss(buildSite(sanitizeSpec({ style, layout: { hero: 'center', about: 'image-left', features: 'icons', ...layout }, sections }), sampleSite()));
  const find = (docs, role, pred) => {
    const out = [];
    const walk = (el) => (pred(el) && out.push(el), el.elements.forEach(walk));
    docs[role].doc.content.forEach(walk);
    return out;
  };
  const classes = (docs, role, cls) => find(docs, role, (el) => [el.settings._css_classes, el.settings.css_classes].some((v) => String(v || '').split(' ').includes(cls)));
  const header = (docs) => docs.css;

  const plain = build({});
  for (const cls of ['esg-hl', 'esg-grid', 'esg-brackets', 'esg-frame', 'esg-blob', 'esg-dropcap', 'esg-marquee']) assert.equal(classes(plain, 'home', cls).length, 0, `no ${cls} by default`);
  assert.doesNotMatch(header(plain) + JSON.stringify(plain.header.doc), /esgHl|esgMq|<script/, 'no scripts');

  const italic = build({ highlight: 'italic' });
  const [h1] = find(italic, 'home', (el) => el.settings.header_size === 'h1');
  assert.equal(h1.settings._css_classes, 'esg-hl esg-hl-light', 'hero title over a photo: highlighted in the light variant');
  assert.ok(classes(italic, 'home', 'esg-hl').length >= 5, 'section titles highlighted too');
  // The last word is wrapped once the texts are written (exporter), not by a script on the site
  const title = (text) => highlightTitles({ content: [{ elType: 'widget', widgetType: 'heading', settings: { title: text, _css_classes: 'esg-hl' }, elements: [] }] }).content[0].settings.title;
  assert.equal(title('Qualità e cura in ogni lavoro'), 'Qualità e cura in ogni <span class="esg-hl-w">lavoro</span>');
  assert.equal(title('Sempre vicini a te'), 'Sempre vicini <span class="esg-hl-w">a te</span>', 'a short last word goes with the one before');
  assert.equal(title('Chi siamo'), 'Chi siamo', 'fewer than 3 words: unchanged');
  assert.equal(title('Già <em>scritto</em> in HTML'), 'Già <em>scritto</em> in HTML', 'HTML: unchanged');
  assert.match(header(italic), /\.esg-hl \.esg-hl-w\{font-style:italic/);

  const grid = build({ decor: 'grid' });
  assert.ok(classes(grid, 'home', 'esg-grid').length >= 1, 'grid on the tinted sections');
  assert.equal(classes(grid, 'home', 'esg-brackets').length, 1, 'corner brackets on the about photo');
  assert.equal(classes(build({ decor: 'frame' }), 'about', 'esg-frame').length, 2, 'inset frame on the photos of the About rows');
  assert.equal(classes(build({ decor: 'blob' }), 'home', 'esg-blob').length, 1);
  const dropcap = build({ decor: 'dropcap' });
  assert.equal(classes(dropcap, 'home', 'esg-dropcap').length, 1, 'drop cap on the about text of Home');
  assert.equal(classes(dropcap, 'about', 'esg-dropcap').length, 1, 'and on the first About text');

  const wordmark = build({ decor: 'wordmark' });
  const [name] = classes(wordmark, 'footer', 'esg-wordmark');
  assert.equal(name.settings.title, 'Edil Test', 'the business name across the footer');
  assert.equal(wordmark.footer.doc.content.length, 3);

  const marquee = build({}, { highlights: 'marquee' });
  assert.equal(classes(marquee, 'home', 'esg-marquee').length, 1);
  // The guarantees repeated 6 times (two equal halves), the copies showing the texts of the first 4, CSS moving the list
  const [strip] = classes(marquee, 'home', 'esg-marquee');
  assert.equal(strip.settings.icon_list.length, 24);
  const shares = strip.settings.icon_list.map((_, i) => marquee.home.marks.get(`${strip.id}:icon_list.${i}.text`).share);
  assert.deepEqual(shares.slice(0, 4), ['highlight1', 'highlight2', 'highlight3', 'highlight4']);
  assert.deepEqual(shares.slice(20), shares.slice(0, 4));
  assert.match(header(marquee), /\.esg-marquee \.elementor-icon-list-items\{flex-wrap:nowrap!important;width:max-content;animation:esg-marquee 54s linear infinite\}/);
});

test('larger layouts: slideshow hero, transparent header, bento, collage', async () => {
  const { imageAssignment } = await import('../src/generation/exporter.js');
  const sections = ['about', 'features', 'services', 'gallery', 'reviews'];
  const build = (layout) => withCss(buildSite(sanitizeSpec({ layout, sections }), sampleSite()));
  const roles = (docs, role) => [...docs[role].marks.values()].map((m) => m.slot).filter(Boolean);
  const json = (docs, role) => JSON.stringify(docs[role].doc);

  // Slideshow: a gallery slot on the hero background, filled with the hero image then 3 other photos, cropped like the hero
  const slideshow = build({ hero: 'slideshow' });
  const heroEl = slideshow.home.doc.content[0];
  assert.equal(heroEl.settings.background_background, 'slideshow');
  assert.equal(heroEl.settings.background_slideshow_ken_burns, 'yes');
  const slot = analyzeDocument(slideshow.home.doc, { prefix: 'home' }).slots.find((s) => s.key === 'background_slideshow_gallery');
  assert.equal(slot.kind, 'gallery');
  assert.equal(slideshow.home.marks.get(slot.id).slot, 'slideshow');
  const images = [{ id: 1, role: 'hero_home' }, ...[2, 3, 4, 5, 6].map((id) => ({ id, role: '' })), { id: 7, role: 'logo' }].map((i) => ({ ...i, mime: 'image/jpeg' }));
  const exported = new Map(images.map((i) => [i.id, { name: `p${i.id}.webp`, url: `u${i.id}`, alt: '' }]));
  const needed = new Set();
  const assigned = imageAssignment({ images, services: [], settings: {} }, { key: 'home' }, [slot], { [slot.id]: 'slideshow' }, exported, needed);
  assert.deepEqual(assigned[slot.id].map((i) => i.url), ['u1', 'u2', 'u3', 'u4'], 'hero image first, 4 photos at most');
  assert.equal(needed.size, 4, 'all of them cropped to the hero size');

  // Transparent header: the first photo section of each page is marked, the header CSS lies over it
  const plain = build({});
  assert.doesNotMatch(Object.keys(plain).map((r) => json(plain, r)).join(), /esg-under/, 'no mark with the other headers');
  const transparent = build({ header: 'transparent', hero: 'center', subheader: 'photo' });
  for (const role of ['home', 'about', 'services', 'gallery', 'contact', 'single_post']) assert.equal(transparent[role].doc.content[0].settings.css_classes, 'esg-under', `${role}: first section under the header`);
  assert.match(transparent.css, /body:has\(\.esg-under\) \.esg-header\{position:absolute!important/);
  assert.match(transparent.css, /body:has\(\.esg-under\) \.esg-header nav:not\(\.hfe-dropdown\) \.hfe-nav-menu>li>a\.hfe-menu-item\{color:#FFFFFF!important\}/, 'white menu links over the photo');
  assert.doesNotMatch(json(build({ header: 'transparent', subheader: 'plain' }), 'about'), /esg-under/, 'no photo on top: a normal header');

  // Bento: one large tile on a photo + three compact cards
  const bento = build({ features: 'bento' });
  const features = bento.home.doc.content[2];
  assert.equal((JSON.stringify(features).match(/"background_image":\{"url":"https:\/\/template\.invalid/g) || []).length, 1, 'one photo tile');
  assert.ok(roles(bento, 'home').includes('photo'));
  assert.equal((JSON.stringify(features).match(/"widgetType":"icon-box"/g) || []).length, 4);
  assert.equal((JSON.stringify(features).match(/"css_classes":"esg-card"/g) || []).length, 3, 'three cards');

  // Collage: two photos, the smaller one cut out by a border of the section color
  const collage = build({ about: 'collage' });
  const about = collage.home.doc.content[1];
  const photos = JSON.stringify(about).match(/"widgetType":"image"/g) || [];
  assert.equal(photos.length, 2);
  assert.match(JSON.stringify(about), new RegExp(`"image_border_color":"${about.settings.background_color}"`));
});

test('varied structures: hero buttons and height, about triptych / stacked, why us split / center', () => {
  const sections = ['about', 'features', 'services', 'gallery', 'reviews'];
  const build = (layout) => withCss(buildSite(sanitizeSpec({ layout, sections }), sampleSite()));
  const json = (x) => JSON.stringify(x);
  const count = (x, re) => (json(x).match(re) || []).length;

  // Hero buttons: contact + call, contact only, contact + a call link with a phone icon
  const hero = (layout) => build({ hero: 'center', ...layout }).home.doc.content[0];
  assert.equal(count(hero({}), /"widgetType":"button"/g), 2, 'two buttons by default (templates saved before)');
  assert.equal(count(hero({ heroButtons: 'one' }), /"widgetType":"button"/g), 1);
  assert.doesNotMatch(json(hero({ heroButtons: 'one' })), /tel:/);
  const buttons = [];
  const walk = (el) => (el.widgetType === 'button' ? buttons.push(el.settings) : el.elements.forEach(walk));
  walk(hero({ heroButtons: 'link' }));
  assert.equal(buttons.length, 2);
  const call = buttons.find((s) => s.link.url.startsWith('tel:'));
  assert.equal(call.selected_icon.value, 'fas fa-phone-alt');
  assert.equal(call.background_color, 'rgba(0,0,0,0)', 'a text link, not a button');

  // Height: the one of the layout, the whole screen, or lower
  assert.equal(hero({}).settings.min_height.size, 88);
  assert.equal(hero({ heroHeight: 'full' }).settings.min_height.size, 100);
  assert.equal(hero({ heroHeight: 'compact' }).settings.min_height.size, 66);
  // Full screen: an arrow to the next section (not a link field), its CSS in the header
  const full = build({ hero: 'center', heroHeight: 'full' });
  assert.match(json(full.home.doc.content[0]), /"url":"#esg-next"/);
  assert.equal(full.home.doc.content[1].settings._element_id, 'esg-next');
  assert.ok(!analyzeDocument(full.home.doc, { prefix: 'home' }).fields.some((f) => f.value === '#esg-next'));
  assert.match(full.css, /\.elementor-widget\.esg-scroll\{position:absolute/);
  for (const docs of [build({}), build({ hero: 'bottom', heroHeight: 'full' }), build({ hero: 'editorial', heroHeight: 'full' })]) {
    assert.doesNotMatch(json(docs.home.doc) + docs.css, /esg-scroll|esg-next/, 'no arrow: normal height, title at the bottom, editorial');
  }

  // About between two photos: the second one only on desktop, the text centered
  const triptych = build({ about: 'triptych' }).home.doc.content[1];
  assert.equal(triptych.elements.length, 3);
  assert.equal(count(triptych, /"widgetType":"image"/g), 2);
  assert.equal(triptych.elements[2].settings.hide_mobile, 'hidden-mobile');
  assert.match(json(triptych.elements[1]), /"widgetType":"heading","settings":\{"title":"[^"]*","header_size":"h2","align":"center"/);
  // Stacked: title beside the text, a wide photo below
  const stacked = build({ about: 'stacked' }).home.doc.content[1];
  assert.equal(stacked.elements.length, 2);
  assert.equal(stacked.elements[0].elements.length, 2);
  assert.equal(stacked.elements[1].elements[0].widgetType, 'image');

  // Why us beside a photo (on the other side than the About photo), and around a photo
  const split = (about) => build({ about, features: 'split' }).home.doc.content[2];
  assert.equal(split('image-left').elements[1].elements[0].widgetType, 'image', 'photo on the right');
  assert.equal(split('image-right').elements[0].elements[0].widgetType, 'image', 'photo on the left');
  assert.equal(count(split('image-left'), /"widgetType":"icon-box"/g), 4);
  const center = build({ features: 'center' }).home.doc.content[2].elements[1];
  assert.deepEqual(center.elements.map((e) => count(e, /"widgetType":"icon-box"/g)), [2, 0, 2]);
  assert.equal(center.elements[1].elements[0].widgetType, 'image');
  assert.match(json(center.elements[0]), /"position":"right"/, 'the strengths on the left face the photo');
});

test('rotating phrases under the hero title, about with text on both sides of the photo', () => {
  const sections = ['about', 'features', 'services', 'gallery', 'reviews'];
  const build = (layout, copy) => withCss(buildSite(sanitizeSpec({ layout, sections, copy }), sampleSite()));
  const json = (x) => JSON.stringify(x);

  // Three phrases in one box after the H1, each an AI field; the H1 stays the same
  const docs = build({ hero: 'center', heroPhrases: 'rotating' }, { heroPhrases: ['Uno', 'Due', 'Tre'] });
  const content = docs.home.doc.content[0].elements[0].elements;
  assert.equal(content[1].settings.header_size, 'h1');
  const rotator = content[2];
  assert.equal(rotator.settings.css_classes, 'esg-rotate');
  assert.deepEqual(rotator.elements.map((e) => e.settings.title), ['Uno', 'Due', 'Tre']);
  assert.ok(rotator.elements.every((e) => e.settings.header_size === 'p'), 'not headings for SEO');
  const fields = analyzeDocument(docs.home.doc, { prefix: 'home' }).fields;
  for (const e of rotator.elements) {
    const f = fields.find((x) => x.ref === `${e.id}:title`);
    assert.match(docs.home.marks.get(f.ref).hint, /rotating phrase \d of 3/);
  }
  // CSS only when used, with a still version for reduced motion
  assert.match(docs.css, /\.e-con\.esg-rotate\{display:grid!important\}/);
  assert.match(docs.css, /prefers-reduced-motion:reduce\)\{\.esg-rotate/);
  const plain = build({ hero: 'center' });
  assert.doesNotMatch(json(plain.home.doc) + plain.css, /esg-rotate/);

  // Sandwich: title and text | photo | the 3 key points and the button
  const about = build({ about: 'sandwich' }, { aboutPoints: ['A', 'B', 'C'] }).home.doc.content[1];
  assert.equal(about.elements.length, 3);
  const left = about.elements[0].elements;
  assert.equal(left[1].settings.title, DEFAULT_SPEC.copy.aboutTitle);
  assert.equal(left.at(-1).widgetType, 'text-editor');
  assert.equal(about.elements[1].elements[0].widgetType, 'image');
  const [points, button] = about.elements[2].elements;
  assert.deepEqual(points.settings.icon_list.map((x) => x.text), ['A', 'B', 'C']);
  assert.equal(button.widgetType, 'button');
  // Templates saved before: default phrases and points
  assert.equal(sanitizeSpec({}).copy.heroPhrases.length, 3);
  assert.equal(sanitizeSpec({}).copy.aboutPoints.length, 3);
});

test('why choose us shows 3 to 6 strengths, as many as its layout can arrange', async () => {
  const { featureCount, FEATURE_COUNTS, LAYOUTS } = await import('../src/templates/spec.js');
  const sections = ['about', 'features', 'services', 'gallery', 'reviews'];
  const features = (layout) => buildSite(sanitizeSpec({ layout, sections }), sampleSite()).docs.home.doc.content[2];
  const boxes = (el) => (JSON.stringify(el).match(/"widgetType":"icon-box"/g) || []).length;
  const titles = (el) => [...JSON.stringify(el).matchAll(/"title_text":"([^"]*)"/g)].map((m) => m[1]);
  for (const layout of LAYOUTS.features) assert.ok(FEATURE_COUNTS[layout], `${layout}: counts it can arrange`);

  // Each layout with each count it can arrange: the first strengths of the template, in order
  for (const [layout, counts] of Object.entries(FEATURE_COUNTS)) {
    for (const n of counts) {
      const el = features({ features: layout, featureCount: String(n) });
      assert.equal(boxes(el), n, `${layout} with ${n} strengths`);
      assert.deepEqual(titles(el), DEFAULT_SPEC.copy.features.slice(0, n).map((f) => f.title), `${layout}: the first ${n}, in order`);
    }
  }
  // A count the layout cannot arrange: the nearest one (the smaller on a tie), saved as such
  assert.equal(featureCount({ features: 'center', featureCount: '5' }), 4);
  assert.equal(featureCount({ features: 'center', featureCount: '3' }), 4);
  assert.equal(featureCount({ features: 'bento', featureCount: '6' }), 5);
  assert.equal(featureCount({ features: 'list', featureCount: '3' }), 4);
  assert.equal(sanitizeSpec({ layout: { features: 'center', featureCount: '5' } }).layout.featureCount, '4');
  assert.equal(sanitizeSpec({ layout: { features: 'icons' } }).layout.featureCount, '4', 'templates saved before: 4 strengths');

  // Cards: 4 in a row; otherwise 3 per row, the last row of 5 centered
  const row = (n) => features({ features: 'icons', featureCount: String(n) }).elements[1];
  assert.equal(row(4).elements[0].settings.width.size, 22.5);
  assert.equal(row(5).elements[0].settings.width.size, 31);
  assert.equal(row(5).settings.flex_justify_content, 'center');
  assert.equal(row(6).settings.flex_justify_content, 'space-between');
  // Bento with five: the four small cards in a 2 × 2 grid
  const small = features({ features: 'bento', featureCount: '5' }).elements[1].elements[1];
  assert.equal(small.settings.flex_direction, 'row');
  assert.equal(small.elements[0].settings.width.size, 48);
  // The AI fields say how many strengths there are
  const { marks } = buildSite(sanitizeSpec({ layout: { features: 'icons', featureCount: '6' }, sections }), sampleSite()).docs.home;
  assert.ok([...marks.values()].some((m) => m.hint === 'strength 6 of 6 of the business (short title, 2–4 words)'));
  // The template prompt asks for six strengths and icons, most important first
  const { DIRECTIONS, designPlan } = await import('../src/templates/directions.js');
  const direction = DIRECTIONS[0];
  const { prompt } = buildTemplatePrompt({ category: { name: 'Test' }, direction, plan: designPlan(direction, []), existing: [] });
  assert.match(prompt, /"features": \[6 ×/);
  assert.match(prompt, /the most important first/);
  // The planner saves the count the layout really shows
  for (const d of DIRECTIONS) {
    const plan = designPlan(d, []);
    assert.equal(plan.layout.featureCount, String(featureCount(plan.layout)), `${d.id}: count of the chosen layout`);
  }
});

test('Home gallery, call to action and reviews: more layouts', () => {
  const sections = ['about', 'features', 'cta', 'services', 'gallery', 'reviews'];
  const build = (layout, site = sampleSite()) => buildSite(sanitizeSpec({ layout, sections }), site).docs;
  const json = (x) => JSON.stringify(x);
  const count = (x, re) => (json(x).match(re) || []).length;
  const section = (docs, id) => docs.home.doc.content[1 + sections.indexOf(id)];
  const photos = (el) => count(el, /"widgetType":"image"/g);

  // Gallery: carousel by default (templates saved before); mosaic 1 + 4, masonry 3 × 2, strip of 4 across the screen
  assert.equal(count(section(build({}), 'gallery'), /"widgetType":"image-carousel"/g), 1);
  const mosaic = section(build({ homeGallery: 'mosaic' }), 'gallery');
  assert.equal(photos(mosaic), 5);
  assert.equal(count(mosaic, /"url":"\/galleria\/"/g), 6, 'every photo and the button lead to the Gallery page');
  const masonry = section(build({ homeGallery: 'masonry' }), 'gallery');
  assert.equal(photos(masonry), 6);
  const cols = masonry.elements[1].elements;
  assert.deepEqual(cols.map((c) => c.elements.map((t) => t.elements[0].settings.height.size)), [[340, 240], [240, 340], [340, 240]], 'staggered heights');
  assert.equal(cols[2].settings.hide_mobile, 'hidden-mobile', 'two columns on phones');
  const strip = section(build({ homeGallery: 'strip' }), 'gallery');
  assert.equal(photos(strip), 4);
  assert.equal(strip.settings.boxed_width.size, 2560, 'across the whole screen');
  const docs = build({ homeGallery: 'mosaic' });
  assert.ok([...docs.home.marks.values()].filter((m) => m.slot === 'photo').length >= 5, 'photos of the archive');

  // Call to action with the phone number in large type, or a photo beside a colored panel
  const phone = section(build({ cta: 'phone' }), 'cta');
  assert.match(json(phone), /"title":"\+39 02 1234 567"[^}]*"link":\{"url":"tel:\+39021234567"/);
  assert.equal(count(phone, /"widgetType":"button"/g), 1);
  const noPhone = section(build({ cta: 'phone' }, { ...sampleSite(), phone: '' }), 'cta');
  assert.doesNotMatch(json(noPhone), /tel:/, 'no phone number: a banner');
  assert.equal(noPhone.settings.background_overlay_background, 'gradient');
  const photoSplit = section(build({ cta: 'photo-split' }), 'cta');
  const [photo, panel] = photoSplit.elements[0].elements;
  assert.equal(photo.settings.background_image.url, TEMPLATE_IMAGE);
  assert.equal(panel.elements.length, 3, 'title, text, button on the colored panel');

  // Reviews beside the title and large stars, one under the other
  const side = section(build({ testimonials: 'side' }), 'reviews');
  assert.equal(side.elements.length, 2);
  assert.equal(count(side.elements[0], /"widgetType":"star-rating"/g), 1);
  assert.equal(side.elements[1].elements.length, 3);
  assert.equal(count(side.elements[1], /"widgetType":"testimonial"/g), 3);
  assert.equal(side.elements[1].elements[1].settings.border_width.top, '1', 'thin line between the reviews');
});

test('header with the logo in the middle, footer opening with an invitation', () => {
  const build = (layout, site = sampleSite()) => withCss(buildSite(sanitizeSpec({ layout }), site));
  const json = (x) => JSON.stringify(x);

  // Split header: first pages on the left (desktop only), logo, the others + button on the right; one hamburger with every page
  const header = build({ header: 'split' }).header.doc.content;
  assert.equal(header.length, 1);
  const [left, logo, right] = header[0].elements;
  assert.equal(left.settings.css_classes, 'esg-hd-side');
  assert.equal(left.settings.hide_tablet, 'hidden-tablet');
  assert.equal(left.settings.hide_mobile, 'hidden-mobile');
  const leftNav = left.elements[0];
  assert.equal(leftNav.settings.css_classes, 'esg-nav esg-nav-left');
  assert.deepEqual(leftNav.elements.map((e) => [e.widgetType, e.settings.dropdown]), [['navigation-menu', 'none']], 'the site menu, no second hamburger');
  assert.equal(logo.settings.css_classes, 'esg-hd-brand');
  assert.deepEqual(right.elements.map((e) => e.settings.css_classes), ['esg-hd-nav esg-nav esg-nav-skip', 'esg-hd-cta']);
  assert.deepEqual(right.elements[0].elements.map((e) => [e.widgetType, e.settings.dropdown]), [['navigation-menu', 'tablet']], 'the whole menu behind the hamburger');
  // Desktop: the first 3 items on the left of the logo, the others on the right
  assert.match(build({ header: 'split' }).css, /@media \(min-width:1025px\)\{\.esg-nav-left \.hfe-nav-menu>li:nth-child\(n\+4\),\.esg-nav-skip \.hfe-nav-menu>li:nth-child\(-n\+3\)\{display:none\}\}/);
  assert.doesNotMatch(json(build({}).header.doc) + build({}).css, /esg-nav-skip|esg-hd-side/, 'other headers unchanged');

  // Footer opening with a large invitation, the phone number and a button (AI texts), then the columns
  const footer = build({ footerCta: 'large' }).footer;
  const invite = footer.doc.content[0];
  assert.equal(footer.doc.content.length, 3);
  assert.match(json(invite), /"link":\{"url":"tel:\+39021234567"/);
  const fields = analyzeDocument(footer.doc, { prefix: 'footer' }).fields;
  const hints = fields.map((f) => footer.marks.get(f.ref)?.hint).filter(Boolean);
  assert.ok(hints.some((h) => /large invitation to get in touch/.test(h)));
  assert.ok(hints.some((h) => /button of the invitation/.test(h)));
  assert.equal(footer.doc.content[1].elements.length, 4, 'then the 4 columns');
  assert.doesNotMatch(json(build({ footerCta: 'large' }, { ...sampleSite(), phone: '' }).footer.doc.content[0]), /tel:/, 'no phone: only the button');
  assert.equal(build({}).footer.doc.content.length, 2, 'no invitation by default');
});

test('more orders of the Home sections across a category', async () => {
  const { designPlan, DIRECTIONS } = await import('../src/templates/directions.js');
  const direction = DIRECTIONS.find((d) => d.id === 'corporate');
  const saved = [];
  for (let i = 0; i < 8; i++) {
    const plan = designPlan(direction, saved);
    saved.push({ style: { ...plan.style, fonts: plan.fonts }, layout: plan.layout, sections: plan.sections });
  }
  const required = (s) => s.sections.filter((x) => ['about', 'features', 'services', 'gallery', 'reviews'].includes(x)).join();
  assert.ok(new Set(saved.map(required)).size >= 7, `orders: ${[...new Set(saved.map(required))].join(' / ')}`);
});

test('photo treatment and ratio, textures, hero on the brand color, amount of color', async () => {
  const sections = ['about', 'features', 'services', 'gallery', 'reviews'];
  const build = (style, layout) => withCss(buildSite(sanitizeSpec({ style, layout, sections }), sampleSite()));
  const json = (x) => JSON.stringify(x);
  const header = (docs) => docs.css;
  const images = (docs, role) => {
    const out = [];
    const walk = (el) => (el.widgetType === 'image' ? out.push(el.settings) : el.elements.forEach(walk));
    docs[role].doc.content.forEach(walk);
    return out;
  };

  // Natural photos by default (templates saved before): no class, no filter
  const plain = build({}, {});
  assert.ok(images(plain, 'home').every((s) => !/esg-photo/.test(s._css_classes || '')));
  assert.doesNotMatch(header(plain), /esg-duotone|filter:grayscale/);
  // Black and white: every photo but the logo, colors back under the mouse
  const mono = build({ photoTone: 'mono' }, {});
  assert.ok(images(mono, 'home').every((s) => /esg-photo/.test(s._css_classes)));
  assert.ok(images(mono, 'header').every((s) => !/esg-photo/.test(s._css_classes || '')), 'not the logo');
  assert.match(header(mono), /\.esg-photo img,\.elementor-widget-image-carousel \.swiper-slide img,\.elementor-widget-image-gallery \.gallery-item img\{filter:grayscale\(1\)/);
  assert.match(header(mono), /\.esg-photo:hover img[^{]*\{filter:none\}/);
  // Duotone: black and white tinted with the hue of the primary color (CSS filter only, no SVG on the page)
  const duo = build({ photoTone: 'duotone', colors: { primary: '#1F4E79' } }, {});
  assert.match(header(duo), /\{filter:grayscale\(1\) sepia\(1\) hue-rotate\(171deg\) saturate\(1\.6\)/);
  assert.doesNotMatch(header(duo) + json(duo.header.doc), /<svg|<filter|url\(#/);
  assert.match(header(build({ photoTone: 'duotone', colors: { primary: '#777777' } }, {})), /\{filter:grayscale\(1\) contrast\(1\.06\);/, 'grey primary: black and white');
  // Faded: no color back under the mouse
  assert.doesNotMatch(header(build({ photoTone: 'faded' }, {})), /\{filter:none\}/);
  // The decor classes stay with the treatment
  assert.match(json(build({ photoTone: 'mono', decor: 'grid' }, {}).home.doc), /"_css_classes":"esg-brackets esg-photo"/);

  // Main photos taller or wider; the other photos keep the height of their layout
  const aboutPhoto = (style) => build(style, { about: 'image-left' }).home.doc.content[1].elements[0].elements[0].settings.height.size;
  assert.equal(aboutPhoto({}), 460);
  assert.equal(aboutPhoto({ photoRatio: 'tall' }), 543);
  assert.equal(aboutPhoto({ photoRatio: 'wide' }), 359);
  const cards = (style) => images(build(style, { services: 'cards' }), 'home').filter((s) => s.height?.size === 230).length;
  assert.equal(cards({ photoRatio: 'tall' }), cards({}), 'service cards unchanged');

  // Textures on the tinted sections only
  const dots = build({ decor: 'dots', rhythm: 'alternate' }, {});
  assert.ok(dots.home.doc.content.some((s) => s.settings.css_classes === 'esg-texture'));
  assert.match(header(dots), /\.esg-texture\{background-image:radial-gradient/);
  assert.match(header(build({ decor: 'lines' }, {})), /\.esg-texture\{background-image:repeating-linear-gradient\(135deg/);

  // Hero on the brand color: light texts, the hero photo framed beside them, no photo behind
  const hero = build({ fill: 'flat' }, { hero: 'color' }).home.doc.content[0];
  assert.ok(!hero.settings.background_image, 'no photo behind the text');
  assert.equal(hero.settings.background_color, siteColorsOf(sanitizeSpec({}).style.colors).primaryText);
  assert.match(json(hero.elements[0]), /"header_size":"h1"[^}]*"title_color":"#FFFFFF"|"title_color":"#FFFFFF"[^}]*"header_size":"h1"/);
  assert.equal(hero.elements[1].elements[0].widgetType, 'image');

  // Amount of color: colored and photo bands of the Home page + a hero not on a light tint
  const { colorAmount } = await import('../src/templates/similarity.js');
  assert.equal(colorAmount({ layout: { hero: 'split', features: 'icons', testimonials: 'cards' }, sections }), 0);
  assert.equal(colorAmount({ layout: { hero: 'color', features: 'cards', testimonials: 'band', cta: 'phone' }, sections: [...sections, 'cta'] }), 4);
});

test('signature detail: offered by the planner, chosen by the AI, repeated on every page', async () => {
  const sections = ['about', 'features', 'services', 'gallery', 'reviews'];
  const build = (style, layout = {}, site = sampleSite()) => withCss(buildSite(sanitizeSpec({ style, layout, sections }), site));
  const json = (x) => JSON.stringify(x);
  const header = (docs) => docs.css;
  const count = (x, re) => (json(x).match(re) || []).length;

  // None by default (templates saved before)
  const plain = build({});
  assert.equal(sanitizeSpec({}).style.signature, 'none');
  assert.doesNotMatch(json(plain.home.doc) + header(plain), /esg-num|esg-tilt|esg-vlabel|esg-stamp/);

  // Numbers: one per section title (About included, hero excluded), counted by the page
  const numbers = build({ signature: 'numbers' });
  assert.equal(count(numbers.home.doc, /class=\\"esg-num\\"/g), 5);
  assert.equal(count(numbers.home.doc.content[0], /esg-num/g), 0, 'not in the hero');
  assert.match(header(numbers), /body\{counter-reset:esg-sec\}/);
  assert.match(header(numbers), /content:counter\(esg-sec,decimal-leading-zero\)/);
  assert.ok(count(numbers.about.doc, /esg-num/g) >= 2, 'also on the other pages');

  // Tilted: only the main photos
  const tilted = build({ signature: 'tilted' }, { about: 'image-left', homeGallery: 'mosaic' });
  assert.equal(count(tilted.home.doc.content[1], /esg-tilt/g), 1, 'the About photo');
  assert.equal(count(tilted.home.doc.content[4], /esg-tilt/g), 0, 'not the gallery photos');
  assert.match(header(tilted), /\.esg-tilt img\{transform:rotate\(-2\.2deg\)/);

  // Vertical: the labels of the left-aligned titles, not the hero one
  const vertical = build({ signature: 'vertical', align: 'left', kicker: 'dash' });
  assert.match(json(vertical.home.doc.content[1]), /"_css_classes":"esg-kicker-dash esg-vlabel"/);
  assert.doesNotMatch(json(vertical.home.doc.content[0]), /esg-vlabel/);
  assert.equal(count(build({ signature: 'vertical', align: 'center', titles: 'plain' }).home.doc.content[2], /esg-vlabel/g), 0, 'centered titles stay as they are');
  assert.match(header(vertical), /writing-mode:vertical-rl/);

  // Stamp: the business name around the circle, in the hero
  const stamp = build({ signature: 'stamp' }, { hero: 'center' });
  const hero = json(stamp.home.doc.content[0]);
  assert.match(hero, /"_css_classes":"esg-stamp-w"/);
  assert.match(hero, /EDIL TEST • EDIL TEST • /);
  assert.match(header(stamp), /@keyframes esg-spin/);
  const long = build({ signature: 'stamp' }, { hero: 'center' }, { ...sampleSite(), siteName: 'Impresa Edile Fratelli Rossi & Figli S.r.l.' });
  const size = Number(json(long.home.doc.content[0]).match(/font-size=\\"([\d.]+)\\"/)[1]);
  assert.ok(size < 10 && size > 4, `long names get a smaller font (${size})`);
  assert.doesNotMatch(json(build({ signature: 'stamp' }, {}, { ...sampleSite(), siteName: '' }).home.doc), /esg-stamp/, 'no name, no stamp');

  // The planner offers 2–3 details of the direction not used yet in the category; the AI chooses; otherwise the first
  const { DIRECTIONS, designPlan, applyPlan } = await import('../src/templates/directions.js');
  const direction = DIRECTIONS.find((d) => d.id === 'editorial');
  const plan = designPlan(direction, [{ style: { signature: 'vertical' }, layout: {}, sections }]);
  assert.ok(plan.signatures.length >= 2 && plan.signatures.length <= 3);
  assert.ok(!plan.signatures.includes('vertical'), 'not the one another template has');
  assert.ok(plan.signatures.every((x) => direction.style.signature.includes(x)));
  const chosen = plan.signatures[1];
  assert.equal(applyPlan(sanitizeSpec({ style: { signature: chosen } }), direction, plan).style.signature, chosen, 'the choice of the AI');
  assert.equal(applyPlan(sanitizeSpec({ style: { signature: 'vertical' } }), direction, plan).style.signature, plan.signatures[0], 'a detail not offered: the first one');
  assert.equal(applyPlan(sanitizeSpec({}), direction, plan).style.signature, plan.signatures[0]);
  // The prompt describes the offered details and asks for one in "style"
  const { prompt } = buildTemplatePrompt({ category: { name: 'Test' }, direction, plan });
  assert.match(prompt, /Signature detail, repeated on every page: choose ONE/);
  for (const id of plan.signatures) assert.match(prompt, new RegExp(`- "${id}": `));
  assert.match(prompt, new RegExp(`"signature": "${plan.signatures.join('" \\| "')}"`));
});

test('templates are compared as a visitor sees them', async () => {
  const { change, effective, homeShape, shapeDistance, repeatedBlocks, firstScreen, SAME_FAMILY } = await import('../src/templates/similarity.js');
  // Look-alike values count less than different looks
  assert.equal(change('layout', 'hero', 'center', 'center'), 0);
  assert.equal(change('layout', 'hero', 'center', 'slideshow'), SAME_FAMILY, 'centered text over a photo or over a slideshow');
  assert.equal(change('layout', 'hero', 'center', 'split'), 1);
  assert.equal(change('layout', 'divider', 'curve', 'waves'), SAME_FAMILY);
  assert.equal(change('layout', 'divider', 'curve', 'zigzag'), 1);
  assert.equal(change('layout', 'gallery', '3', '4'), 1, 'decisions without families: any change is a different look');
  // Decisions without a visible effect are ignored
  assert.equal(effective({ layout: { hero: 'editorial', heroHeight: 'full' } }).layout.heroHeight, 'auto');
  assert.equal(effective({ style: { edges: 'all' }, layout: { divider: 'none' } }).style.edges, 'hero');
  assert.equal(effective({ layout: { features: 'center', featureCount: '5' } }).layout.featureCount, '4');

  // Home shape: the forms of the blocks, whatever section they belong to
  const shape = homeShape({ layout: { hero: 'split', about: 'image-left', features: 'split', services: 'cards', testimonials: 'band' }, sections: ['about', 'features', 'services', 'gallery', 'reviews'] });
  assert.deepEqual(shape, ['split', 'media-row', 'media-row', 'card-grid', 'carousel', 'color-band']);
  assert.equal(repeatedBlocks(shape), 1, 'text beside a photo twice in a row');
  assert.equal(shapeDistance(shape, shape), 0);
  assert.equal(shapeDistance(shape, ['split', 'media-row', 'card-grid', 'carousel', 'color-band']), 1, 'one block less');
  assert.equal(shapeDistance(['a', 'b'], ['b', 'a']), 2);
  // First screen: kind of header, hero, full screen or not
  assert.equal(firstScreen({ layout: { header: 'classic', hero: 'center', heroHeight: 'compact' } }), firstScreen({ layout: { header: 'centered', hero: 'center', heroHeight: 'auto' } }));
  assert.notEqual(firstScreen({ layout: { header: 'classic', hero: 'center', heroHeight: 'auto' } }), firstScreen({ layout: { header: 'classic', hero: 'center', heroHeight: 'full' } }));

  // Five templates of a category (seeded, so the test is stable): different first screens and Home shapes,
  // no hero layout taken twice while the direction has a free one, no two blocks of the same form in a row
  const { designPlan, pickDirection } = await import('../src/templates/directions.js');
  let seed = 7;
  const rng = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const saved = [];
  for (let i = 0; i < 5; i++) {
    const direction = pickDirection(saved, { rng });
    const free = (direction.layout.hero || []).some((h) => !saved.some((s) => s.layout.hero === h));
    const plan = designPlan(direction, saved, rng);
    if (free) assert.ok(!saved.some((s) => s.layout.hero === plan.layout.hero), `template ${i + 1}: a hero layout not in the category yet`);
    saved.push({ direction: direction.id, style: { ...plan.style, fonts: plan.fonts }, layout: plan.layout, sections: plan.sections });
  }
  assert.equal(new Set(saved.map(firstScreen)).size, 5, 'five different first screens');
  // Blocks of the same form in a row are a penalty, not a rule: rare
  assert.ok(saved.reduce((n, s) => n + repeatedBlocks(homeShape(s)), 0) <= 1, 'at most one repeated block in the category');
  for (let i = 0; i < saved.length; i++) {
    for (let j = 0; j < i; j++) assert.ok(shapeDistance(homeShape(saved[i]), homeShape(saved[j])) >= 2, `templates ${j + 1} and ${i + 1}: different Home shapes`);
  }
});

test('templates of a category vary the order of the Home sections', async () => {
  const { DIRECTIONS, designPlan } = await import('../src/templates/directions.js');
  const direction = DIRECTIONS.find((d) => d.id === 'corporate');
  const saved = [];
  for (let i = 0; i < 3; i++) {
    const plan = designPlan(direction, saved);
    saved.push({ style: { ...plan.style, fonts: plan.fonts }, layout: plan.layout, sections: plan.sections });
  }
  const required = (s) => s.sections.filter((x) => ['about', 'features', 'services', 'gallery', 'reviews'].includes(x)).join();
  assert.equal(required(saved[0]), 'about,features,services,gallery,reviews', 'the first template follows the recommended order');
  assert.equal(new Set(saved.map(required)).size, 3, 'the next ones change it');
});

test('section backgrounds follow the rhythm of the template', async () => {
  const { DECISION_WEIGHTS } = await import('../src/templates/directions.js');
  const { STYLE_OPTIONS, LAYOUTS } = await import('../src/templates/spec.js');
  for (const k of Object.keys(STYLE_OPTIONS)) assert.ok(DECISION_WEIGHTS.style[k] > 0, `style.${k} has a weight in the distance between templates`);
  for (const k of Object.keys(LAYOUTS)) assert.ok(DECISION_WEIGHTS.layout[k] > 0, `layout.${k} has a weight in the distance between templates`);

  // Natural backgrounds: about (page), services (page), why us (tinted), gallery, process, reviews (page)
  const sections = ['about', 'services', 'features', 'gallery', 'process', 'reviews'];
  const layout = { hero: 'center', features: 'icons', services: 'cards', testimonials: 'minimal', process: 'timeline' };
  const build = (style) => buildSite(sanitizeSpec({ style: { cards: 'tinted', ...style }, layout, sections }), sampleSite());
  const backgrounds = (docs, role = 'home') => docs[role].doc.content.slice(1).map((el) => el.settings.background_color);
  const { background, primary } = sanitizeSpec({}).style.colors;
  const W = '#FFFFFF';

  assert.deepEqual(backgrounds(build({}).docs), [W, W, background, W, W, W], 'fixed: the background of each layout');

  const alternate = build({ rhythm: 'alternate' }).docs;
  assert.deepEqual(backgrounds(alternate), [W, background, W, background, W, background], 'alternate: never twice the same');
  const about = backgrounds(alternate, 'about').slice(1);
  for (let i = 1; i < about.length; i++) assert.notEqual(about[i], about[i - 1], `about: sections ${i} and ${i + 1} on different backgrounds`);
  // The services cards (tinted look) now stand on a tinted section: they turn white instead of disappearing
  const services = JSON.stringify(alternate.home.doc.content[2]);
  assert.match(services, /"css_classes":"esg-card esg-zoom"/);
  assert.doesNotMatch(services, new RegExp(`"background_color":"${tint(primary, 0.93)}"`), 'no tinted card on the tinted section');

  const lines = build({ rhythm: 'lines' }).docs;
  const content = lines.home.doc.content.slice(1);
  assert.ok(content.every((el) => el.settings.background_color === '#FFFFFF'), 'lines: every plain section on the page color');
  assert.equal(content.filter((el) => el.settings.border_width?.top === '1').length, content.length - 1, 'a thin line between each pair of neighbours');
});

test('entrance animations, card hover and shaped band edges follow the template', () => {
  const sections = ['about', 'stats', 'features', 'services', 'gallery', 'reviews'];
  const build = (style, layout = {}) => withCss(buildSite(sanitizeSpec({ style, layout: { features: 'icons', testimonials: 'cards', ...layout }, sections }), sampleSite()));
  const home = (docs) => JSON.stringify(docs.home.doc);
  const css = (docs) => docs.css;

  const base = build({});
  assert.match(home(base), /"animation":"fadeInUp"/, 'default: rising cards');
  assert.match(css(base), /\.esg-card:hover\{transform:translateY\(-6px\)\}/, 'default: cards rise on hover');
  assert.doesNotMatch(home(base), /shape_divider_top/, 'default: only the hero has a shaped edge');

  assert.doesNotMatch(home(build({ motion: 'none' })), /"animation"/, 'no entrance animation');
  assert.match(home(build({ motion: 'zoom' })), /"animation":"zoomIn"/);
  const fade = home(build({ motion: 'fade' }));
  assert.match(fade, /"animation":"fadeIn","animation_delay":\d+,"animation_duration":"slow"/, 'slow fade, still staggered');

  const glow = css(build({ hover: 'glow' }));
  assert.match(glow, /\.esg-card:hover\{box-shadow:0 0 0 2px #F2A541/, 'ring of the secondary color');
  assert.doesNotMatch(glow, /translateY\(-6px\)/);
  assert.doesNotMatch(css(build({ hover: 'still' })), /\.esg-card:hover\{/, 'still cards');

  // The stats band sits between the "about" row and the "why choose us" cards (both plain sections)
  const edged = build({ edges: 'all' }, { divider: 'waves', stats: 'band' }).home.doc.content;
  const statsBand = edged.find((el) => el.settings.background_gradient_type === 'linear');
  assert.equal(statsBand.settings.shape_divider_top, 'waves');
  assert.equal(statsBand.settings.shape_divider_top_color, '#FFFFFF', 'top edge in the color of the section above');
  assert.equal(statsBand.settings.shape_divider_bottom_color, sanitizeSpec({}).style.colors.background, 'bottom edge in the color of the section below');
  assert.ok(statsBand.settings.shape_divider_top_height.size <= 48, 'band edges stay low');
  assert.doesNotMatch(home(build({ edges: 'all' }, { divider: 'none', stats: 'band' })), /shape_divider_top/, 'straight edges: none on the bands');
});

test('buildSite: structure required by the prompt', () => {
  const { docs } = buildSite(sanitizeSpec({ sections: ['about', 'features', 'services', 'gallery', 'reviews'] }), sampleSite(5));
  const json = (role) => JSON.stringify(docs[role].doc);
  const count = (role, re) => (json(role).match(re) || []).length;
  const serviceSlots = (role) => [...docs[role].marks.values()].filter((m) => m.slot === 'service_list').map((m) => m.service);
  assert.deepEqual(serviceSlots('home'), [0, 1, 2], 'home: 3 featured services');
  assert.deepEqual(serviceSlots('services'), [0, 1, 2, 3, 4], 'services page: one card per service');
  assert.equal(count('home', /"widgetType":"testimonial"/g), 3, '3 reviews');
  assert.equal(count('about', /"widgetType":"testimonial"/g), 3, 'the same 3 reviews on About');
  assert.equal(docs.home.doc.content.length, 6, 'hero, about, why us, services, carousel, reviews (no call to action)');
  assert.match(json('home'), /"url":"\/chi-siamo\/"/, '"Scopri di più" -> Chi Siamo');
  assert.match(json('home'), /"url":"\/servizi\/"/, '"Tutti i servizi" -> Servizi');
  assert.match(json('contact'), /\[contact-form-7 id=\\"INSERIRE_ID\\"/);
  assert.match(json('contact'), /google\.com\/maps\?q=Via%20Roma%201%2C%20Milano/);
  assert.match(json('contact'), /"url":"tel:\+39021234567"/);
  assert.equal(docs.gallery.doc.content[1].elements[0].widgetType, 'image-gallery');
  assert.equal(docs.gallery.doc.content[1].elements[0].settings.open_lightbox, 'yes');
  // Footer: logo, Link (5 pages), Servizi (all services), Contatti, copyright
  const footer = json('footer');
  for (const t of ['"title":"Link"', '"title":"Servizi"', '"title":"Contatti"', 'Servizio 5', '/servizio-5/', '/galleria/', 'mailto:info@ediltest.it', '© 2026 Edil Test']) {
    assert.ok(footer.includes(t), `footer: ${t}`);
  }
  // Header: logo, menu and button on one line; the site menu in the Navigation Menu widget of UAE (its own hamburger below 1025px), no HTML
  const head = docs.header.doc.content.at(-1);
  assert.equal(head.settings.flex_wrap, 'nowrap', 'header on one line');
  assert.deepEqual(head.elements.map((e) => e.settings.css_classes), ['esg-hd-brand', 'esg-hd-nav esg-nav', 'esg-hd-cta']);
  const [menu, ...others] = head.elements[1].elements;
  assert.equal(others.length, 0, 'only the menu widget');
  assert.equal(menu.widgetType, 'navigation-menu');
  assert.deepEqual([menu.settings.layout, menu.settings.dropdown, menu.settings.navmenu_align], ['horizontal', 'tablet', 'right']);
  const named = buildSite(sanitizeSpec({}), { ...sampleSite(), menuSlug: 'menu-principale' }).docs.header.doc.content.at(-1).elements[1].elements[0];
  assert.equal(named.settings.menu, 'menu-principale', 'the site menu, by its slug');
  assert.doesNotMatch(JSON.stringify(docs.header.doc), /"widgetType":"html"|<script|<style|<svg/, 'no HTML in the header');
  assert.doesNotMatch(JSON.stringify(Object.values(docs).map((d) => d.doc)), /"nav-menu"|uael|elementskit|jeg/i, 'no Elementor Pro menu, no other addon');
  // Reviews are shared between Home and About
  const shares = (role) => [...docs[role].marks.values()].map((m) => m.share).filter(Boolean).sort();
  assert.equal(shares('home').length, 9);
  assert.deepEqual(shares('home'), shares('about'));
  // Reviews without photos of the customers
  assert.equal(count('home', /"testimonial_image":\{"url":"","id":""\}/g), 3);
  // Every text widget has its text (an empty one would show the Elementor default "Lorem ipsum")
  const TEXT_KEYS = { heading: ['title'], 'text-editor': ['editor'], button: ['text'], 'icon-box': ['title_text', 'description_text'], testimonial: ['testimonial_content', 'testimonial_name', 'testimonial_job'] };
  const walk = (el, role) => {
    for (const k of TEXT_KEYS[el.widgetType] || []) assert.ok(String(el.settings[k] || '').trim(), `${role}: ${el.widgetType}.${k} is empty`);
    el.elements.forEach((e) => walk(e, role));
  };
  for (const [role, d] of Object.entries(docs)) d.doc.content.forEach((el) => walk(el, role));
  const featureBoxes = JSON.parse(json('home')).content[2].elements[1].elements.map((e) => e.elements[0].settings);
  assert.deepEqual(featureBoxes.map((s) => s.title_text), DEFAULT_SPEC.copy.features.slice(0, 4).map((f) => f.title), '"Why choose us": the first 4 strengths of the template');
  // About: subheader, "Chi siamo" in two alternating rows (text | image, image | text), why us, reviews
  assert.equal(docs.about.doc.content.length, 5, 'subheader, Chi siamo in two rows, why us, reviews');
  assert.match(json('about'), /"title":"Chi siamo"/);
  assert.doesNotMatch(json('about'), /nostra storia|missione/i);
  // Without logo: the site name
  assert.match(JSON.stringify(buildSite(sanitizeSpec({}), { ...sampleSite(), hasLogo: false }).docs.header.doc), /"title":"Edil Test"/);
});

test('template generation: prompt and offline demo provider', async () => {
  const category = { name: 'Idraulici', description: 'Riparazioni e impianti' };
  const { prompt } = buildTemplatePrompt({ category, instructions: 'colori freschi', language: 'it' });
  assert.match(prompt, /\| Categoria \| `Idraulici` \|/);
  assert.match(prompt, /\| Indicazioni di stile \| `colori freschi` \|/);
  assert.match(prompt, /OUTPUT FORMAT/);
  assert.doesNotMatch(prompt, /DESIGN DIRECTION/, 'no direction without a plan');
  assert.doesNotMatch(prompt, /\{\{[A-Z_]+\}\}/);
  const { spec, tokens } = await generateTemplateSpec(new MockProvider({}), { category });
  assert.ok(tokens > 0);
  assert.deepEqual(spec, sanitizeSpec(spec), 'the result is a sanitized spec');
  assert.match(spec.copy.heroTitle, /Idraulici/);

  // Invalid answers are retried, then reported
  let calls = 0;
  const broken = { generate: async () => ({ text: calls++ < 1 ? 'no json' : JSON.stringify({ style: {} }), usage: {} }) };
  assert.ok((await generateTemplateSpec(broken, { category })).spec);
  assert.equal(calls, 2);
  const never = { generate: async () => ({ text: '{"hello": 1}', usage: {} }) };
  await assert.rejects(generateTemplateSpec(never, { category }), /did not return a usable template/);
});

test('siteColors keeps texts readable whatever colors the template has', async () => {
  const { siteColors, contrast } = await import('../src/templates/spec.js');
  const c = siteColors({ primary: '#7DD3FC', secondary: '#FDE047', accent: '#22C55E', heading: '#9CA3AF', text: '#D1D5DB', background: '#334155', dark: '#64748B' });
  assert.ok(contrast(c.heading, '#FFFFFF') >= 7, 'titles on white');
  assert.ok(contrast(c.text, '#FFFFFF') >= 4.5, 'text on white');
  assert.ok(contrast(c.background, '#000000') >= 16, 'light background');
  assert.ok(contrast(c.dark, '#FFFFFF') >= 11, 'white text on dark');
  assert.ok(contrast(c.primaryText, '#FFFFFF') >= 4.5, 'primary as text on white');
  assert.equal(c.onSecondary, c.dark, 'dark text on a light button');
  assert.equal(c.primary, '#7DD3FC', 'the brand colors are not changed');
  // Readable colors are kept as they are
  const ok = DEFAULT_SPEC.style.colors;
  const d = siteColors(ok);
  for (const k of ['heading', 'text', 'background', 'dark']) assert.equal(d[k], ok[k]);
  assert.equal(d.onPrimary, '#FFFFFF');
});

test('templates of the same category get really different designs', async () => {
  const { DIRECTIONS, designPlan, pickDirection } = await import('../src/templates/directions.js');
  const { similarColor, STYLE_OPTIONS, LAYOUTS } = await import('../src/templates/spec.js');
  // Every direction is consistent with the allowed values
  for (const d of DIRECTIONS) {
    for (const [h, b] of d.fonts) assert.ok(FONTS.includes(h) && FONTS.includes(b), `${d.id}: fonts ${h} / ${b}`);
    for (const [k, v] of Object.entries(d.style)) if (STYLE_OPTIONS[k]) for (const x of v) assert.ok(STYLE_OPTIONS[k].includes(x), `${d.id}: style.${k} = ${x}`);
    for (const [k, v] of Object.entries(d.layout)) for (const x of v) assert.ok(LAYOUTS[k].includes(x), `${d.id}: layout.${k} = ${x}`);
  }

  // Five templates for "Impresa edile", each generated knowing the ones already saved
  const category = { name: 'Impresa edile', description: 'Costruzioni e ristrutturazioni' };
  const provider = new MockProvider({});
  const saved = [];
  for (let i = 0; i < 5; i++) {
    const { spec, direction } = await generateTemplateSpec(provider, { category, existing: saved });
    assert.equal(spec.direction, direction.id);
    assert.deepEqual(spec, sanitizeSpec(spec), 'valid spec');
    saved.push(spec);
  }
  const distinct = (f) => new Set(saved.map(f)).size;
  assert.equal(distinct((s) => s.direction), 5, 'five different design directions');
  assert.equal(distinct((s) => s.style.fonts.heading), 5, 'five different title fonts');
  for (let i = 0; i < saved.length; i++) {
    for (let j = 0; j < i; j++) {
      const [a, b] = [saved[i], saved[j]];
      assert.ok(!similarColor(a.style.colors.primary, b.style.colors.primary), `templates ${j + 1} and ${i + 1}: different primary colors`);
      const diffs = [...Object.keys(LAYOUTS).filter((k) => a.layout[k] !== b.layout[k]), ...Object.keys(STYLE_OPTIONS).filter((k) => a.style[k] !== b.style[k])];
      assert.ok(diffs.length >= 6, `templates ${j + 1} and ${i + 1} differ only in ${diffs.join(', ')}`);
    }
  }
  // The prompt tells the AI the direction, the decisions and the palettes already taken
  const direction = pickDirection(saved, { rng: () => 0 });
  const { prompt } = buildTemplatePrompt({ category, direction, plan: designPlan(direction, saved), existing: saved });
  assert.match(prompt, /DESIGN DIRECTION/);
  assert.match(prompt, new RegExp(`Primary colors already taken in this category: .*${saved[0].style.colors.primary}`));
  // A direction chosen by the user wins; discarded drafts are avoided
  assert.equal(pickDirection(saved, { requested: 'minimal' }).id, 'minimal');
  assert.notEqual(pickDirection([], { exclude: ['industrial'], rng: () => 0 }).id, 'industrial');

  // The builder really renders the differences
  const docs = saved.map((spec) => JSON.stringify(buildSite(spec, sampleSite()).docs.home.doc));
  assert.equal(new Set(docs).size, 5);
});

test('the first templates of different categories do not look the same', async () => {
  const provider = new MockProvider({});
  const { sanitizeProfile } = await import('../src/templates/industry.js');
  const profile = sanitizeProfile({ business: 'Artigiani', directions: ['corporate', 'technical', 'industrial', 'minimal', 'natural'] });
  const library = [];
  for (const name of ['Idraulici', 'Elettricisti', 'Imprese edili', 'Serramenti']) {
    const { spec } = await generateTemplateSpec(provider, { category: { name }, existing: [], profile, library });
    library.push(spec);
  }
  assert.equal(new Set(library.map((s) => s.direction)).size, 4, 'four categories, four directions');
  assert.equal(new Set(library.map((s) => s.style.fonts.heading)).size, 4, 'and four title fonts');

  // The badge shows the first key figure, shared with the key figures band
  const spec = sanitizeSpec({ layout: { about: 'badge' }, sections: ['about', 'stats', 'features', 'services', 'gallery', 'reviews'] });
  const { marks } = buildSite(spec, sampleSite()).docs.home;
  assert.equal([...marks.values()].filter((m) => m.share === 'stat1.value').length, 2);
  // Site-wide finishing CSS travels with the header
  assert.match(buildSite(spec, sampleSite()).siteCss, /esg-card:hover/);
});

test('industry analysis of a category drives directions and sections of its templates', async () => {
  const { analyzeCategory, sanitizeProfile, buildProfilePrompt } = await import('../src/templates/industry.js');
  const { REQUIRED_SECTIONS, OPTIONAL_SECTIONS } = await import('../src/templates/spec.js');
  const { DIRECTIONS } = await import('../src/templates/directions.js');
  const category = { name: 'Impresa edile', description: '' };
  assert.match(buildProfilePrompt(category).prompt, /\| Nome della categoria \| `Impresa edile` \|/);

  // Any answer becomes a usable profile: required sections always there, at least 5 known directions
  const p = sanitizeProfile({ sections: ['faq', 'nope', 'reviews'], directions: ['industrial', 'unknown'], conventions: ['<b>Foto dei cantieri</b>', 3] });
  for (const s of REQUIRED_SECTIONS) assert.ok(p.sections.includes(s), `required section ${s}`);
  assert.ok(p.sections.includes('faq'));
  assert.equal(p.directions[0], 'industrial');
  assert.equal(p.directions.length, 5);
  assert.ok(p.directions.every((d) => DIRECTIONS.some((x) => x.id === d)));
  assert.deepEqual(p.conventions, ['Foto dei cantieri']);

  const { profile } = await analyzeCategory(new MockProvider({}), category);
  const saved = [];
  for (let i = 0; i < 5; i++) {
    const { spec } = await generateTemplateSpec(new MockProvider({}), { category, existing: saved, profile });
    assert.ok(profile.directions.includes(spec.direction), 'a direction suitable for the industry');
    for (const s of REQUIRED_SECTIONS) assert.ok(spec.sections.includes(s));
    assert.ok(spec.sections.filter((s) => OPTIONAL_SECTIONS.includes(s)).every((s) => profile.sections.includes(s)), 'only recommended optional sections');
    saved.push(spec);
  }
  assert.equal(new Set(saved.map((s) => s.direction)).size, 5);
  assert.ok(new Set(saved.map((s) => s.sections.join())).size >= 4, 'the templates do not all have the same sections');
  const { prompt } = buildTemplatePrompt({ category, direction: DIRECTIONS[0], plan: { fonts: { heading: 'Oswald', body: 'Roboto' }, style: saved[0].style, layout: saved[0].layout, sections: ['about', 'faq', 'features', 'services', 'gallery', 'reviews'] }, profile });
  assert.match(prompt, /INDUSTRY ANALYSIS OF THE CATEGORY/);
  assert.match(prompt, /Sections of the Home page after the hero, in this order: "about".*"faq"/);
  assert.match(prompt, /"faq": \[4 ×/, 'copy asked for the optional sections of the template');
  assert.doesNotMatch(prompt, /"steps": \[4 ×/, 'not for the sections it does not have');
});

test('Home carousel, About in two alternating rows, designed articles', async () => {
  const { articleDoc } = await import('../src/templates/builder.js');
  const spec = sanitizeSpec({ sections: ['highlights', 'about', 'stats', 'features', 'services', 'process', 'gallery', 'reviews', 'faq'] });
  const { docs } = buildSite(spec, sampleSite(3));
  const home = JSON.stringify(docs.home.doc);
  assert.equal(docs.home.doc.content.length, 10, 'hero + 9 sections in the order of the template');
  assert.match(home, /"widgetType":"image-carousel"/);
  assert.ok([...docs.home.marks.values()].some((m) => m.slot === 'carousel'));
  assert.match(home, /"widgetType":"accordion"/);
  assert.match(home, /"title":"01"/);
  // Hero edge in the color of the next section
  assert.equal(docs.home.doc.content[0].settings.shape_divider_bottom_color, docs.home.doc.content[1].settings.background_color);

  // About: text | image, then image | text
  const [, row1, row2] = docs.about.doc.content;
  const kinds = (row) => row.elements.map((col) => (JSON.stringify(col).includes('"widgetType":"image"') ? 'image' : 'text'));
  assert.deepEqual(kinds(row1), ['text', 'image']);
  assert.deepEqual(kinds(row2), ['image', 'text']);
  assert.match(JSON.stringify(row1), /"title":"Chi siamo"/);
  assert.doesNotMatch(JSON.stringify(row2), /"widgetType":"heading"/, 'no sub-title in the second row');
  assert.match(JSON.stringify(docs.about.doc), /"title":"20\+"/, 'key figures on About too');

  // Single post template: hero with the featured image (dynamic), sidebar with every service
  const single = JSON.stringify(docs.single_post.doc);
  assert.match(single, /post-featured-image/);
  assert.match(single, /"title":"Altri servizi"/);
  assert.doesNotMatch(single, /comments/i);
  // Article of "Servizio 2": static, its image, its title and content, the other services only
  const art = JSON.stringify(articleDoc(docs.single_post.doc, { title: 'Servizio 2', content: '<p>Testo</p>', imageUrl: 'https://x.it/s2.webp', url: '/servizio-2/' }));
  assert.doesNotMatch(art, /theme-post-|__dynamic__/);
  assert.match(art, /"url":"https:\/\/x\.it\/s2\.webp"/);
  assert.match(art, /"editor":"<p>Testo<\/p>"/);
  assert.match(art, /"text":"Servizio 1"/);
  assert.match(art, /"text":"Servizio 3"/);
  assert.doesNotMatch(art, /"text":"Servizio 2"/);
  // A site with one service: no empty "Other services" box
  const one = buildSite(spec, sampleSite(1)).docs.single_post.doc;
  assert.doesNotMatch(JSON.stringify(articleDoc(one, { title: 'Servizio 1', content: '', imageUrl: null, url: '/servizio-1/' })), /Altri servizi|background_image/);
});

test('compare the templates of a category and make one more different', async () => {
  const { compareTemplates, diversify } = await import('../src/templates/directions.js');
  const category = { name: 'Impresa edile', description: 'Costruzioni e ristrutturazioni' };
  const provider = new MockProvider({});
  const saved = [];
  for (let i = 0; i < 4; i++) saved.push((await generateTemplateSpec(provider, { category, existing: saved })).spec);

  // Likeness: 100 for the same design, low for planned templates, what they share is named
  const self = compareTemplates(saved[0], saved[0]);
  assert.equal(self.likeness, 100);
  assert.ok(['direction', 'palette', 'fonts', 'firstScreen', 'shape'].every((x) => self.shared.includes(x)), self.shared.join());
  for (let i = 1; i < 4; i++) {
    const { likeness, shared } = compareTemplates(saved[0], saved[i]);
    assert.ok(likeness >= 0 && likeness < 60, `planned templates look different (${likeness})`);
    assert.ok(!shared.includes('direction') && !shared.includes('firstScreen'));
  }
  // A look-alike: same design, other hero → between the two
  const twin = sanitizeSpec({ ...saved[0], layout: { ...saved[0].layout, hero: saved[0].layout.hero === 'card' ? 'split' : 'card' } });
  const near = compareTemplates(saved[0], twin);
  assert.ok(near.likeness > 80 && near.likeness < 100, String(near.likeness));
  assert.ok(!near.shared.includes('firstScreen') && !near.shared.includes('hero'));

  // "Make it more different": the look-alike moves away from the others, keeping palette, texts and sections
  const others = saved;
  const before = Math.max(...others.map((o) => compareTemplates(twin, o).likeness));
  const next = sanitizeSpec(diversify(twin, others, { suitable: ['minimal', 'premium', 'technical', 'corporate', 'industrial', 'natural'] }));
  const after = Math.max(...others.map((o) => compareTemplates(next, o).likeness));
  assert.ok(after < before - 20, `${before} -> ${after}`);
  assert.ok(compareTemplates(next, twin).likeness < 70);
  assert.deepEqual(next.style.colors, twin.style.colors);
  assert.deepEqual(next.copy, twin.copy);
  assert.deepEqual([...next.sections].sort(), [...twin.sections].sort());
  assert.ok(next.direction === twin.direction || !others.some((o) => o.direction === next.direction), 'a direction no other template has');
  // Without its own hero phrases / about points / 5–6 strengths, no layout that would show sample texts
  const legacy = sanitizeSpec({ ...twin, copy: { ...twin.copy, heroPhrases: undefined, aboutPoints: undefined, features: twin.copy.features.slice(0, 4) } });
  for (let i = 0; i < 10; i++) {
    const l = sanitizeSpec(diversify(legacy, others)).layout;
    assert.notEqual(l.heroPhrases, 'rotating');
    assert.notEqual(l.about, 'sandwich');
    assert.ok(['3', '4'].includes(l.featureCount), l.featureCount);
  }
});

test('no overlapping elements: column titles, large titles on phones, hero arrow and stamp, transparent header', () => {
  const sections = ['features', 'process', 'faq', 'reviews', 'services', 'gallery', 'about'];
  const build = (style = {}, layout = {}) => withCss(buildSite(sanitizeSpec({ style, layout, sections }), sampleSite()));
  const all = (docs, pred) => {
    const out = [];
    const walk = (el) => (pred(el) && out.push(el), (el.elements || []).forEach(walk));
    Object.values(docs).forEach((d) => d.doc.content.forEach(walk));
    return out;
  };
  // A box with a fixed width (px) is never inside a column: it would run over the content beside it
  const layouts = [
    { features: 'split', process: 'vertical', faq: 'left', testimonials: 'cards' },
    { features: 'list', process: 'timeline', faq: 'center', testimonials: 'quote' },
  ];
  for (const layout of layouts) {
    const docs = build({}, layout);
    const nested = [];
    const walk = (el, inColumn) => {
      if (el.elType === 'container' && inColumn && el.settings.width?.unit === 'px') nested.push(el.id);
      const column = el.elType === 'container' && el.settings.width?.unit === '%' && el.settings.width.size < 100;
      (el.elements || []).forEach((x) => walk(x, inColumn || column));
    };
    Object.values(docs).forEach((d) => d.doc.content.forEach((s) => walk(s, false)));
    assert.deepEqual(nested, [], `${JSON.stringify(layout)}: fixed width boxes in columns`);
    // and their titles are smaller there
    const sizes = all(docs, (el) => el.widgetType === 'heading' && el.settings.header_size === 'h2').map((el) => el.settings.typography_font_size.size);
    assert.ok(sizes.includes(34), 'column titles at 34px');
  }
  // The site CSS keeps nested boxes inside their parent and breaks words longer than the line
  const plain = build();
  assert.match(plain.css, /\.e-con \.e-con\{max-width:100%\}/);
  assert.match(plain.css, /\.elementor-heading-title,[^{]*\{overflow-wrap:break-word;min-width:0\}/);
  // Phones: titles at most 36px (H1) / 30px
  for (const h of all(build({ scale: 'xl' }, { hero: 'bottom' }), (el) => el.widgetType === 'heading')) {
    assert.ok(h.settings.typography_font_size_mobile.size <= (h.settings.header_size === 'h1' ? 36 : 30), `${h.settings.title}: ${h.settings.typography_font_size_mobile.size}px on phones`);
  }
  // Full-screen hero: room for the arrow under the content (also on phones), the stamp only on wide screens
  const full = build({ signature: 'stamp' }, { hero: 'center', heroHeight: 'full', divider: 'curve' });
  const hero = full.home.doc.content[0];
  assert.ok(Number(hero.settings.padding.bottom) >= 170 && Number(hero.settings.padding_mobile.bottom) >= 100, 'room for the arrow');
  assert.match(full.css, /@media \(max-width:1199px\)\{\.elementor-widget\.esg-stamp-w\{display:none\}\}/);
  // Transparent header: the first section starts below it
  const over = build({}, { header: 'transparent', hero: 'center', subheader: 'photo' });
  for (const role of ['home', 'about']) {
    const first = over[role].doc.content[0].settings;
    assert.ok(Number(first.padding.top) >= 150 && Number(first.padding_mobile.top) >= 110, `${role}: below the header`);
  }
  // Vertical labels never go past their title block
  assert.match(build({ signature: 'vertical' }).css, /\.elementor-widget\.esg-vlabel\{[^}]*max-height:calc\(100% - 4px\);overflow:hidden/);
});
