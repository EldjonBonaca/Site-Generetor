import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'esg-unit-'));
process.env.ENCRYPTION_KEY ||= 'a'.repeat(64);

const { extractJson, validateValues } = await import('../src/ai/json.js');
const { analyzeDocument } = await import('../src/elementor/analyze.js');
const { applyFieldValues, applyImages, replaceContacts, sanitizeHtml } = await import('../src/elementor/apply.js');
const { encrypt, decrypt, maskKey } = await import('../src/lib/crypto.js');
const { renderTemplate } = await import('../src/generation/prompt-builder.js');

test('extractJson handles fences, chatter and trailing commas', () => {
  assert.deepEqual(extractJson('```json\n{"a": "1",}\n```'), { a: '1' });
  assert.deepEqual(extractJson('Sure! Here it is: {"a": "x"} hope it helps'), { a: 'x' });
  assert.throws(() => extractJson('no json here'), /No JSON/);
});

test('validateValues flattens nested answers and reports missing keys', () => {
  const { values, missing } = validateValues({ home: { hero: { title: 'Hi' } }, other: 3 }, ['home.hero.title', 'home.x']);
  assert.deepEqual(values, { 'home.hero.title': 'Hi' });
  assert.deepEqual(missing, ['home.x']);
});

const sampleDoc = () => ({
  content: [
    {
      id: 'a1', elType: 'section',
      settings: { background_background: 'classic', background_image: { url: 'https://demo/hero.jpg', id: 5 }, background_image_mobile: { url: 'https://demo/hero.jpg', id: 5 } },
      elements: [
        {
          id: 'b1', elType: 'column', settings: { _column_size: 100 },
          elements: [
            { id: 'c1', elType: 'widget', widgetType: 'heading', settings: { title: 'Demo title', header_size: 'h1', title_color: '#fff' }, elements: [] },
            { id: 'c2', elType: 'widget', widgetType: 'text-editor', settings: { editor: '<p>Call hello@demo.com</p>' }, elements: [] },
            { id: 'c3', elType: 'widget', widgetType: 'button', settings: { text: 'Call now', link: { url: 'tel:+15550102030', is_external: '' } }, elements: [] },
            { id: 'c4', elType: 'widget', widgetType: 'ekit-heading', settings: { ekit_heading_title: 'Third party title', ekit_heading_title_tag: 'h2', ekit_heading_seperator_style: 'solid' }, elements: [] },
            { id: 'c5', elType: 'widget', widgetType: 'image', settings: { image: { url: 'https://demo/img.jpg', id: 9 } }, elements: [] },
            { id: 'c6', elType: 'widget', widgetType: 'icon-list', settings: { icon_list: [{ _id: 'i1', text: '+1 (555) 010-2030', link: { url: 'tel:+15550102030' } }] }, elements: [] },
          ],
        },
      ],
    },
  ],
});

test('analyzeDocument finds text fields, image slots and demo contacts', () => {
  const a = analyzeDocument(sampleDoc(), { prefix: 'home', heroName: 'hero' });
  const ids = a.fields.map((f) => f.id);
  assert.ok(ids.includes('home.hero.heading1.title'));
  assert.ok(ids.includes('home.hero.text_editor1.editor'));
  assert.ok(ids.includes('home.hero.ekit_heading1.ekit_heading_title'), 'generic 3rd-party text key');
  assert.ok(!ids.some((id) => id.includes('title_tag') || id.includes('seperator')), 'config values ignored');
  assert.equal(a.fields.find((f) => f.key === 'editor').format, 'html');
  assert.equal(a.slots.length, 2, 'responsive variant is not a separate slot');
  assert.ok(a.contacts.emails.includes('hello@demo.com'));
  assert.ok(a.contacts.phones.some((p) => p.includes('555')));
  assert.equal(a.slots[0].id, 'a1:background_image', 'slot id = element id + settings path');
  assert.equal(a.fields.find((f) => f.key === 'text' && f.widget === 'icon-list').ref, 'c6:icon_list.0.text', 'field ref = element id + settings path');
});

