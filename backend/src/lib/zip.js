/** Zip helpers: exports are built with adm-zip; uploaded Template Kits are extracted safely. */
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { badRequest } from './util.js';

const MAX_ENTRIES = 5000;
const MAX_TOTAL_UNCOMPRESSED = 600 * 1024 * 1024; // 600 MB

/**
 * Resolve a zip entry name inside `destDir`, refusing anything that escapes it
 * (absolute paths, drive letters, "..", NUL bytes).
 */
export function safeJoin(destDir, entryName) {
  const normalized = String(entryName).replace(/\\/g, '/');
  if (normalized.includes('\0') || normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    throw badRequest(`Unsafe path in zip: ${entryName}`);
  }
  const target = path.resolve(destDir, normalized);
  const root = path.resolve(destDir) + path.sep;
  if (!target.startsWith(root)) throw badRequest(`Unsafe path in zip: ${entryName}`);
  return target;
}

/**
 * Extract `zipPath` into `destDir` (zip-slip and zip-bomb protection). Zips nested in the kit
 * (some kits ship the templates as an inner zip) are extracted next to them, one level deep.
 * Returns the list of extracted relative paths.
 */
export function extractZipSafely(zipPath, destDir, depth = 0) {
  let zip;
  try {
    zip = new AdmZip(zipPath);
  } catch {
    throw badRequest('The file is not a valid zip archive.');
  }
  const entries = zip.getEntries();
  if (entries.length > MAX_ENTRIES) throw badRequest(`Zip has too many entries (> ${MAX_ENTRIES}).`);
  const total = entries.reduce((sum, e) => sum + (e.header.size || 0), 0);
  if (total > MAX_TOTAL_UNCOMPRESSED) throw badRequest('Zip is too large once extracted.');

  fs.mkdirSync(destDir, { recursive: true });
  const files = [];
  for (const entry of entries) {
    const target = safeJoin(destDir, entry.entryName);
    if (entry.isDirectory) {
      fs.mkdirSync(target, { recursive: true });
      continue;
    }
    // OS junk files
    if (/(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db)/.test(entry.entryName)) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, entry.getData());
    const rel = path.relative(destDir, target).replace(/\\/g, '/');
    files.push(rel);
    if (depth === 0 && /\.zip$/i.test(rel)) {
      const inner = target.replace(/\.zip$/i, '');
      try {
        files.push(...extractZipSafely(target, inner, depth + 1).map((f) => `${path.relative(destDir, inner).replace(/\\/g, '/')}/${f}`));
      } catch {
        // not a kit zip (e.g. a bundled plugin that cannot be read): ignored
      }
    }
  }
  return files;
}

/** Recursively add a folder to an AdmZip instance under `zipPrefix`. */
export function addFolderToZip(zip, folder, zipPrefix = '') {
  for (const name of fs.readdirSync(folder)) {
    const full = path.join(folder, name);
    const rel = zipPrefix ? `${zipPrefix}/${name}` : name;
    if (fs.statSync(full).isDirectory()) addFolderToZip(zip, full, rel);
    else zip.addFile(rel, fs.readFileSync(full));
  }
}

export { AdmZip };
