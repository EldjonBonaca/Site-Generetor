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
addColumn('kit_mappings', 'options_json', "TEXT NOT NULL DEFAULT '{}'");
addColumn('images', 'library_image_id', 'INTEGER'); // Gallery image it was copied from

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