test('apply* functions only touch targeted values', () => {
  const doc = sampleDoc();
  const before = JSON.stringify(doc);
  const a = analyzeDocument(doc, { prefix: 'home', heroName: 'hero' });
  applyFieldValues(doc, a.fields, { 'home.hero.heading1.title': 'New <b>title</b>', 'home.hero.text_editor1.editor': '<p>Hi</p><script>x()</script>' });
  applyImages(doc, a.slots, { [a.slots[0].id]: { url: 'https://site/wp-content/uploads/hero.webp', alt: 'Hero' } });
  replaceContacts(doc, { phone: '+39 06 1234 5678', email: 'info@site.it', replacements: [{ from: '+1 (555) 010-2030', to: '+39 06 1234 5678' }] });

  const sec = doc.content[0];
  const w = sec.elements[0].elements;
  assert.equal(w[0].settings.title, 'New title', 'plain text fields drop html');
  assert.equal(w[0].settings.title_color, '#fff', 'style untouched');
  assert.equal(w[0].id, 'c1', 'ids untouched');
  assert.equal(w[1].settings.editor, '<p>Hi</p>', 'script removed');
  assert.equal(sec.settings.background_image.url, 'https://site/wp-content/uploads/hero.webp');
  assert.equal(sec.settings.background_image_mobile.url, 'https://site/wp-content/uploads/hero.webp', 'responsive variant updated');
  assert.equal(w[2].settings.link.url, 'tel:+390612345678');
  assert.equal(w[5].settings.icon_list[0].text, '+39 06 1234 5678');
  assert.notEqual(JSON.stringify(doc), before);
});

test('sanitizeHtml strips event handlers and javascript urls', () => {
  assert.equal(sanitizeHtml('<a href="javascript:alert(1)" onclick="x()">a</a>'), '<a href="#">a</a>');
});

test('encryption round-trip and masking', () => {
  const enc = encrypt('sk-ant-secret-1234abcd');
  assert.notEqual(enc, 'sk-ant-secret-1234abcd');
  assert.equal(decrypt(enc), 'sk-ant-secret-1234abcd');
  assert.equal(maskKey('sk-ant-secret-1234abcd'), 'sk-...abcd');
});

test('renderTemplate replaces known variables only', () => {
  assert.equal(renderTemplate('Hi {{site_name}} {{ city }} {{unknown}}', { site_name: 'A', city: 'B' }), 'Hi A B {{unknown}}');
});

test('a temporary provider error (503 overloaded) is retried, then explained', async () => {
  const http = await import('node:http');
  const { default: GeminiProvider } = await import('../src/ai/providers/gemini.js');
  let calls = 0;
  let failures = 2;
  const server = http.createServer((req, res) => {
    calls++;
    req.resume();
    if (failures-- > 0) {
      res.writeHead(503, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: { message: 'This model is currently experiencing high demand.' } }));
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'OK' }] }, finishReason: 'STOP' }], usageMetadata: {} }));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const provider = new GeminiProvider({ apiKey: 'k', baseUrl, model: 'gemini-test', retryDelays: [1, 1] });
    assert.equal((await provider.generate('hi')).text, 'OK');
    assert.equal(calls, 3, 'two 503 answers, then the answer');
    failures = 10;
    await assert.rejects(provider.generate('hi'), /high demand.*tried 3 times.*another model/);
  } finally {
    server.close();
  }
});

