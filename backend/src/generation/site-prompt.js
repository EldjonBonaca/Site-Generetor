/**
 * The built-in prompts of the system (read-only: they cannot be uploaded, edited or chosen).
 *  - SITE_PROMPT (db/prompts/sito-completo-it.md): the whole site (Home, Chi Siamo, Servizi, Galleria,
 *    Contatti, header, footer and the service articles). The generator appends the technical
 *    instructions (JSON answer, site language, fields to fill) to it for every page.
 *  - TEMPLATE_PROMPT (db/prompts/template-categoria-it.md): the design of a reusable template for a
 *    category (colors, fonts, layout variants, icons, tone, sample texts).
 *  - INDUSTRY_PROMPT (db/prompts/analisi-categoria-it.md): the industry analysis of a category, done
 *    once before its templates are designed (business, customers, design conventions, sections).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'prompts');

export const SITE_PROMPT = Object.freeze({
  name: 'Sito completo Elementor (IT)',
  content: fs.readFileSync(path.join(DIR, 'sito-completo-it.md'), 'utf8'),
});

export const TEMPLATE_PROMPT = Object.freeze({
  name: 'Template per categoria (IT)',
  content: fs.readFileSync(path.join(DIR, 'template-categoria-it.md'), 'utf8'),
});

export const INDUSTRY_PROMPT = Object.freeze({
  name: 'Analisi del settore (IT)',
  content: fs.readFileSync(path.join(DIR, 'analisi-categoria-it.md'), 'utf8'),
});
