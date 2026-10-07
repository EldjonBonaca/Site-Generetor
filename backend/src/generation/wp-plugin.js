/**
 * WordPress plugin that builds the whole site when activated (see wp-plugin/plugin.php):
 *   <slug>/<slug>.php          plugin code (generic; only header + namespace are filled in)
 *   <slug>/data/site.json      pages, articles, images, menu, templates, kit styles, admin texts
 *   <slug>/data/elementor/*.json  Elementor documents (images referenced as esg-image://<file>)
 *   <slug>/images/*            the optimized images, imported into the Media Library
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { AdmZip } from '../lib/zip.js';
import { slugify } from '../lib/util.js';

export const PLUGIN_IMAGE_SCHEME = 'esg-image://';
const PHP_TEMPLATE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'wp-plugin', 'plugin.php');

const MIME = { '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.avif': 'image/avif' };

const UI = {
  it: (name) => ({
    menuTitle: `Sito ${name}`,
    heading: `Crea il sito "${name}"`,
    intro: 'Questo plugin crea tutto il sito in WordPress: le immagini nella Libreria Media, le 5 pagine realizzate con Elementor, un articolo per ogni servizio, il menu, header e footer.',
    open: 'Crea il sito',
    pages: 'Pagine',
    posts: 'Articoli dei servizi (categoria "{category}")',
    images: 'Immagini',
    imagesCount: '{total} immagini, la Galleria le mostra tutte ({photos} foto)',
    templates: 'Template Elementor',
    run: 'Crea il sito',
    rerun: 'Aggiorna il sito',
    rerunNote: 'Eseguendolo di nuovo, le pagine e gli articoli creati dal plugin vengono aggiornati: le modifiche fatte in WordPress vengono sovrascritte.',
    lastRun: 'Ultima esecuzione: {date}.',
    running: 'Creazione in corso… non chiudere questa pagina.',
    setup: 'Installazione del tema e dei plugin necessari…',
    importingImages: 'Caricamento immagini {done}/{total}…',
    creatingContent: 'Creazione di pagine, articoli, menu e template…',
    stuck: 'Il caricamento delle immagini non procede.',
    done: 'Fatto! Il sito è stato creato.',
    failed: 'Errore: {message}',
    summary: '{pages} pagine, {posts} articoli, {images} immagini.',
    viewSite: 'Visita il sito',
    edit: 'modifica',
    noTemplate: 'Pagina "{title}": nessun template Elementor, la pagina è stata creata senza layout.',
    noPro: 'Header e footer non visibili: Elementor Pro non è attivo e Ultimate Addons for Elementor non è stato installato. Installalo da Plugin → Aggiungi nuovo e clicca "Aggiorna il sito".',
    uaeNotice: 'Elementor Pro non è necessario: header e footer vengono mostrati su tutto il sito con il plugin gratuito Ultimate Addons for Elementor, che viene installato automaticamente.',
    uaeReady: 'Header e footer pubblicati su tutto il sito con Ultimate Addons for Elementor.',
    pluginReady: 'Plugin "{name}" installato e attivato.',
    installFailed: 'Impossibile installare o attivare "{name}" ({error}). Installalo a mano da Plugin → Aggiungi nuovo, poi clicca "Aggiorna il sito".',
    themeSwitched: 'Tema "Hello Elementor" attivato: il tema a blocchi precedente non mostra header e footer di Elementor.',
    conditions: 'Condizioni di visualizzazione di header/footer non aggiornate: aprile in Template → Theme Builder e ripubblicale.',
    noCf7: 'Contact Form 7 non è attivo: il modulo di contatto non è stato creato.',
    cf7Created: 'Modulo di contatto "{title}" creato in Contact Form 7.',
    permalinks: 'Permalink impostati su "Nome articolo".',
    globalStyles: 'Colori e font del Template Kit applicati al kit Elementor del sito.',
  }),
  en: (name) => ({
    menuTitle: `Site ${name}`,
    heading: `Create the website "${name}"`,
    intro: 'This plugin creates the whole website in WordPress: the images in the Media Library, the 5 pages built with Elementor, one article per service, the menu, header and footer.',
    open: 'Create the website',
    pages: 'Pages',
    posts: 'Service articles (category "{category}")',
    images: 'Images',
    imagesCount: '{total} images, the Gallery shows all of them ({photos} photos)',
    templates: 'Elementor templates',
    run: 'Create the website',
    rerun: 'Update the website',
    rerunNote: 'Running it again updates the pages and articles created by this plugin: changes made to them in WordPress are overwritten.',
    lastRun: 'Last run: {date}.',
    running: 'Working… do not close this page.',
    setup: 'Installing the required theme and plugins…',
    importingImages: 'Uploading images {done}/{total}…',
    creatingContent: 'Creating pages, articles, menu and templates…',
    stuck: 'The image upload is not progressing.',
    done: 'Done! The website has been created.',
    failed: 'Error: {message}',
    summary: '{pages} pages, {posts} articles, {images} images.',
    viewSite: 'View the website',
    edit: 'edit',
    noTemplate: 'Page "{title}": no Elementor template, the page was created without a layout.',
    noPro: 'Header and footer are not displayed: Elementor Pro is not active and Ultimate Addons for Elementor could not be installed. Install it from Plugins → Add New Plugin, then click "Update the website".',
    uaeNotice: 'Elementor Pro is not needed: the header and footer are shown on the whole site by the free Ultimate Addons for Elementor plugin, which is installed automatically.',
    uaeReady: 'Header and footer published on the whole site with Ultimate Addons for Elementor.',
    pluginReady: 'Plugin "{name}" installed and activated.',
    installFailed: 'Could not install or activate "{name}" ({error}). Install it from Plugins → Add New Plugin, then click "Update the website".',
    themeSwitched: 'Theme "Hello Elementor" activated: the previous block theme does not show Elementor headers and footers.',
    conditions: 'Display conditions of header/footer could not be refreshed: open them in Templates → Theme Builder and publish them again.',
    noCf7: 'Contact Form 7 is not active: the contact form was not created.',
    cf7Created: 'Contact form "{title}" created in Contact Form 7.',
    permalinks: 'Permalinks set to "Post name".',
    globalStyles: 'Colors and fonts of the template kit applied to the Elementor site kit.',
  }),
};

/** Folder / zip name of the plugin, e.g. "edil-bianchi-site". */
export const pluginSlug = (project) => `${slugify(project.site_name, 40) || 'website'}-site`;

