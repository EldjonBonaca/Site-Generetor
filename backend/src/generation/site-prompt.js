/**
 * The prompt of the system: one built-in prompt (db/prompts/sito-completo-it.md) for the whole
 * site (Home, Chi Siamo, Servizi, Galleria, Contatti, header, footer and the service articles).
 * It cannot be uploaded, edited or chosen; the generator appends the technical instructions
 * (JSON answer, site language, fields to fill) to it for every page.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'prompts', 'sito-completo-it.md');

export const SITE_PROMPT = Object.freeze({
  name: 'Sito completo Elementor (IT)',
  content: fs.readFileSync(FILE, 'utf8'),
});
