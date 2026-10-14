/**
 * WordPress plugin that builds the whole site when activated (see wp-plugin/plugin.php):
 *   <slug>/<slug>.php          plugin code (generic; only header + namespace are filled in)
 *   <slug>/data/site.json      pages, articles, images, menu, templates, contact form, template styles, admin texts
 *   <slug>/data/elementor/*.json  Elementor documents (images referenced as esg-image://<file>)
 *   <slug>/images/*            the optimized images, imported into the Media Library
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { AdmZip } from '../lib/zip.js';
import { slugify } from '../lib/util.js';
import { contactForm } from './plan.js';

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
    hfNotice: 'Elementor Pro non è necessario: senza Pro header e footer vengono mostrati su tutto il sito da questo plugin, che quindi deve restare attivo.',
    hfReady: 'Header e footer pubblicati su tutto il sito (mostrati da questo plugin: lascialo attivo).',
    hfTheme: 'Senza Elementor Pro header e footer vengono mostrati solo con il tema Hello Elementor: attivalo e clicca "Aggiorna il sito".',
    pluginReady: 'Plugin "{name}" installato e attivato.',
    installFailed: 'Impossibile installare o attivare "{name}" ({error}). Installalo a mano da Plugin → Aggiungi nuovo, poi clicca "Aggiorna il sito".',
    themeSwitched: 'Tema "Hello Elementor" attivato: è il tema per cui è pensato il template (header e footer di Elementor).',
    conditions: 'Condizioni di visualizzazione di header/footer non aggiornate: aprile in Template → Theme Builder e ripubblicale.',
    noForm: '{plugin} non è attivo: il modulo di contatto non è stato creato. Installalo e clicca "Aggiorna il sito".',
    formCreated: 'Modulo di contatto "{title}" creato in {plugin} (le richieste arrivano a {email}).',
    permalinks: 'Permalink impostati su "Nome articolo".',
    globalStyles: 'Colori e font del template applicati al kit Elementor del sito.',
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
    hfNotice: 'Elementor Pro is not needed: without Pro the header and footer are shown on the whole site by this plugin, so keep it active.',
    hfReady: 'Header and footer published on the whole site (shown by this plugin: keep it active).',
    hfTheme: 'Without Elementor Pro the header and footer are shown only with the Hello Elementor theme: activate it, then click "Update the website".',
    pluginReady: 'Plugin "{name}" installed and activated.',
    installFailed: 'Could not install or activate "{name}" ({error}). Install it from Plugins → Add New Plugin, then click "Update the website".',
    themeSwitched: 'Theme "Hello Elementor" activated: it is the theme the template is designed for (Elementor header and footer).',
    conditions: 'Display conditions of header/footer could not be refreshed: open them in Templates → Theme Builder and publish them again.',
    noForm: '{plugin} is not active: the contact form was not created. Install it, then click "Update the website".',
    formCreated: 'Contact form "{title}" created in {plugin} (messages are sent to {email}).',
    permalinks: 'Permalinks set to "Post name".',
    globalStyles: 'Colors and fonts of the template applied to the Elementor site kit.',
  }),
};

/** Folder / zip name of the plugin, e.g. "edil-bianchi-site". */
export const pluginSlug = (project) => `${slugify(project.site_name, 40) || 'website'}-site`;

