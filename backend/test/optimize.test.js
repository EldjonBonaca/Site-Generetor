/**
 * Uploaded images of 1 MB or more are compressed below 1 MB with the best quality that fits.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'esg-optimize-'));
process.env.ENCRYPTION_KEY ||= 'd'.repeat(64);

const { default: sharp } = await import('sharp');
const { optimizeImage } = await import('../src/lib/optimize.js');
const { default: app } = await import('../src/app.js');

const LIMIT = 1_000_000;

/** A photo-like image: smooth color gradients with grain (noise > 0 makes it hard to compress). */
async function photo(width, height, { noise = 40, alpha = false } = {}) {
  const channels = alpha ? 4 : 3;
  const data = Buffer.alloc(width * height * channels);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) - 0.5;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      data[i] = Math.max(0, Math.min(255, (x / width) * 255 + rnd() * noise));
      data[i + 1] = Math.max(0, Math.min(255, (y / height) * 255 + rnd() * noise));
      data[i + 2] = Math.max(0, Math.min(255, 128 + Math.sin(x / 40) * 60 + rnd() * noise));
      if (alpha) data[i + 3] = x < width / 4 ? 0 : 255;
    }
  }
  return sharp(data, { raw: { width, height, channels } });
}

test('a small image is kept as it is', async () => {
  const buf = await (await photo(800, 600, { noise: 10 })).jpeg({ quality: 90 }).toBuffer();
  assert.ok(buf.length < LIMIT);
  assert.equal(await optimizeImage(buf, { mime: 'image/jpeg' }), null);
});

test('a large JPEG photo: same format and full size, high quality', async () => {
  const buf = await (await photo(4000, 3000, { noise: 12 })).jpeg({ quality: 98 }).toBuffer();
  assert.ok(buf.length >= LIMIT, `${buf.length}`);
  const t0 = Date.now();
  const out = await optimizeImage(buf, { mime: 'image/jpeg' });
  console.log(`  jpeg ${buf.length} -> ${out.buffer.length} q${out.quality} ${out.width}x${out.height} in ${Date.now() - t0}ms`);
  assert.ok(out.buffer.length < LIMIT);
  assert.equal(out.mime, 'image/jpeg');
  assert.equal((await sharp(out.buffer).metadata()).format, 'jpeg');
  assert.ok(out.quality >= 80, 'good quality');
  assert.deepEqual([out.width, out.height], [4000, 3000], 'full resolution kept when it fits at a good quality');
});

test('a grainy camera photo: reduced only as much as needed, never below 2048px while the quality is good', async () => {
  const buf = await (await photo(6000, 4000, { noise: 90 })).jpeg({ quality: 95 }).toBuffer();
  const t0 = Date.now();
  const out = await optimizeImage(buf, { mime: 'image/jpeg' });
  console.log(`grainy ${buf.length} -> ${out.buffer.length} q${out.quality} ${out.width}x${out.height} in ${Date.now() - t0}ms`);
  assert.ok(out.buffer.length < LIMIT);
  assert.ok(out.buffer.length > LIMIT * 0.6, 'uses most of the budget (best quality that fits)');
  assert.ok(Math.max(out.width, out.height) >= 2048 || out.quality < 80);
  assert.ok(Math.abs(out.height / out.width - 4000 / 6000) < 0.002, 'proportions kept');
});

test('EXIF orientation is applied (metadata not kept)', async () => {
  const buf = await (await photo(3000, 2000, { noise: 90 })).jpeg({ quality: 98 }).withMetadata({ orientation: 6 }).toBuffer();
  const out = await optimizeImage(buf, { mime: 'image/jpeg' });
  const meta = await sharp(out.buffer).metadata();
  assert.ok(meta.height > meta.width, 'rotated as displayed');
  assert.equal(meta.orientation, undefined);
});

test('PNG: lossless when it fits, else JPEG (opaque) or WebP (transparent)', async () => {
  // Uncompressed PNG of a flat graphic: fits once recompressed, stays PNG
  const flat = await sharp({ create: { width: 2500, height: 2500, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 1 } } }).png({ compressionLevel: 0 }).toBuffer();
  assert.ok(flat.length >= LIMIT);
  const png = await optimizeImage(flat, { mime: 'image/png' });
  assert.equal(png.mime, 'image/png');
  assert.equal(png.quality, null, 'without loss');
  assert.deepEqual([png.width, png.height], [2500, 2500]);

  const opaque = await (await photo(3000, 2000, { noise: 30 })).png().toBuffer();
  const jpg = await optimizeImage(opaque, { mime: 'image/png' });
  assert.equal(jpg.mime, 'image/jpeg');
  assert.equal(jpg.ext, '.jpg');
  assert.ok(jpg.buffer.length < LIMIT);

  const transparent = await (await photo(3000, 2000, { noise: 30, alpha: true })).png().toBuffer();
  const webp = await optimizeImage(transparent, { mime: 'image/png' });
  assert.equal(webp.mime, 'image/webp');
  assert.ok(webp.buffer.length < LIMIT);
  const meta = await sharp(webp.buffer).metadata();
  assert.ok(meta.hasAlpha, 'transparency kept');
  const { data } = await sharp(webp.buffer).extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  assert.equal(data[0], 0, 'the transparent part stays transparent');
});

