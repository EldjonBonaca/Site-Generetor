/** Zip helpers (exports are built with adm-zip). */
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';

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
