import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'esg-unit-'));
process.env.ENCRYPTION_KEY ||= 'a'.repeat(64);

const { safeJoin } = await import('../src/lib/zip.js');
const { extractJson, validateValues } = await import('../src/ai/json.js');
const { analyzeDocument, defaultSlotRoles } = await import('../src/elementor/analyze.js');
const { applyFieldValues, applyImages, replaceContacts, sanitizeHtml } = await import('../src/elementor/apply.js');
const { encrypt, decrypt, maskKey } = await import('../src/lib/crypto.js');
const { renderTemplate } = await import('../src/generation/prompt-builder.js');

test('safeJoin blocks zip-slip paths', () => {
  const dest = path.join(os.tmpdir(), 'x');
  assert.ok(safeJoin(dest, 'templates/home.json').startsWith(dest));
  for (const evil of ['../evil.txt', 'a/../../evil', '/etc/passwd', 'C:\\Windows\\x', '..\\evil']) {
    assert.throws(() => safeJoin(dest, evil), /Unsafe path/, evil);
  }
});

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
  const roles = defaultSlotRoles(a.slots, 'home');
  assert.equal(roles[a.slots[0].id], 'hero');
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
