/**
 * The demo images of a Template Kit, measured once. Template Kits link their images on the demo site
 * (they are not in the zip): each one is downloaded into the kit folder (demo-images/) and its size
 * and transparency are saved in demo-images.json, so the site built from the kit can
 *  - keep the graphics of the design (transparent PNG / SVG ornaments, shapes, icons, client logos):
 *    they are bundled with the site like the project images;
 *  - crop every project photo to the proportions of the demo photo it replaces.
 * Images that cannot be downloaded (offline, demo site gone) are classified by heuristics (kits/site.js).
 */
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { analyzeDocument, getAtPath } from '../elementor/analyze.js';
import { loadKitTemplate } from './read.js';

const MAX_BYTES = 15 * 1024 * 1024;
const TIMEOUT_MS = 15000;
const CONCURRENCY = 4;
const RETRY_AFTER_MS = 6 * 60 * 60 * 1000; // a failed download is tried again after 6 hours

const metaFile = (kitDir) => path.join(path.dirname(kitDir), 'demo-images.json');
const imagesDir = (kitDir) => path.join(path.dirname(kitDir), 'demo-images');

/** url -> { file, width, height, opaque, format } | { error, at } (null when the kit was never measured). */
export function loadDemoImages(kitDir) {
  try {
    return JSON.parse(fs.readFileSync(metaFile(kitDir), 'utf8'));
  } catch {
    return null;
  }
}

/** Absolute path of a downloaded demo image (null when it is not available). */
export function demoImagePath(kitDir, entry) {
  if (!entry?.file || !/^[a-f0-9]+\.[a-z]+$/.test(entry.file)) return null;
  const file = path.join(imagesDir(kitDir), entry.file);
  return fs.existsSync(file) ? file : null;
}

/** Only public http(s) hosts: the URLs come from an uploaded zip. */
function isPublicUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (!/^https?:$/.test(u.protocol)) return false;
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  // Local names and the reserved example / test domains (RFC 2606)
  if (host === 'localhost' || /\.(local|localhost|internal|invalid|test|example)$/.test(host) || /(^|\.)example\.(com|net|org)$/.test(host)) return false;
  if (net.isIP(host)) {
    return !/^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|::$|f[cd]|fe80:)/.test(host);
  }
  return true;
}

/** Every image URL of the templates of the kit (image slots and galleries). */
function kitImageUrls(kit) {
  const urls = new Set();
  for (const t of kit.info.templates.filter((x) => x.valid)) {
    const doc = loadKitTemplate(kit.dir, t.id);
    if (!doc) continue;
    for (const slot of analyzeDocument(doc).slots) {
      if (slot.kind === 'gallery') (getAtPath(doc, slot.path) || []).forEach((it) => it?.url && urls.add(it.url));
      else urls.add(slot.url);
    }
  }
  return [...urls].filter(isPublicUrl);
}

async function download(url, kitDir) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'user-agent': 'Mozilla/5.0 (Elementor Site Generator)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (Number(res.headers.get('content-length')) > MAX_BYTES) throw new Error('too large');
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_BYTES) throw new Error('too large');
  const image = sharp(buffer, { failOn: 'none' });
  const meta = await image.metadata();
  if (!meta.width || !meta.height) throw new Error('not an image');
  const format = meta.format === 'jpeg' ? 'jpg' : meta.format;
  if (!/^(jpg|png|webp|gif|svg|avif)$/.test(format)) throw new Error(`unsupported format ${format}`);
  // Transparent pixels (not only an alpha channel) make it a graphic of the design
  const opaque = format === 'svg' ? false : !meta.hasAlpha || (await image.stats()).isOpaque;
  const rotated = (meta.orientation || 1) >= 5;
  const file = `${crypto.createHash('md5').update(url).digest('hex').slice(0, 16)}.${format}`;
  fs.mkdirSync(imagesDir(kitDir), { recursive: true });
  fs.writeFileSync(path.join(imagesDir(kitDir), file), buffer);
  return { file, width: rotated ? meta.height : meta.width, height: rotated ? meta.width : meta.height, opaque, format };
}

const running = new Map();

/**
 * Download and measure the demo images of a kit that are not measured yet (failed ones are tried
 * again after a while). Never throws: an image that cannot be read is saved as { error }.
 * @param {{ dir, info }} kit
 */
export function measureDemoImages(kit) {
  if (running.has(kit.dir)) return running.get(kit.dir);
  const job = (async () => {
    const known = loadDemoImages(kit.dir) || {};
    const todo = kitImageUrls(kit).filter((u) => !known[u] || (known[u].error && Date.now() - (known[u].at || 0) > RETRY_AFTER_MS));
    let next = 0;
    const worker = async () => {
      while (next < todo.length) {
        const url = todo[next++];
        try {
          known[url] = await download(url, kit.dir);
        } catch (err) {
          known[url] = { error: String(err?.message || err).slice(0, 200), at: Date.now() };
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
    if (todo.length || !fs.existsSync(metaFile(kit.dir))) fs.writeFileSync(metaFile(kit.dir), JSON.stringify(known, null, 1));
    return known;
  })()
    .catch(() => loadDemoImages(kit.dir) || {})
    .finally(() => running.delete(kit.dir));
  running.set(kit.dir, job);
  return job;
}
