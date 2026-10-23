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
 * Names of the images added to a project (uploaded, or picked from the Gallery library), after the
 * client: "edil-rossi-roma-1.jpg", "edil-rossi-roma-2.webp"… (site name + city), continuing the
 * numbers already used in the project. Without a site name yet, the original name is kept.
 * @param {object} project  { site_name, city }
 * @param {string[]} existing  file names already in the project
 * @returns {(ext: string, fallback: string) => string}
 */
export function clientNamer(project, existing) {
  const base = slugify([project.site_name, project.city].filter((s) => s && s.trim()).join(' '), 60);
  const used = new Set(existing.map((n) => path.parse(n || '').name));
  let n = 0;
  return (ext, fallback) => {
    if (!base) return `${fallback || 'image'}${ext}`;
    let name;
    do name = `${base}-${++n}`;
    while (used.has(name));
    used.add(name);
    return `${name}${ext}`;
  };
}

/**
 * Photos of the site: every uploaded image except the logo. The Gallery page shows all of them,
 * and they also fill the free image slots of every other page.
 */
export function galleryPool(images) {
  return images.filter((i) => i.role !== 'logo');
}
