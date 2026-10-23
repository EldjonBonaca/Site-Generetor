/**
 * SQLite access via Node's built-in `node:sqlite` (no native build step needed).
 * Exposes tiny helpers (all/get/run/tx) so routes stay readable.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

/** Lightweight migrations: add columns introduced after the first release. */
function addColumn(table, column, definition) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
addColumn('projects', 'copyright', "TEXT NOT NULL DEFAULT ''");
addColumn('projects', 'template_id', 'INTEGER REFERENCES site_templates(id) ON DELETE SET NULL'); // replaces kit_id
addColumn('images', 'library_image_id', 'INTEGER'); // Gallery image it was copied from
addColumn('template_categories', 'profile_json', 'TEXT'); // industry analysis of the category
// Users (lib/owner.js): owner = username (NULL = everyone), templates can be shared with everyone
addColumn('ai_providers', 'owner', 'TEXT');
addColumn('site_templates', 'owner', 'TEXT');
addColumn('site_templates', 'shared', 'INTEGER NOT NULL DEFAULT 0');
// Template Kit used by the project instead of a category template (kits/site.js)
addColumn('projects', 'template_kit_id', 'INTEGER REFERENCES template_kits(id) ON DELETE SET NULL');
// Second phone number and Google Business Profile link of the site (lib/maps.js)
addColumn('projects', 'phone2', "TEXT NOT NULL DEFAULT ''");
addColumn('projects', 'google_business_url', "TEXT NOT NULL DEFAULT ''");
addColumn('projects', 'map_resolved_url', "TEXT NOT NULL DEFAULT ''");
// WhatsApp button (Joinchat plugin installed by the WordPress plugin): '1' = on, and its number
addColumn('projects', 'whatsapp_enabled', "TEXT NOT NULL DEFAULT ''");
addColumn('projects', 'whatsapp_number', "TEXT NOT NULL DEFAULT ''");
// P.IVA of the business: in the default copyright line of the footer
addColumn('projects', 'vat_number', "TEXT NOT NULL DEFAULT ''");
// Social networks of the site, all optional (lib/socials.js)
for (const col of ['facebook_url', 'instagram_url', 'linkedin_url', 'youtube_url', 'tiktok_url', 'x_url']) addColumn('projects', col, "TEXT NOT NULL DEFAULT ''");
// Databases created before templates replaced the Template Kits keep the old `kits` / `kit_mappings`
// tables and `projects.kit_id` (SQLite cannot drop a foreign-key column): they are no longer used.

/** Strip the null prototype node:sqlite uses so objects serialize/spread normally. */
const plain = (row) => (row ? { ...row } : row);

export const all = (sql, ...params) => db.prepare(sql).all(...params).map(plain);
export const get = (sql, ...params) => plain(db.prepare(sql).get(...params));
export const run = (sql, ...params) => db.prepare(sql).run(...params);

/** Run `fn` inside a transaction (rolled back if it throws). */
export function tx(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** Parse a JSON column, falling back to `fallback` on null/invalid content. */
export function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