test('an overloaded model hands over to the other models of the provider', async () => {
  const http = await import('node:http');
  const { createProvider } = await import('../src/ai/registry.js');
  const seen = [];
  const server = http.createServer((req, res) => {
    req.resume();
    const model = decodeURIComponent(req.url.match(/models\/([^:]+):/)[1]);
    seen.push(model);
    const send = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (model === 'busy-model') return send(503, { error: { message: 'high demand' } });
    if (model === 'old-model') return send(404, { error: { message: 'not found' } });
    send(200, { candidates: [{ content: { parts: [{ text: `OK from ${model}` }] }, finishReason: 'STOP' }], usageMetadata: {} });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const provider = createProvider({ type: 'gemini', encrypted_api_key: '', base_url: `http://127.0.0.1:${server.address().port}`, model: 'busy-model', models_json: JSON.stringify(['busy-model', 'old-model', 'free-model']) });
    provider.retryDelays = [1];
    provider.fallbackRetryDelays = [1];
    assert.equal((await provider.generate('hi')).text, 'OK from free-model');
    assert.deepEqual(seen, ['busy-model', 'busy-model', 'old-model', 'free-model']);
    assert.equal(provider.model, 'free-model', 'the next calls use the model that answers');
  } finally {
    server.close();
  }
});

test('copyright line: agency credit by default, links only in the one typed by the user', async () => {
  const { copyrightText, sanitizeCopyright } = await import('../src/generation/plan.js');
  const year = new Date().getFullYear();
  assert.equal(
    copyrightText({ language: 'it', site_name: 'Edil Rossi & Figli', vat_number: '01234567890', copyright: '' }),
    `Creato da <a style="color:var(--e-global-color-primary);font-weight:600" href="https://localweb.it/" target="_blank" title="Local Web – Agenzia Web Marketing Milano">Local Web – Agenzia Web Marketing Milano</a> Copyrights © ${year} Edil Rossi &amp; Figli - P.IVA 01234567890 | Tutti i diritti riservati.`
  );
  assert.match(copyrightText({ language: 'it', site_name: 'Edil', vat_number: '', copyright: '' }), /- P\.IVA 123456 \|/, 'placeholder until the P.IVA is set');
  assert.equal(
    sanitizeCopyright('By <a href="https://x.it/" target="_blank" onclick="evil()">X</a> <script>alert(1)</script>© 2026 A&B <a href="javascript:alert(1)">bad</a>'),
    'By <a href="https://x.it/" target="_blank" rel="noopener">X</a> alert(1)© 2026 A&amp;B bad'
  );
});

test('WhatsApp number for Joinchat: digits with the country code, only when the button is on', async () => {
  const { whatsappNumber } = await import('../src/generation/plan.js');
  const p = (whatsapp_number, language = 'it', whatsapp_enabled = '1') => whatsappNumber({ whatsapp_enabled, whatsapp_number, language });
  assert.equal(p('+39 333 123 4567'), '393331234567');
  assert.equal(p('0039 333 1234567'), '393331234567');
  assert.equal(p('333 123 4567'), '393331234567', 'Italian site: +39 added');
  assert.equal(p('06 1234 5678'), '390612345678', 'landline keeps its 0');
  assert.equal(p('+44 7700 900123', 'en'), '447700900123');
  assert.equal(p('333 123 4567', 'it', ''), null, 'button off');
  assert.equal(p('abc'), null, 'not a number');
});

test('SEO score with the checks of Yoast: green page, thin page, docToHtml of Elementor widgets', async () => {
  const { seoScore, docToHtml } = await import('../src/generation/seo-score.js');
  const filler = 'Lavoriamo con cura e attenzione per ogni cliente della zona, con materiali certificati e tempi chiari. ';
  const body = Array.from({ length: 30 }, () => filler).join('');
  const kp = 'galleria lavori idraulico Roma';
  const html = [
    '<h1>Galleria</h1>',
    `<p>Benvenuti nella galleria lavori idraulico Roma: le foto dei nostri interventi.</p>`,
    `<h2>La nostra galleria lavori idraulico Roma</h2>`,
    `<p>${body} Nella galleria lavori idraulico Roma trovi bagni e caldaie. ${body}</p>`,
    '<h3>Bagni rinnovati</h3>',
    '<img src="a.webp" alt="galleria lavori idraulico Roma bagno"><img src="b.webp" alt="caldaia">',
    '<p><a href="/contatti/">Contattaci</a> <a href="https://www.google.com/maps/search/?api=1&query=Roma">Apri in Google Maps</a></p>',
  ].join('\n');
  const good = seoScore({ html, keyphrase: kp, title: 'Galleria lavori idraulico Roma | Rossi Idraulica', description: 'Galleria lavori idraulico Roma: guarda le foto di bagni, caldaie e impianti realizzati da Rossi Idraulica in città e provincia, con cura.', slug: 'galleria', otherKeyphrases: ['idraulico Roma'] });
  assert.equal(good.rating, 'good', JSON.stringify(good.checks.filter((c) => c.score < 9)));
  assert.ok(good.score >= 85, `score ${good.score}`);

  const thin = seoScore({ html: '<h1>Galleria</h1><p>Le nostre foto.</p><img src="a.webp" alt="">', keyphrase: kp, title: 'Galleria', description: 'Foto', slug: 'galleria', otherKeyphrases: [kp] });
  assert.equal(thin.rating, 'bad');
  assert.ok(thin.checks.some((c) => c.id === 'textLength' && c.score < 0));
  assert.ok(thin.checks.some((c) => c.id === 'previouslyUsed' && c.score < 9));

  const doc = { content: [{ elType: 'container', elements: [
    { elType: 'widget', widgetType: 'heading', settings: { title: 'Chi Siamo', header_size: 'h1' }, elements: [] },
    { elType: 'widget', widgetType: 'text-editor', settings: { editor: '<p>Primo paragrafo.</p>' }, elements: [] },
    { elType: 'widget', widgetType: 'image', settings: { image: { url: 'x.webp', alt: 'Foto <bella>' } }, elements: [] },
    { elType: 'widget', widgetType: 'button', settings: { text: 'Contatti', link: { url: '/contatti/' } }, elements: [] },
    { elType: 'widget', widgetType: 'html', settings: { html: '<style>.a{}</style><p>Testo</p>' }, elements: [] },
  ] }] };
  assert.equal(docToHtml(doc), '<h1>Chi Siamo</h1>\n<p>Primo paragrafo.</p>\n<img src="x.webp" alt="Foto &lt;bella>">\n<p><a href="/contatti/">Contatti</a></p>\n<p>Testo</p>');
});

test('reviews of addon widgets (Template Kits) are texts for the AI', () => {
  const doc = { content: [{ id: 'c1', elType: 'container', settings: {}, elements: [
    { id: 'w1', elType: 'widget', widgetType: 'elementskit-testimonial', settings: { ekit_testimonial_data: [{ _id: 'a1', client_name: 'John Carter', designation: 'Manager', review: 'Great service, fast and friendly team.', rating: '5' }] }, elements: [] },
  ] }] };
  const keys = analyzeDocument(doc, { prefix: 'home' }).fields.map((f) => f.key);
  assert.ok(keys.includes('review'), keys.join(','));
  assert.ok(keys.includes('client_name') && keys.includes('designation'));
  assert.ok(!keys.includes('rating'));
});

test('Contact page: the AI gets the presentation written on the About page', async () => {
  const { relatedContext } = await import('../src/generation/runner.js');
  const long = 'Siamo una ditta di famiglia attiva dal 1985 a Bergamo, specializzata in ristrutturazioni di case e appartamenti con materiali di qualità.';
  const pages = [
    { key: 'about', role: 'about', fields: [{ id: 'a', value: `<p>${long}</p>`, source: 'ai' }, { id: 'b', value: 'Chi siamo', source: 'ai' }] },
    { key: 'contact', role: 'contact', fields: [] },
  ];
  const note = relatedContext(pages, pages[1]);
  assert.ok(note.includes(long) && !note.includes('<p>'));
  assert.equal(relatedContext(pages, pages[0]), '');
});

test('SVG logos: editor exports are cleaned and measured, active content is rejected', async () => {
  const { inspectImage, prepareUpload } = await import('../src/lib/upload.js');
  // Typical Illustrator export: XML prolog, comment, DOCTYPE with entities, foreignObject fallback, i:pgf data
  const illustrator = `﻿<?xml version="1.0" encoding="utf-8"?>
<!-- Generator: Adobe Illustrator 27.0.0, SVG Export Plug-In -->
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" [
  <!ENTITY ns_ai "http://ns.adobe.com/AdobeIllustrator/10.0/">
]>
<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:i="&ns_ai;" x="0px" y="0px" viewBox="0 0 400 120" xml:space="preserve">
<switch><foreignObject requiredExtensions="&ns_ai;" x="0" y="0" width="1" height="1"></foreignObject>
<g i:extraneous="self"><path fill="#C8102E" d="M0 0h400v120H0z"/><text x="10" y="80" font-family="'Montserrat'">Logo on top</text></g></switch>
<i:pgf id="adobe_illustrator_pgf"><![CDATA[eJzs]]></i:pgf>
</svg>`;
  const info = await inspectImage(Buffer.from(illustrator), 'logo.svg');
  assert.equal(info.mime, 'image/svg+xml');
  assert.deepEqual([info.width, info.height], [400, 120]);
  const clean = info.buffer.toString('utf8');
  assert.doesNotMatch(clean, /foreignObject|ENTITY|i:pgf|<!--/);
  assert.match(clean, /<path fill="#C8102E"/);

  const up = await prepareUpload({ buffer: Buffer.from(illustrator), originalname: 'Logo Azienda.SVG' });
  assert.equal(up.info.mime, 'image/svg+xml');
  assert.equal(up.info.width, 400);
  assert.doesNotMatch(up.buffer.toString('utf8'), /foreignObject/);

  const sized = await inspectImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="180px" viewBox="0 0 360 90"/>'), 'a.svg');
  assert.deepEqual([sized.width, sized.height], [180, 45]);

  for (const bad of [
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>',
    '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><rect/></a></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><iframe/></body></foreignObject></svg>'.replace('</foreignObject>', ''),
  ]) {
    await assert.rejects(inspectImage(Buffer.from(bad), 'x.svg'), /active content|not a valid/);
  }
});

test('site icon from the logo: square PNG, the symbol of a wide logo, SVG logos too', async () => {
  const { default: sharp } = await import('sharp');
  const { siteIconFromLogo, ICON_SIZE } = await import('../src/lib/site-icon.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esg-icon-'));
  // Wide logo: a red square symbol (100 px), a gap, then the name (a dark bar), on a transparent background
  const wide = path.join(dir, 'wide.svg');
  fs.writeFileSync(wide, '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="140"><rect x="10" y="20" width="100" height="100" fill="#ff0000"/><rect x="160" y="50" width="420" height="40" fill="#222222"/></svg>');
  const icon = await siteIconFromLogo(wide, 'image/svg+xml');
  const meta = await sharp(icon).metadata();
  assert.deepEqual([meta.format, meta.width, meta.height, meta.hasAlpha], ['png', ICON_SIZE, ICON_SIZE, true]);
  const { data, info } = await sharp(icon).raw().toBuffer({ resolveWithObject: true });
  const at = (x, y) => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)];
  const center = at(256, 256);
  assert.ok(center[0] > 200 && center[1] < 60 && center[3] > 200, `the symbol fills the icon: ${center}`);
  assert.equal(at(4, 4)[3], 0, 'transparent margin');

  // Square-ish PNG logo: the whole logo, centered
  const square = path.join(dir, 'square.png');
  await sharp({ create: { width: 300, height: 260, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 1 } } }).png().toFile(square);
  const sq = await siteIconFromLogo(square, 'image/png');
  const s = await sharp(sq).raw().toBuffer({ resolveWithObject: true });
  const c = [...s.data.subarray((256 * 512 + 256) * 4, (256 * 512 + 256) * 4 + 4)];
  assert.ok(c[2] > 200 && c[3] > 200);
});

test('site icon: a logo made only of words keeps all of it', async () => {
  const { symbolColumns } = await import('../src/lib/site-icon.js');
  // 400 x 50: a first word 150 px wide, a 20 px gap, a second word (a symbol is about square, a word is not)
  const w = 400, h = 50, data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x < 150 || x >= 170) data[(y * w + x) * 4 + 3] = 255;
  assert.equal(symbolColumns(data, w, h, 4, [0, 0, 0, 0]), null);
  for (let y = 0; y < h; y++) for (let x = 50; x < 150; x++) data[(y * w + x) * 4 + 3] = 0; // now a 50 px square on the left
  assert.deepEqual(symbolColumns(data, w, h, 4, [0, 0, 0, 0]), [0, 50]);
});
