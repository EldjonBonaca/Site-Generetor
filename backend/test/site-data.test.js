/**
 * Site data: second phone number, Google Business Profile map, notes for the AI.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'esg-site-data-'));
process.env.ENCRYPTION_KEY ||= 'c'.repeat(64);

const { parseMapsLink, siteMap, resolveMapsLink, isGoogleMapsLink, isShortMapsLink } = await import('../src/lib/maps.js');
const { buildSite } = await import('../src/templates/builder.js');
const { sanitizeSpec } = await import('../src/templates/spec.js');
const { replaceContacts } = await import('../src/elementor/apply.js');
const { buildPagePrompt, clientInstructions } = await import('../src/generation/prompt-builder.js');
const { buildTemplatePrompt } = await import('../src/templates/generate.js');
const { prepareDocument } = await import('../src/kits/site.js');
const { default: app } = await import('../src/app.js');

const PLACE =
  'https://www.google.com/maps/place/Idraulica+Rossi+S.r.l./@41.9027835,12.4963655,17z/data=!3m1!4b1!4m6!3m5!1s0x132f61b6532013ad:0x28f1c82e908503c4!8m2!3d41.9027795!4d12.4989404!16s%2Fg%2F11c1';

test('Google Business Profile links: place, search, embed, other links', () => {
  assert.deepEqual(parseMapsLink(PLACE), { name: 'Idraulica Rossi S.r.l.', lat: '41.9027795', lng: '12.4989404' }, 'the pin of the place, not the center of the view');
  assert.equal(parseMapsLink('https://www.google.com/maps/search/?api=1&query=Idraulica%20Rossi%20Roma').query, 'Idraulica Rossi Roma');
  const embed = 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2969.6!2d12.49!3d41.90!2m3!1f0!2f0!3f0';
  assert.equal(parseMapsLink(`<iframe src="${embed}" width="600" height="450"></iframe>`).embed, embed, 'the code of "Embed a map"');
  assert.equal(parseMapsLink('https://example.com/maps/place/x'), null);
  assert.equal(parseMapsLink('not a link'), null);
  assert.ok(isGoogleMapsLink('https://maps.app.goo.gl/AbC123'));
  assert.ok(!isGoogleMapsLink('https://www.facebook.com/rossi'));
  assert.ok(isGoogleMapsLink('https://www.google.co.uk/maps/place/x') && isGoogleMapsLink('https://maps.google.it/?cid=1'));
  assert.ok(!isGoogleMapsLink('https://google.example.com/maps/place/x'), 'not a look-alike host');
  assert.ok(isShortMapsLink('https://goo.gl/maps/xyz') && !isShortMapsLink('https://goo.gl/abc'), 'goo.gl: only its maps links');

  const address = 'Via Roma 1\nRoma';
  assert.equal(siteMap({ address }).src, 'https://www.google.com/maps?q=Via%20Roma%201%2C%20Roma&output=embed', 'no link: the address, as before');
  const place = siteMap({ businessUrl: PLACE, siteName: 'Rossi', address });
  assert.equal(place.query, 'Idraulica Rossi S.r.l., Via Roma 1, Roma');
  assert.equal(place.src, 'https://www.google.com/maps?q=Idraulica%20Rossi%20S.r.l.%2C%20Via%20Roma%201%2C%20Roma&ll=41.9027795,12.4989404&z=16&output=embed');
  assert.ok(place.fromListing);
  assert.equal(siteMap({ businessUrl: `<iframe src="${embed}"></iframe>`, address }).src, embed);
  // A short link not expanded (offline) or an unknown link: the listing is searched by name and address
  assert.equal(siteMap({ businessUrl: 'https://maps.app.goo.gl/AbC123', siteName: 'Idraulica Rossi', address }).query, 'Idraulica Rossi, Via Roma 1, Roma');
  assert.equal(siteMap({ businessUrl: 'https://maps.app.goo.gl/AbC123', resolvedUrl: PLACE, siteName: 'Rossi', address }).query, 'Idraulica Rossi S.r.l., Via Roma 1, Roma', 'the expanded link');
  assert.doesNotMatch(siteMap({ businessUrl: 'https://www.google.com/maps/embed?pb=x"><script>', address }).src, /<script>|"/, 'no markup in the iframe link');
});

test('short links are expanded through Google only (cookie consent skipped)', async () => {
  const calls = [];
  const fake = (routes) => async (url) => {
    calls.push(url);
    const location = routes[url];
    return { status: location ? 302 : 200, headers: { get: (h) => (h === 'location' ? location || null : null) } };
  };
  const consent = `https://consent.google.com/ml?continue=${encodeURIComponent(PLACE)}&gl=IT`;
  assert.equal(await resolveMapsLink('https://maps.app.goo.gl/AbC123', { fetchImpl: fake({ 'https://maps.app.goo.gl/AbC123': consent }) }), PLACE);
  assert.equal(calls.length, 1, 'the place link itself is not requested');

  calls.length = 0;
  const out = await resolveMapsLink('https://g.page/r/xyz', { fetchImpl: fake({ 'https://g.page/r/xyz': 'http://169.254.169.254/latest/' }) });
  assert.equal(calls.length, 1, 'a redirect out of Google is never followed');
  assert.equal(siteMap({ businessUrl: 'https://g.page/r/xyz', resolvedUrl: out, siteName: 'Rossi', address: 'Via Roma 1' }).query, 'Rossi, Via Roma 1');

  assert.equal(await resolveMapsLink(PLACE, { fetchImpl: () => assert.fail('not a short link') }), '');
  assert.equal(await resolveMapsLink('https://maps.app.goo.gl/x', { fetchImpl: async () => { throw new Error('offline'); } }), '');
});

const site = (extra = {}) => ({
  lang: 'it',
  siteName: 'Edil Test',
  phone: '+39 02 1234 567',
  phone2: '+39 333 765 4321',
  email: 'info@ediltest.it',
  address: 'Via Roma 1, Milano',
  copyright: '© 2026 Edil Test',
  hasLogo: true,
  mapEmbed: true,
  contactShortcode: '[contact-form-7 id="INSERIRE_ID" title="Modulo di contatto"]',
  pages: Object.fromEntries(['home', 'about', 'services', 'gallery', 'contact'].map((r) => [r, { title: r, url: r === 'home' ? '/' : `/${r}/` }])),
  services: [{ name: 'Service 1', url: '/service-1/' }],
  ...extra,
});

test('template sites: second phone number and the map of the business listing', () => {
  const map = siteMap({ businessUrl: PLACE, siteName: 'Edil Test', address: 'Via Roma 1, Milano' });
  const { docs } = buildSite(sanitizeSpec({ layout: { header: 'topbar' } }), site({ map }));
  const json = (role) => JSON.stringify(docs[role].doc);
  for (const role of ['contact', 'footer', 'single_post']) {
    assert.match(json(role), /"url":"tel:\+39021234567"/, `${role}: first phone`);
    assert.match(json(role), /"url":"tel:\+393337654321"/, `${role}: second phone`);
  }
  const topbar = JSON.stringify(docs.header.doc.content[0]);
  assert.match(topbar, /tel:\+39021234567/);
  assert.match(topbar, /mailto:info@ediltest\.it/, 'the top bar keeps the email');
  assert.doesNotMatch(topbar, /3337654321/);
  assert.ok(json('contact').includes('ll=41.9027795,12.4989404'), 'map of the business listing');

  const same = buildSite(sanitizeSpec({}), site({ phone2: '+39 02 1234567' })).docs;
  assert.equal((JSON.stringify(same.contact.doc).match(/tel:\+39021234567/g) || []).length, 1, 'the same number is not shown twice');
  const none = buildSite(sanitizeSpec({}), site({ phone2: '' })).docs;
  assert.match(JSON.stringify(none.contact.doc), /google\.com\/maps\?q=Via%20Roma%201%2C%20Milano&output=embed/, 'no link: the address');
});

test('the export keeps the links to the second phone number', () => {
  const doc = {
    content: [
      { id: 'a', elType: 'widget', widgetType: 'button', settings: { link: { url: 'tel:+39 333 765 4321' } }, elements: [] },
      { id: 'b', elType: 'widget', widgetType: 'button', settings: { link: { url: 'tel:+1 555 0102' } }, elements: [] },
    ],
  };
  replaceContacts(doc, { phone: '+39 02 1234 567', phone2: '+39 333 765 4321', email: 'info@x.it' });
  assert.equal(doc.content[0].settings.link.url, 'tel:+393337654321');
  assert.equal(doc.content[1].settings.link.url, 'tel:+39021234567', 'any other number -> the first phone');
});

test('Template Kit: a second demo phone number gets the second phone of the site', () => {
  const w = (id, widgetType, settings) => ({ id, elType: 'widget', widgetType, settings, elements: [] });
  const doc = {
    content: [
      {
        id: 'c',
        elType: 'container',
        settings: {},
        elements: [w('h1', 'heading', { title: '+1 (555) 010-2030' }), w('h2', 'heading', { title: '+1 (555) 010-9999' }), w('h3', 'heading', { title: '+1 (555) 010-2030' }), w('m', 'google_maps', { address: 'Demo HQ' })],
      },
    ],
  };
  const map = siteMap({ businessUrl: PLACE, siteName: 'Rossi', address: 'Via Roma 1' });
  const { doc: out } = prepareDocument(doc, 'contact', [{ type: 'contact' }], { ...site(), phone: '+39 06 1234 5678', phone2: '+39 333 1', map, menuSlug: 'main' });
  const titles = out.content[0].elements.map((e) => e.settings.title);
  assert.deepEqual(titles.slice(0, 3), ['+39 06 1234 5678', '+39 333 1', '+39 06 1234 5678']);
  assert.equal(out.content[0].elements[3].settings.address, 'Idraulica Rossi S.r.l., Via Roma 1', 'Google Maps widget: the business listing');
});

test('notes for the AI: mandatory instructions in every prompt', () => {
  const project = { site_name: 'Rossi', phone: '+39 06 1', phone2: '', email: 'a@b.it', address: 'Via Roma 1', city: 'Roma', industry: 'Idraulico', language: 'it', notes: 'Parla sempre di 30 anni di esperienza. Non citare mai i prezzi.' };
  const fields = [{ id: 'home.hero.title', format: 'text', maxLength: 60, original: '' }];
  // The built-in prompt has no {{NOTE}}: the notes are added anyway
  const { prompt, system } = buildPagePrompt({ promptContent: 'Scrivi i testi di {{NOME_SITO}}.', project, services: [], fields, pageTitle: 'Home', role: 'home' });
  assert.ok(prompt.includes('=== INSTRUCTIONS OF THE CLIENT'));
  assert.ok(prompt.includes('Parla sempre di 30 anni di esperienza. Non citare mai i prezzi.'));
  assert.ok(prompt.indexOf('INSTRUCTIONS OF THE CLIENT') < prompt.indexOf('=== OUTPUT FORMAT'), 'before the output format');
  assert.match(prompt, /Respect the INSTRUCTIONS OF THE CLIENT/);
  assert.match(system, /instructions of the client/);

  const plain = buildPagePrompt({ promptContent: 'x', project: { ...project, notes: '  ' }, services: [], fields, pageTitle: 'Home', role: 'home' });
  assert.ok(!plain.prompt.includes('INSTRUCTIONS OF THE CLIENT') && !/client/i.test(plain.system), 'no notes: nothing added');
  assert.equal(clientInstructions(''), '');

  const tpl = buildTemplatePrompt({ category: { name: 'Idraulici', description: '' }, clientNotes: 'Colori caldi, niente blu.' });
  assert.ok(tpl.prompt.includes('Colori caldi, niente blu.') && tpl.prompt.includes('INSTRUCTIONS OF THE CLIENT THIS TEMPLATE IS DESIGNED FOR'));
});

// ------------------------------------------------------------------ API --

let server;
let base;
before(async () => {
  await new Promise((r) => (server = app.listen(0, '127.0.0.1', r)));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server?.close());

const api = async (method, url, body) => {
  const res = await fetch(base + url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = res.status === 204 ? null : await res.json();
  if (!res.ok) throw new Error(`${method} ${url}: ${res.status} ${JSON.stringify(data)}`);
  return data;
};

test('API: second phone and Google Business link are saved, checked and duplicated', async () => {
  const p = await api('POST', '/projects', { site_name: 'Rossi' });
  let saved = await api('PATCH', `/projects/${p.id}`, { phone: '+39 06 1234 5678', phone2: 'abc', email: 'info@rossi.it', address: 'Via Roma 1', google_business_url: ` ${PLACE} ` });
  assert.equal(saved.google_business_url, PLACE, 'trimmed');
  assert.equal(saved.map_resolved_url, '', 'not a short link: nothing to expand');
  assert.ok(saved.readiness.items.some((i) => i.message === 'The second phone number is not valid.' && i.level === 'error'));

  saved = await api('PATCH', `/projects/${p.id}`, { phone2: '+39 333 765 4321', google_business_url: 'https://www.facebook.com/rossi' });
  assert.ok(!saved.readiness.items.some((i) => /second phone/.test(i.message)));
  assert.ok(saved.readiness.items.some((i) => i.level === 'warning' && /not a Google Maps link/.test(i.message)));

  saved = await api('PATCH', `/projects/${p.id}`, { phone2: '', google_business_url: '' });
  assert.ok(!saved.readiness.items.some((i) => /second phone|Google Maps link/.test(i.message)), 'both optional');

  await api('PATCH', `/projects/${p.id}`, { phone2: '+39 333 765 4321', google_business_url: PLACE });
  const copy = await api('POST', `/projects/${p.id}/duplicate`);
  assert.equal(copy.phone2, '+39 333 765 4321');
  assert.equal(copy.google_business_url, PLACE);
});
