/**
 * Elementor kit reading.
 *
 * Two zip layouts are supported:
 *  1. "template-kit" (Envato Template Kit / Elementor Template Kit)
 *       manifest.json -> { title, templates: [ { name, source: "templates/home.json", type, screenshot, metadata } ] }
 *  2. "website-kit" (Elementor > Tools > Export Kit)
 *       manifest.json -> { title, templates: { "<id>": { title, doc_type, location } },
 *                          content: { page: { "<id>": { title, doc_type, show_on_front } }, ... } }
 *       files: templates/<id>.json, content/<post_type>/<id>.json
 * Anything else falls back to "loose": every JSON file with an Elementor `content` array.
 */
import fs from 'node:fs';
import path from 'node:path';
import { analyzeDocument } from './analyze.js';

const rel = (from, to) => path.relative(from, to).replace(/\\/g, '/');

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  } catch {
    return null;
  }
}

function listFiles(dir, base = dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) out.push(...listFiles(full, base));
    else out.push(rel(base, full));
  }
  return out;
}

/** Find the shallowest manifest.json (kits are sometimes zipped inside a folder). */
function findManifest(dir) {
  const candidates = listFiles(dir)
    .filter((f) => /(^|\/)manifest\.json$/i.test(f))
    .sort((a, b) => a.split('/').length - b.split('/').length);
  return candidates[0] || null;
}

export function detectFormat(manifest) {
  if (!manifest) return 'loose';
  if (Array.isArray(manifest.templates)) return 'template-kit';
  if ((manifest.templates && typeof manifest.templates === 'object') || manifest.content) return 'website-kit';
  return 'loose';
}

/** Guess which site role a template plays from its title/type. The user can change it. */
export function guessRole(t) {
  const s = `${t.title} ${t.type} ${t.id}`.toLowerCase();
  if (/global|kit[\s_-]?settings|site[\s_-]?settings|style ?guide|global-styles/.test(s)) return 'ignore';
  if (/header/.test(s)) return 'header';
  if (/footer/.test(s)) return 'footer';
  if (/single[\s_-]?(post|blog|article)|post[\s_-]?(single|template)|articolo/.test(s)) return 'single_post';
  if (/popup|404|archive|blog|\bpost\b|search|product|shop|cart|checkout/.test(s)) return 'ignore';
  if (t.showOnFront || /\bhome|front[\s_-]?page|landing/.test(s)) return 'home';
  if (/galler|portfolio/.test(s)) return 'gallery';
  if (/services|servizi\b/.test(s)) return 'services';
  if (/service|servizio/.test(s)) return 'ignore'; // services are articles: no page per service
  if (/about|chi[\s_-]?siamo/.test(s)) return 'about';
  if (/contact|contatt/.test(s)) return 'contact';
  return 'ignore'; // only Home, About, Services, Gallery and Contact are generated
}

/** Ensure the guess yields at most one template per role. */
function dedupeGuesses(templates) {
  const seen = new Set();
  for (const t of templates) {
    if (t.suggestedRole === 'ignore') continue;
    if (seen.has(t.suggestedRole)) t.suggestedRole = 'ignore';
    else seen.add(t.suggestedRole);
  }
}

/**
 * Read a kit folder. Returns { format, rootDir, manifest, templates, contacts }.
 * template = { id (path relative to extracted dir), title, type, screenshot, fieldCount,
 *              slotCount, widgets, suggestedRole, source: {...format specific} }
 */
export function readKit(extractedDir) {
  const manifestRel = findManifest(extractedDir);
  const rootDir = manifestRel ? path.join(extractedDir, path.dirname(manifestRel)) : extractedDir;
  const manifest = manifestRel ? readJson(path.join(extractedDir, manifestRel)) : null;
  const format = detectFormat(manifest);
  const entries = [];

  const pushEntry = (file, info) => {
    if (!fs.existsSync(file)) return;
    entries.push({ file, ...info });
  };

  if (format === 'template-kit') {
    manifest.templates.forEach((t, index) => {
      if (!t?.source) return;
      pushEntry(path.join(rootDir, t.source), {
        title: t.name || t.title || path.basename(t.source, '.json'),
        type: t.metadata?.template_type || t.type || 'page',
        screenshot: t.screenshot ? path.join(rootDir, t.screenshot) : null,
        source: { kind: 'template-kit', index },
      });
    });
  } else if (format === 'website-kit') {
    for (const [id, t] of Object.entries(manifest.templates || {})) {
      pushEntry(path.join(rootDir, 'templates', `${id}.json`), {
        title: t.title || `Template ${id}`,
        type: t.doc_type || 'section',
        screenshot: null,
        source: { kind: 'website-kit', group: 'templates', id },
      });
    }
    for (const [postType, items] of Object.entries(manifest.content || {})) {
      for (const [id, c] of Object.entries(items || {})) {
        pushEntry(path.join(rootDir, 'content', postType, `${id}.json`), {
          title: c.title || `${postType} ${id}`,
          type: c.doc_type || postType,
          showOnFront: Boolean(c.show_on_front),
          screenshot: null,
          source: { kind: 'website-kit', group: 'content', postType, id },
        });
      }
    }
  }

  if (!entries.length) {
    // Loose mode: any JSON with an Elementor content array
    for (const f of listFiles(rootDir).filter((f) => f.toLowerCase().endsWith('.json'))) {
      const full = path.join(rootDir, f);
      const doc = readJson(full);
      if (doc && (Array.isArray(doc.content) || (Array.isArray(doc) && doc[0]?.elType))) {
        pushEntry(full, {
          title: doc.title || path.basename(f, '.json'),
          type: doc.type || 'page',
          screenshot: null,
          source: { kind: 'loose' },
        });
      }
    }
  }

  const emails = new Set();
  const phones = new Set();
  const templates = entries.map((e) => {
    const doc = readJson(e.file);
    const analysis = doc ? analyzeDocument(doc, { prefix: 'x' }) : { fields: [], slots: [], widgets: {}, contacts: { emails: [], phones: [] } };
    analysis.contacts.emails.forEach((x) => emails.add(x));
    analysis.contacts.phones.forEach((x) => phones.add(x));
    const t = {
      id: rel(extractedDir, e.file),
      title: e.title,
      type: e.type,
      showOnFront: e.showOnFront || false,
      screenshot: e.screenshot && fs.existsSync(e.screenshot) ? rel(extractedDir, e.screenshot) : null,
      valid: Boolean(doc),
      fieldCount: analysis.fields.length,
      slotCount: analysis.slots.length,
      widgets: analysis.widgets,
      source: e.source,
    };
    t.suggestedRole = t.valid ? guessRole(t) : 'ignore';
    return t;
  });
  dedupeGuesses(templates);

  return {
    format: entries[0]?.source.kind === 'loose' ? 'loose' : format,
    rootDir: rel(extractedDir, rootDir) || '.',
    title: manifest?.title || manifest?.name || null,
    manifest: manifest || {},
    templates,
    contacts: { emails: [...emails], phones: [...phones] },
  };
}

/** Load one template document from an extracted kit (path validated by caller). */
export function loadTemplate(extractedDir, templateId) {
  const file = path.resolve(extractedDir, templateId);
  if (!file.startsWith(path.resolve(extractedDir) + path.sep)) throw new Error('Invalid template path');
  return readJson(file);
}