/** Text safe inside the PHP comment header (one line, no comment terminator). */
const headerText = (s) => String(s).replace(/[\r\n]+/g, ' ').replace(/\*\//g, '* /');

/** Fields of the contact form required by the prompt (name, email, phone, message, privacy consent). */
const FORM_TEXTS = {
  it: {
    name: ['Nome e cognome', 'Il tuo nome'],
    email: ['Email', 'La tua email'],
    phone: ['Telefono', 'Il tuo numero di telefono'],
    message: ['Messaggio', 'Come possiamo aiutarti?'],
    consent: "Ho letto l'informativa sulla privacy e acconsento al trattamento dei miei dati personali.",
    submit: 'Invia messaggio',
    subject: 'Nuovo messaggio dal sito',
    success: 'Grazie! Il tuo messaggio è stato inviato: ti risponderemo al più presto.',
  },
  en: {
    name: ['Full name', 'Your name'],
    email: ['Email', 'Your email'],
    phone: ['Phone', 'Your phone number'],
    message: ['Message', 'How can we help you?'],
    consent: 'I have read the privacy policy and I consent to the processing of my personal data.',
    submit: 'Send message',
    subject: 'New message from the website',
    success: 'Thank you! Your message has been sent: we will reply as soon as possible.',
  },
};

/** Elementor content of the MetForm form (MetForm field widgets inside one container). */
function metformDoc(texts, hash) {
  let n = 0;
  const id = () => crypto.createHash('md5').update(`metform:${hash}:${n++}`).digest('hex').slice(0, 7);
  const widget = (widgetType, settings) => ({ id: id(), elType: 'widget', widgetType, settings, elements: [] });
  const input = (type, name, [label, placeholder], required = 'yes') =>
    widget(type, { mf_input_label: label, mf_input_name: name, mf_input_placeholder: placeholder, mf_input_required: required });
  return [
    {
      id: id(),
      elType: 'container',
      isInner: false,
      settings: { content_width: 'full', flex_direction: 'column', flex_gap: { unit: 'px', size: 16, column: '16', row: '16', isLinked: true } },
      elements: [
        input('mf-text', 'mf-name', texts.name),
        input('mf-email', 'mf-email', texts.email),
        input('mf-telephone', 'mf-phone', texts.phone, ''),
        input('mf-textarea', 'mf-message', texts.message),
        widget('mf-gdpr-consent', { mf_input_name: 'mf-privacy', mf_gdpr_consent_option_text: texts.consent, mf_input_required: 'yes' }),
        widget('mf-button', { mf_btn_text: texts.submit }),
      ],
    },
  ];
}

/**
 * Contact form the plugin creates (MetForm by default, or Contact Form 7). The contact page
 * contains its placeholder shortcode (id INSERIRE_ID), replaced by the shortcode of the created form.
 */
function contactFormInfo(ctx, hash) {
  const form = contactForm(ctx);
  const texts = FORM_TEXTS[ctx.project.language] || FORM_TEXTS.en;
  return {
    plugin: form.plugin,
    name: form.name,
    placeholder: form.placeholder,
    title: form.title,
    recipient: ctx.project.email,
    subject: `${texts.subject} – ${ctx.project.site_name}`,
    success: texts.success,
    elementor: form.plugin === 'metform' ? metformDoc(texts, hash) : null,
  };
}

/**
 * @param {object} p
 *   ctx, pages: [{ key, role, title, slug, seo, doc }] (the 5 site pages, doc = importable template or null),
 *   templates: [{ key, role, title, type, doc }], posts: [{ key, title, slug, content, excerpt, image, seo, doc }]
 *   (doc = Elementor document of the article, designed like the single post template),
 *   images: [{ file, alt, photo, logo }], imagesDir, category, globalStyles (template colors and fonts)
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
    contactForm: contactFormInfo(ctx, hash),
    pages: pages.map((p) => ({ key: p.key, role: p.role, title: p.title, slug: p.slug, seo: p.seo || null, elementor: addDoc(p.key, p.doc) })),
    posts: posts.map(({ doc, ...p }) => ({ ...p, elementor: doc ? addDoc(p.key, doc) : null })),
    templates: templates.map((t) => ({ key: t.key, role: t.role, title: t.title, type: t.type, elementor: addDoc(t.key, t.doc) })),
    globalStyles: globalStyles || null,
    // Without Elementor Pro the plugin itself displays the header and footer (no other addon needed)
    headerFooter: templates.some((t) => t.role === 'header' || t.role === 'footer'),
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
