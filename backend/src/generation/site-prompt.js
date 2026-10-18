/**
 * The built-in prompts of the system (read-only: they cannot be uploaded, edited or chosen).
 *  - SITE_PROMPT (db/prompts/sito-completo-it.md): the whole site (Home, Chi Siamo, Servizi, Galleria,
 *    Contatti, header, footer and the service articles). The generator appends the technical
 *    instructions (JSON answer, site language, fields to fill) to it for every page.
 *  - KIT_SITE_PROMPT (db/prompts/sito-template-kit-it.md): the same for a site built from a Template
 *    Kit: the kit keeps its design and structure, every demo text is rewritten for the business.
 *  - TEMPLATE_PROMPT (db/prompts/template-categoria-it.md): the design of a reusable template for a
 *    category (colors, fonts, layout variants, icons, tone, sample texts).
 *  - INDUSTRY_PROMPT (db/prompts/analisi-categoria-it.md): the industry analysis of a category, done
 *    once before its templates are designed (business, customers, design conventions, sections).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'prompts');
// LF line endings, also when git checked the files out with CRLF (Windows)
const read = (file) => fs.readFileSync(path.join(DIR, file), 'utf8').replace(/\r\n/g, '\n');

export const SITE_PROMPT = Object.freeze({
  name: 'Sito completo Elementor (IT)',
  content: read('sito-completo-it.md'),
});

export const KIT_SITE_PROMPT = Object.freeze({
  name: 'Sito da Template Kit Elementor (IT)',
  content: read('sito-template-kit-it.md'),
});

/** The site prompt of a project: the Template Kit one when the site is built from a kit. */
export const sitePromptFor = (ctx) => (ctx?.kit ? KIT_SITE_PROMPT : SITE_PROMPT);

export const TEMPLATE_PROMPT = Object.freeze({
  name: 'Template per categoria (IT)',
  content: read('template-categoria-it.md'),
});

export const INDUSTRY_PROMPT = Object.freeze({
  name: 'Analisi del settore (IT)',
  content: read('analisi-categoria-it.md'),
});
