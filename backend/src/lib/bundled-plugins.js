/**
 * Premium WordPress plugins uploaded once in the app (e.g. WP Fastest Cache Premium): every
 * WordPress plugin exported afterwards carries their zips and installs + activates them on the site
 * (wp-plugin/plugin.php), after the free plugins. Shared by every user of the app.
 *
 * Stored in storage/plugins/: <name>.zip + <name>.zip.json ({ zip, file, name, version, size, uploaded_by, uploaded_at }).
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { AdmZip } from './zip.js';
import { badRequest, notFound, slugify } from './util.js';

const dir = () => config.pluginsDir;
export const ZIP_NAME = /^[a-z0-9][a-z0-9-]{0,80}\.zip$/;

/**
 * Main file of a WordPress plugin zip ("folder/file.php" with a "Plugin Name:" header) and its name.
 * @returns {{ file: string, name: string, version: string }}
 */
export function inspectPluginZip(zipPath) {
  let entries;
  try {
    entries = new AdmZip(zipPath).getEntries();
  } catch {
    throw badRequest('The file is not a valid zip.');
  }
  if (entries.length > 20000) throw badRequest('The zip has too many files.');
  for (const entry of entries) {
    const name = entry.entryName.replace(/\\/g, '/');
    if (entry.isDirectory || name.includes('..') || !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\.php$/.test(name)) continue;
    const head = entry.getData().subarray(0, 8192).toString('utf8');
    const m = head.match(/^[ \t/*#@]*Plugin Name:\s*(.+)$/im);
    if (!m) continue;
    const version = head.match(/^[ \t/*#@]*Version:\s*(.+)$/im)?.[1].trim() || '';
    return { file: name, name: m[1].trim().slice(0, 120), version: version.slice(0, 40) };
  }
  throw badRequest('This zip is not a WordPress plugin: no PHP file with a "Plugin Name:" header in its folder.');
}

/** The uploaded plugins, by name. */
export function listBundledPlugins() {
  if (!fs.existsSync(dir())) return [];
  return fs
    .readdirSync(dir())
    .filter((f) => ZIP_NAME.test(f) && fs.existsSync(path.join(dir(), `${f}.json`)))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir(), `${f}.json`), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Store an uploaded plugin zip (a new version of the same plugin replaces the old one). */
export function addBundledPlugin(tmpPath, user) {
  const info = inspectPluginZip(tmpPath);
  const folder = info.file.split('/')[0];
  for (const old of listBundledPlugins().filter((p) => p.file.split('/')[0] === folder)) removeBundledPlugin(old.zip);
  const zip = `${slugify(folder, 60) || 'plugin'}.zip`;
  fs.mkdirSync(dir(), { recursive: true });
  fs.copyFileSync(tmpPath, path.join(dir(), zip));
  const meta = { zip, file: info.file, name: info.name, version: info.version, size: fs.statSync(tmpPath).size, uploaded_by: user || null, uploaded_at: new Date().toISOString() };
  fs.writeFileSync(path.join(dir(), `${zip}.json`), JSON.stringify(meta, null, 2));
  return meta;
}

export function removeBundledPlugin(zip) {
  if (!ZIP_NAME.test(zip) || !fs.existsSync(path.join(dir(), zip))) throw notFound('Plugin');
  fs.rmSync(path.join(dir(), zip), { force: true });
  fs.rmSync(path.join(dir(), `${zip}.json`), { force: true });
}

/** Absolute path of a stored zip. */
export const bundledPluginPath = (zip) => path.join(dir(), zip);
