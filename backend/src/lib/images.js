/** Export file names of the project images (shared by the exporter and the prompt variables). */
import path from 'node:path';
import { slugify } from './util.js';

/**
 * Map(imageId -> exported file name), e.g. "plumber-london-boiler-repair.webp".
 * Raster images become .webp when the WEBP option is on; SVGs keep their extension.
 */
export function exportNames(images, imageSettings) {
  const used = new Set();
  const names = new Map();
  for (const img of images) {
    const isSvg = img.mime === 'image/svg+xml';
    const parsed = path.parse(img.file_name || img.original_name || `image-${img.id}`);
    let ext = (parsed.ext || path.extname(img.file_path)).toLowerCase();
    if (!isSvg && imageSettings.convertWebp) ext = '.webp';
    const base = slugify(parsed.name) || `image-${img.id}`;
    let name = `${base}${ext}`;
    for (let n = 2; used.has(name); n++) name = `${base}-${n}${ext}`;
    used.add(name);
    names.set(img.id, name);
  }
  return names;
}

/**
 * Photos of the site: every uploaded image except the logo. The Gallery page shows all of them,
 * and they also fill the free image slots of every other page.
 */
export function galleryPool(images) {
  return images.filter((i) => i.role !== 'logo');
}
