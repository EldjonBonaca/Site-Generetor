/**
 * Uploaded images of `config.optimizeImageBytes` (1 MB) or more are compressed so the stored file
 * is smaller than that, with the best quality that fits:
 *  1. same format and full resolution, at the highest quality between GOOD_Q and MAX_Q that fits;
 *  2. if even GOOD_Q does not fit: smaller, down to MIN_EDGE px on the long side (still sharp for a
 *     1920px hero), each size estimated from the previous file size;
 *  3. at that size, a lower quality (down to MIN_Q);
 *  4. last resort: smaller again at MIN_Q until it fits.
 * PNG is first recompressed without loss; when that is not enough it becomes JPEG, or WebP when it
 * has transparency (JPEG has none). Animated WebP stays animated. An SVG is minified (comments,
 * metadata, line breaks between tags); when it is still too large (embedded photos) it is
 * rasterized at MIN_EDGE px and compressed like a PNG.
 * The EXIF orientation is applied; metadata (EXIF, GPS) is not kept, colors are converted to sRGB.
 */
import sharp from 'sharp';
import { config } from '../config.js';

const MAX_Q = 92;
const GOOD_Q = 80;
const MIN_Q = 45;
const MIN_EDGE = 2048;
const FORMATS = {
  jpeg: { mime: 'image/jpeg', ext: '.jpg' },
  webp: { mime: 'image/webp', ext: '.webp' },
  png: { mime: 'image/png', ext: '.png' },
};

/**
 * @param {Buffer} buffer  uploaded file
 * @param {{ mime: string }} info  result of inspectImage (lib/upload.js)
 * @returns {Promise<null | { buffer, mime, ext, width, height, quality, resized }>} null = kept as it is
 */