test('WebP stays WebP, animated WebP stays animated', async () => {
  const still = await (await photo(4000, 3000, { noise: 60 })).webp({ quality: 100 }).toBuffer();
  const out = await optimizeImage(still, { mime: 'image/webp' });
  assert.equal(out.mime, 'image/webp');
  assert.ok(out.buffer.length < LIMIT);

  const frames = await (await photo(1600, 900 * 4, { noise: 60 })).raw().toBuffer();
  const anim = await sharp(frames, { raw: { width: 1600, height: 3600, channels: 3, pageHeight: 900 } }).webp({ quality: 100, loop: 0 }).toBuffer();
  assert.ok(anim.length >= LIMIT, `${anim.length}`);
  const a = await optimizeImage(anim, { mime: 'image/webp' });
  const meta = await sharp(a.buffer).metadata();
  assert.equal(meta.pages, 4, 'every frame kept');
  assert.ok(a.buffer.length < LIMIT);
  assert.equal(a.height / a.width, 900 / 1600, 'size of one frame');
});

test('SVG: minified, or rasterized when it holds a large photo', async () => {
  const shapes = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><metadata>${'x'.repeat(600_000)}</metadata>\n${'<!-- comment -->\n  <rect width="10" height="10"/>\n'.repeat(20_000)}</svg>`;
  const min = await optimizeImage(Buffer.from(shapes), { mime: 'image/svg+xml' });
  assert.equal(min.mime, 'image/svg+xml');
  assert.ok(min.buffer.length < LIMIT && /<rect/.test(min.buffer.toString()));

  const jpeg = await (await photo(3000, 2000, { noise: 90 })).jpeg({ quality: 100 }).toBuffer();
  const embedded = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="300" height="200"><image width="300" height="200" xlink:href="data:image/jpeg;base64,${jpeg.toString('base64')}"/></svg>`;
  assert.ok(embedded.length >= LIMIT);
  const raster = await optimizeImage(Buffer.from(embedded), { mime: 'image/svg+xml' });
  assert.notEqual(raster.mime, 'image/svg+xml');
  assert.ok(raster.buffer.length < LIMIT);
  assert.equal(Math.max(raster.width, raster.height), 2048);
});

// ------------------------------------------------------------------ API --

let server;
let base;
before(async () => {
  await new Promise((r) => (server = app.listen(0, '127.0.0.1', r)));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server?.close());

async function upload(url, files) {
  const fd = new FormData();
  for (const [name, buf] of files) fd.append('files', new Blob([buf]), name);
  const res = await fetch(base + url, { method: 'POST', body: fd });
  return { status: res.status, body: await res.json() };
}

test('API: project and Gallery uploads store the compressed file', async () => {
  const project = await (await fetch(`${base}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ site_name: 'Rossi' }) })).json();
  const big = await (await photo(2000, 1500, { noise: 12 })).png().toBuffer();
  assert.ok(big.length >= LIMIT && big.length < 15 * 1024 * 1024, `${big.length}: over 1 MB, under the upload limit`);
  const small = await (await photo(400, 300)).jpeg().toBuffer();
  for (const url of [`/projects/${project.id}/images`, '/library/images']) {
    const { status, body } = await upload(url, [['Foto Grande.png', big], ['small.jpg', small]]);
    assert.equal(status, 201, JSON.stringify(body));
    assert.equal(body.created.length, 2);
    const [img, kept] = body.created;
    assert.equal(img.mime, 'image/jpeg', 'opaque PNG photo -> JPEG');
    // In a project the photo is named after the client; the Gallery keeps the original name
    assert.equal(img.file_name, url.startsWith('/library') ? 'foto-grande.jpg' : 'rossi-1.jpg');
    assert.ok(img.size < LIMIT);
    assert.deepEqual(body.optimized.map((o) => [o.name, o.from, o.to]), [['Foto Grande.png', big.length, img.size]]);
    const file = await fetch(`${base}${url.startsWith('/library') ? `/library/images/${img.id}` : `/images/${img.id}`}/file`);
    const stored = Buffer.from(await file.arrayBuffer());
    assert.equal(stored.length, img.size, 'the stored file is the compressed one');
    const meta = await sharp(stored).metadata();
    assert.deepEqual([meta.width, meta.height], [img.width, img.height]);
    assert.equal(kept.size, small.length, 'small image unchanged');
  }
});
