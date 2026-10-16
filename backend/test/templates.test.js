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
const { sanitizeSpec, DEFAULT_SPEC, FONTS } = await import('../src/templates/spec.js');
const { buildSite, DOC_ROLES, TEMPLATE_IMAGE } = await import('../src/templates/builder.js');
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
  assert.equal(spec.copy.features.length, 4);
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
  // Header: logo, menu and button on one line; hamburger menu (HTML widget) below 1025px
  const head = docs.header.doc.content.at(-1);
  assert.equal(head.settings.flex_wrap, 'nowrap', 'header on one line');
  assert.deepEqual(head.elements.map((e) => e.settings.css_classes), ['esg-hd-brand', 'esg-hd-nav', 'esg-hd-cta']);
  const nav = head.elements[1].elements[0];
  assert.equal(nav.widgetType, 'html');
  assert.ok(docs.header.marks.get(`${nav.id}:html`).fixed, 'the menu is not written by the AI');
  for (const t of ['href="/chi-siamo/"', 'href="/galleria/"', 'class="esg-nav-toggle"', 'aria-expanded="false"', '@media (max-width:1024px)', 'esg-nav-cta']) assert.ok(nav.settings.html.includes(t), `header menu: ${t}`);
  assert.doesNotMatch(JSON.stringify(Object.values(docs).map((d) => d.doc)), /nav-menu|uael|ultimate|elementskit|jeg/i, 'only native Elementor widgets');
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
  assert.deepEqual(featureBoxes.map((s) => s.title_text), DEFAULT_SPEC.copy.features.map((f) => f.title), '"Why choose us": the 4 strengths of the template');
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
  assert.match(JSON.stringify(buildSite(spec, sampleSite()).docs.header.doc), /esg-card:hover/);
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