export async function optimizeImage(buffer, info, { limit = config.optimizeImageBytes } = {}) {
  if (!limit || buffer.length < limit) return null;
  if (info.mime === 'image/svg+xml') return optimizeSvg(buffer, limit);
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(info.mime)) return null;
  const meta = await sharp(buffer).metadata();
  const animated = (meta.pages || 1) > 1 && meta.format === 'webp';
  // Decoded once (EXIF orientation applied, as the metadata is not kept; sRGB, 8 bits), then encoded
  // many times. An animated WebP is decoded by each encoding (frames).
  const source = animated ? null : await sharp(buffer).rotate().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  const input = () => (animated ? sharp(buffer, { animated: true }) : sharp(source.data, { raw: { width: source.info.width, height: source.info.height, channels: source.info.channels } }));
  // Long side of the image (of one frame when animated)
  const fullEdge = animated ? Math.max(meta.width, meta.pageHeight || meta.height) : Math.max(source.info.width, source.info.height);
  const fits = (out) => out.data.length < limit;

  // The search uses the fast encoders (libjpeg-turbo, WebP effort 0); the stored file is encoded
  // once with the efficient ones (mozjpeg, WebP effort 4: smaller at the same quality, much slower)
  const encode = (format, edge, quality, final = false) => {
    let p = input();
    if (edge < fullEdge) p = p.resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true });
    if (format === 'jpeg') p = p.flatten({ background: '#ffffff' }).jpeg(final ? { quality, mozjpeg: true } : { quality });
    else if (format === 'webp') p = p.webp({ quality, alphaQuality: 100, smartSubsample: true, effort: final ? 4 : 0 });
    else if (format === 'png-max') p = p.png({ compressionLevel: 9, adaptiveFiltering: true });
    else p = p.png({ compressionLevel: 6 });
    return p.toBuffer({ resolveWithObject: true }).then((out) => ({ ...out, quality, edge }));
  };

  // Highest quality in [lo, hi] that fits at this size: { fit } or { smallest } (the file at `lo`).
  // The lowest quality first (if it does not fit, nothing does), then in parallel 3 more across
  // the range, then the ones between the best that fits and the next one.
  const spread = (lo, hi, n) => [...new Set(Array.from({ length: n }, (_, i) => Math.round(lo + ((hi - lo) * i) / Math.max(1, n - 1))))];
  const bestQuality = async (format, edge, lo, hi) => {
    const low = await encode(format, edge, lo);
    if (!fits(low)) return { smallest: low };
    const first = [low, ...(await Promise.all(spread(lo, hi, 4).slice(1).map((q) => encode(format, edge, q))))];
    let best = first.filter(fits).at(-1);
    const above = first.find((o) => o.quality > best.quality);
    if (above && above.quality - best.quality > 1) {
      const between = spread(best.quality + 1, above.quality - 1, Math.min(3, above.quality - best.quality - 1));
      const second = await Promise.all(between.map((q) => encode(format, edge, q)));
      best = second.filter(fits).at(-1) || best;
    }
    return { fit: best };
  };
  // Next size: the file size is about proportional to the number of pixels
  const smaller = (edge, bytes, margin) => Math.max(1, Math.floor(edge * Math.sqrt(limit / bytes) * margin));

  // The stored file: the efficient encoder at the quality found or higher (its files are smaller, so
  // part of the budget is free again); at the top quality, a larger size when there is still room
  const result = async (format, found) => {
    let out = found;
    if (found.quality != null) {
      // mozjpeg saves much more than WebP effort 4 does over effort 0
      const steps = format === 'jpeg' ? [0, 2, 4, 6] : [0, 2];
      const qualities = [...new Set(steps.map((d) => Math.min(MAX_Q, found.quality + d)))].reverse();
      const finals = await Promise.all(qualities.map((q) => encode(format, found.edge, q, true)));
      out = finals.find(fits) || found;
      if (out !== found && out.quality === MAX_Q && out.edge < fullEdge && out.data.length < limit * 0.9) {
        const edge = Math.min(fullEdge, Math.floor(out.edge * Math.sqrt((limit * 0.97) / out.data.length)));
        const larger = await encode(format, edge, MAX_Q, true);
        if (fits(larger)) out = larger;
      }
    }
    const m = await sharp(out.data).metadata();
    return {
      buffer: out.data,
      ...FORMATS[format],
      width: m.width,
      height: animated ? m.pageHeight || m.height : m.height,
      quality: out.quality, // null: PNG recompressed without loss
      resized: out.edge < fullEdge,
    };
  };

  let format = meta.format === 'jpeg' ? 'jpeg' : 'webp';
  if (meta.format === 'png') {
    // A PNG (logo, graphic) often fits once recompressed without loss; the slow maximum
    // compression is only tried when the quick one is close to the limit
    let lossless = await encode('png', fullEdge, null);
    if (!fits(lossless) && lossless.data.length < limit * 1.3) lossless = await encode('png-max', fullEdge, null);
    if (fits(lossless)) return result('png', lossless);
    const transparent = meta.hasAlpha && !(await sharp(buffer).stats()).isOpaque;
    format = transparent ? 'webp' : 'jpeg';
  }

  // 1–2. Good quality, the largest size that fits
  const floor = Math.min(fullEdge, MIN_EDGE);
  let edge = fullEdge;
  for (let step = 0; step < 6; step++) {
    const r = await bestQuality(format, edge, GOOD_Q, MAX_Q);
    if (r.fit) return result(format, r.fit);
    if (edge <= floor) break;
    edge = Math.max(floor, smaller(edge, r.smallest.data.length, 0.97));
  }
  // 3. At the smallest good size, a lower quality
  const r = await bestQuality(format, edge, MIN_Q, GOOD_Q - 1);
  if (r.fit) return result(format, r.fit);
  // 4. Smaller again at the lowest quality (always ends under the limit)
  let out = r.smallest;
  for (let step = 0; step < 12 && !fits(out) && edge > 16; step++) {
    edge = Math.min(edge - 1, smaller(edge, out.data.length, 0.9));
    out = await encode(format, edge, MIN_Q);
  }
  return result(format, out);
}

/** SVG: minified, else rasterized and compressed as a PNG (keeps the transparency). */
async function optimizeSvg(buffer, limit) {
  const text = buffer
    .toString('utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<metadata[\s\S]*?<\/metadata>/gi, '')
    .replace(/>\s*\n\s*</g, '><')
    .trim();
  const minified = Buffer.from(text, 'utf8');
  if (minified.length < limit) return { buffer: minified, mime: 'image/svg+xml', ext: '.svg', width: null, height: null, quality: null, resized: false };
  const meta = await sharp(minified).metadata(); // size at 72 dpi
  const density = Math.min(2400, Math.max(1, (72 * MIN_EDGE) / Math.max(meta.width || MIN_EDGE, meta.height || MIN_EDGE)));
  const png = await sharp(minified, { density }).png().toBuffer();
  const optimized = await optimizeImage(png, { mime: 'image/png' }, { limit });
  if (optimized) return optimized;
  const { width, height } = await sharp(png).metadata(); // the raster is already small enough
  return { buffer: png, ...FORMATS.png, width, height, quality: null, resized: false };
}
