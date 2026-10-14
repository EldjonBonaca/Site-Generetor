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
  contactShortcode: '[metform form_id="INSERIRE_ID"]',
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
    { layout: { header: 'centered', hero: 'left', cta: 'none' } },
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
  const { docs } = buildSite(sanitizeSpec({ layout: { cta: 'none' } }), sampleSite(5));
  const json = (role) => JSON.stringify(docs[role].doc);
  const count = (role, re) => (json(role).match(re) || []).length;
  assert.equal(count('home', /"widgetType":"image-box"/g), 3, 'home: 3 featured services');
  assert.equal(count('services', /"widgetType":"image-box"/g), 5, 'services page: one card per service');
  assert.equal(count('home', /"widgetType":"testimonial"/g), 3, '3 reviews');
  assert.equal(count('about', /"widgetType":"testimonial"/g), 3, 'the same 3 reviews on About');
  assert.equal(docs.home.doc.content.length, 5, 'hero, about, why us, services, reviews (no call to action)');
  assert.match(json('home'), /"url":"\/chi-siamo\/"/, '"Scopri di più" -> Chi Siamo');
  assert.match(json('home'), /"url":"\/servizi\/"/, '"Tutti i servizi" -> Servizi');
  assert.match(json('contact'), /\[metform form_id=\\"INSERIRE_ID\\"\]/);
  assert.match(json('contact'), /google\.com\/maps\?q=Via%20Roma%201%2C%20Milano/);
  assert.match(json('contact'), /"url":"tel:\+39021234567"/);
  assert.equal(docs.gallery.doc.content[1].elements[0].widgetType, 'image-gallery');
  assert.equal(docs.gallery.doc.content[1].elements[0].settings.open_lightbox, 'yes');
  // Footer: logo, Link (5 pages), Servizi (all services), Contatti, copyright
  const footer = json('footer');
  for (const t of ['"title":"Link"', '"title":"Servizi"', '"title":"Contatti"', 'Servizio 5', '/servizio-5/', '/galleria/', 'mailto:info@ediltest.it', '© 2026 Edil Test']) {
    assert.ok(footer.includes(t), `footer: ${t}`);
  }
  assert.match(json('header'), /"view":"inline"/, 'header menu');
  assert.doesNotMatch(JSON.stringify(Object.values(docs).map((d) => d.doc)), /nav-menu|uael|ultimate|elementskit|jeg/i, 'only native Elementor widgets');
  // Reviews are shared between Home and About
  const shares = (role) => [...docs[role].marks.values()].map((m) => m.share).filter(Boolean).sort();
  assert.equal(shares('home').length, 9);
  assert.deepEqual(shares('home'), shares('about'));
  // Without logo: the site name
  assert.match(JSON.stringify(buildSite(sanitizeSpec({}), { ...sampleSite(), hasLogo: false }).docs.header.doc), /"title":"Edil Test"/);
});

test('template generation: prompt and offline demo provider', async () => {
  const category = { name: 'Idraulici', description: 'Riparazioni e impianti' };
  const { prompt } = buildTemplatePrompt({ category, instructions: 'colori freschi', language: 'it' });
  assert.match(prompt, /\| Categoria \| `Idraulici` \|/);
  assert.match(prompt, /\| Indicazioni di stile \| `colori freschi` \|/);
  assert.match(prompt, /OUTPUT FORMAT/);
  assert.match(prompt, /Fonts: only from this list: Poppins/);
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