/** Text safe inside the PHP comment header (one line, no comment terminator). */
const headerText = (s) => String(s).replace(/[\r\n]+/g, ' ').replace(/\*\//g, '* /');

/**
 * Placeholder shortcode the plugin swaps for a real Contact Form 7 form
 * (an id like INSERIRE_ID / INSERT_ID; a real id is numeric or a lowercase hash).
 */
function contactFormInfo(ctx) {
  const shortcode = ctx.settings.contactShortcode || '';
  const id = shortcode.match(/\bid="([^"]*)"/)?.[1];
  if (!/\[contact-form-7\b/.test(shortcode) || (id && !/[A-Z_]/.test(id))) return null;
  return {
    placeholder: shortcode,
    title: shortcode.match(/\btitle="([^"]*)"/)?.[1] || (ctx.project.language === 'it' ? 'Modulo di contatto' : 'Contact form'),
    recipient: ctx.project.email,
  };
}

/**
 * @param {object} p
 *   ctx, pages: [{ key, role, title, slug, seo, doc }] (the 5 site pages, doc = importable template or null),
 *   templates: [{ key, role, title, type, doc }], posts: [{ key, title, slug, content, excerpt, image, seo }],
 *   images: [{ file, alt, photo, logo }], imagesDir, category, globalStyles
 * @returns {{ fileName: string, buffer: Buffer }}
 */
export function buildPlugin({ ctx, pages, templates, posts, images, imagesDir, category, globalStyles }) {
  const { project } = ctx;
  const slug = pluginSlug(project);
  const hash = crypto.createHash('md5').update(`${project.id}:${slug}`).digest('hex').slice(0, 8);
  const ui = (UI[project.language] || UI.en)(project.site_name);
  const zip = new AdmZip();
  const add = (rel, data) => zip.addFile(`${slug}/${rel}`, Buffer.isBuffer(data) ? data : Buffer.from(data));
  const addDoc = (key, doc) => {
    if (!doc) return null;
    add(`data/elementor/${key}.json`, JSON.stringify(doc));
    return `elementor/${key}.json`;
  };

  const imageEntries = images.map((img) => {
    const buffer = fs.readFileSync(path.join(imagesDir, img.file));
    add(`images/${img.file}`, buffer);
    return {
      file: img.file,
      title: img.file.replace(/\.[^.]+$/, ''),
      alt: img.alt || '',
      mime: MIME[path.extname(img.file).toLowerCase()] || 'image/jpeg',
      hash: crypto.createHash('md5').update(buffer).digest('hex'),
      photo: img.photo,
    };
  });

  const site = {
    generator: 'Elementor Site Generator',
    site: { name: project.site_name, language: project.language },
    ui,
    images: imageEntries,
    logo: images.find((i) => i.logo)?.file || null,
    category,
    menu: ctx.menu,
    contactForm: contactFormInfo(ctx),
    pages: pages.map((p) => ({ key: p.key, role: p.role, title: p.title, slug: p.slug, seo: p.seo || null, elementor: addDoc(p.key, p.doc) })),
    posts,
    templates: templates.map((t) => ({ key: t.key, role: t.role, title: t.title, type: t.type, elementor: addDoc(t.key, t.doc) })),
    globalStyles: globalStyles || null,
  };
  add('data/site.json', JSON.stringify(site, null, 1));

  const d = new Date();
  const version = `1.${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.${d.getHours() * 100 + d.getMinutes()}`;
  const php = fs
    .readFileSync(PHP_TEMPLATE, 'utf8')
    .replaceAll('{{PLUGIN_NAME}}', headerText(`${project.site_name} – Site builder`))
    .replaceAll('{{PLUGIN_DESCRIPTION}}', headerText(ui.intro))
    .replaceAll('{{MENU_TITLE}}', headerText(ui.menuTitle))
    .replaceAll('{{VERSION}}', version)
    .replaceAll('{{HASH}}', hash);
  add(`${slug}.php`, php);

  return { fileName: `${slug}.zip`, buffer: zip.toBuffer() };
}
