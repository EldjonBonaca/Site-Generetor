/**
 * A whole static website (HTML + CSS + JavaScript, no WordPress) from the documents of a generation:
 * the same pages, header, footer and service articles the WordPress plugin creates (exporter.js).
 *
 *   index.html                    Home
 *   <slug>/index.html             the other pages and one page per service
 *   assets/css/site.css           base stylesheet + global colors + header / footer + site CSS of the template
 *   assets/js/site.js             menu on phones, carousels, lightbox, entrance animations, contact form
 *   assets/img/*                  the images of the project (added by the exporter)
 *   send.php                      sends the contact form by e-mail (any hosting with PHP)
 *
 * Every link and image address is relative, so the folder works in any directory of a hosting and
 * also opened from the disk.
 */
import { BASE_CSS, globalsCss } from './css.js';
import { renderDocument, SITE_JS, textsFor } from './render.js';
import { whatsappNumber } from '../generation/plan.js';

export const IMAGE_SCHEME = 'esg-image://';
const FONT_AWESOME = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css';
/** Fonts of the computer: not loaded from Google Fonts. */
const SYSTEM_FONT = /^(arial|helvetica|georgia|times|times new roman|verdana|tahoma|trebuchet ms|courier|courier new|segoe ui|system-ui|sans-serif|serif|monospace|inherit|eicons|font awesome.*)$/i;

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = (s) => esc(s).replace(/"/g, '&quot;');

/** Layout of the sections and columns of older Elementor documents (containers need nothing more than the base). */
const LEGACY_CSS = `.elementor-section{position:relative}
.elementor-section>.elementor-container{display:flex;margin:0 auto;position:relative;flex-wrap:wrap}
.elementor-section.elementor-section-boxed>.elementor-container{max-width:1140px}
.elementor-column{position:relative;min-height:1px;display:flex;width:100%}
.elementor-widget-wrap{position:relative;width:100%;display:flex;flex-wrap:wrap;align-content:flex-start;padding:10px}
.elementor-widget-wrap>.elementor-element{width:100%}
.elementor-background-overlay{position:absolute;inset:0}
.elementor-fixed{position:fixed}.elementor-absolute{position:absolute}
@media(min-width:768px){${[10, 16, 20, 25, 30, 33, 40, 50, 60, 66, 70, 75, 80, 90, 100].map((n) => `.elementor-column.elementor-col-${n}{width:${n === 33 ? 33.333 : n === 66 ? 66.666 : n === 16 ? 16.666 : n}%}`).join('')}}`;

/** A site address ("/", "/chi-siamo/", "/cookie-policy") as a relative file path from a page `depth` folders deep. */
export function relativeLink(href, depth) {
  const m = /^\/(?!\/)([^?#]*)([?#].*)?$/.exec(href);
  if (!m) return href;
  const path = m[1].replace(/\/+$/, '');
  return `${'../'.repeat(depth)}${path ? `${path}/` : ''}index.html${m[2] || ''}`;
}

/** Links and images of a piece of HTML or CSS made relative to the page. */
function localize(text, depth) {
  const prefix = '../'.repeat(depth);
  return text
    .split(IMAGE_SCHEME)
    .join(`${prefix}assets/img/`)
    .replace(/(\shref=)(["'])(\/(?!\/)[^"']*)\2/g, (m, a, q, href) => `${a}${q}${relativeLink(href, depth)}${q}`);
}

/** Google Fonts stylesheet for the font families the CSS uses. */
function fontsLink(css) {
  const families = new Set();
  for (const m of css.matchAll(/font-family\s*:\s*["']?([^;"',}]+)/gi)) {
    const f = m[1].trim();
    if (f && !/^var\(/.test(f) && !SYSTEM_FONT.test(f)) families.add(f);
  }
  if (!families.size) return '';
  const query = [...families].slice(0, 8).map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400`).join('&');
  return `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?${query}&display=swap">`;
}

/** send.php: the contact form sent by e-mail to the business (JSON answer for the script of the site). */
function sendPhp({ email, siteName }) {
  return `<?php
// Contact form of the website: sends the message to the address below.
$to = ${JSON.stringify(email || '')};
$site = ${JSON.stringify(siteName || '')};
header('Content-Type: application/json; charset=utf-8');
$clean = function ($v) { return trim(str_replace(array("\\r", "\\n"), ' ', (string) $v)); };
$name = $clean(isset($_POST['name']) ? $_POST['name'] : '');
$email = $clean(isset($_POST['email']) ? $_POST['email'] : '');
$phone = $clean(isset($_POST['phone']) ? $_POST['phone'] : '');
$message = trim((string) (isset($_POST['message']) ? $_POST['message'] : ''));
// "website" is a hidden field only robots fill in
if ($_SERVER['REQUEST_METHOD'] !== 'POST' || !empty($_POST['website']) || $to === '' || $name === '' || $message === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || empty($_POST['privacy'])) {
    http_response_code(400);
    echo json_encode(array('ok' => false));
    exit;
}
$host = preg_replace('/^www\\./', '', isset($_SERVER['HTTP_HOST']) ? preg_replace('/[^a-z0-9.-]/i', '', $_SERVER['HTTP_HOST']) : 'localhost');
$body = "Nome: $name\\nEmail: $email\\nTelefono: $phone\\n\\n$message\\n";
$headers = "From: $site <noreply@$host>\\r\\nReply-To: $email\\r\\nContent-Type: text/plain; charset=utf-8";
$ok = mail($to, '=?UTF-8?B?' . base64_encode("Messaggio dal sito $site") . '?=', $body, $headers);
if (!$ok) { http_response_code(500); }
echo json_encode(array('ok' => (bool) $ok));
`;
}

/**
 * Build the files of the static site.
 * @param {object} input  what the exporter gives the WordPress plugin (exporter.js pluginInput): { ctx, pages: [{ role, title, slug, seo, doc }],
 *                        templates: [{ role, doc }], posts: [{ title, slug, seo, doc }], siteCss, globalStyles }, images as esg-image://<file>
 * @param {object} opts   { siteIcon (file name in assets/img), frontendCss (Elementor frontend of a copied site), legalPages: [{ text, url }] }
 * @returns {{ files: Array<{ path: string, data: string }>, notes: string[] }}
 */
export function buildStaticSite(input, { siteIcon = null, frontendCss = '', legalPages = [] } = {}) {
  const { ctx } = input;
  const project = ctx.project;
  const lang = project.language || 'it';
  const texts = textsFor(lang);
  const menu = input.pages.filter((p) => p.doc).map((p) => ({ title: p.title, url: p.role === 'home' ? '/' : `/${p.slug}/` }));
  const template = (role) => input.templates.find((t) => t.role === role)?.doc || null;
  const logoFile = input.images?.find((i) => i.logo)?.file || null;
  const unknown = new Set();
  const shared = { texts, menu, siteName: project.site_name, home: '/', logo: logoFile ? `${IMAGE_SCHEME}${logoFile}` : null };

  const render = (doc, current, title, depth = 0) => {
    if (!doc) return { html: '', css: '' };
    const out = renderDocument(doc, { ...shared, current, title, formAction: `${'../'.repeat(depth)}send.php` });
    out.unknown.forEach((w) => unknown.add(w));
    return out;
  };

  // The CSS written for the WordPress site (site CSS of the template, or the CSS copied with a website): its
  // @import lines must come first in the stylesheet
  const siteCss = String(input.siteCss || '');
  const imports = (siteCss.match(/^@import[^;]+;/gm) || []).join('\n');
  const header = render(template('header'), null, '');
  const footer = render(template('footer'), null, '');
  const sharedCss = [imports, BASE_CSS, LEGACY_CSS, frontendCss, globalsCss(input.globalStyles), header.css, footer.css, siteCss.replace(/^@import[^;]+;/gm, '')].filter(Boolean).join('\n');

  // WhatsApp button of the project (the WordPress site gets it from the Joinchat plugin): a link to the chat
  const wa = whatsappNumber(project);
  const waButton = wa
    ? `<a class="esg-wa" href="https://wa.me/${wa}" target="_blank" rel="noopener" aria-label="WhatsApp"><i class="fab fa-whatsapp" aria-hidden="true"></i></a>
`
    : '';
  const WA_CSS = wa ? '.esg-wa{position:fixed;right:20px;bottom:20px;z-index:900;display:flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:50%;background:#25d366;color:#fff;font-size:30px;text-decoration:none;box-shadow:0 6px 18px rgba(0,0,0,.22);transition:transform .2s}.esg-wa:hover{transform:scale(1.06);color:#fff}@media(max-width:767px){.esg-wa{right:14px;bottom:14px;width:52px;height:52px}}' : '';
  const files = [];
  const page = ({ path, doc, title, seo, current, body = null }) => {
    const depth = path ? path.split('/').filter(Boolean).length : 0;
    const prefix = '../'.repeat(depth);
    // The header and footer are rendered per page: the menu marks the current page
    const head = render(template('header'), current, title, depth);
    const foot = render(template('footer'), current, title, depth);
    const main = body === null ? render(doc, current, title, depth) : { html: body, css: '' };
    const pageTitle = seo?.title || (title && title !== project.site_name ? `${title} | ${project.site_name}` : project.site_name);
    const html = `<!doctype html>
<html lang="${attr(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(pageTitle)}</title>
${seo?.description ? `<meta name="description" content="${attr(seo.description)}">\n` : ''}${siteIcon ? `<link rel="icon" type="image/png" href="${prefix}assets/img/${attr(siteIcon)}">\n` : ''}${fontsLink(`${sharedCss}\n${main.css}`)}
<link rel="stylesheet" href="${FONT_AWESOME}">
<link rel="stylesheet" href="${prefix}assets/css/site.css">
${main.css ? `<style>\n${localize(main.css, depth)}\n</style>\n` : ''}<noscript><style>.esg-anim{opacity:1}</style></noscript>
</head>
<body class="elementor-default elementor-page">
<header class="esg-header-wrap"><div class="elementor elementor-location-header">
${localize(head.html, depth)}
</div></header>
<main><div class="elementor">
${localize(main.html, depth)}
</div></main>
<footer class="esg-footer-wrap"><div class="elementor elementor-location-footer">
${localize(foot.html, depth)}
</div></footer>
${waButton}<script src="${prefix}assets/js/site.js" defer></script>
</body>
</html>
`;
    files.push({ path: `${path}index.html`, data: html });
  };

  for (const p of input.pages) {
    if (!p.doc) continue;
    const url = p.role === 'home' ? '/' : `/${p.slug}/`;
    page({ path: p.role === 'home' ? '' : `${p.slug}/`, doc: p.doc, title: p.title, seo: p.seo, current: url });
  }
  for (const p of input.posts || []) {
    if (p.doc) page({ path: `${p.slug}/`, doc: p.doc, title: p.title, seo: p.seo, current: `/${p.slug}/` });
  }
  // Pages linked by the footer (cookie / privacy policy): a page to fill in, so the links lead somewhere
  for (const legal of legalPages) {
    const slug = legal.url.replace(/^\/+|\/+$/g, '');
    if (!slug || files.some((f) => f.path === `${slug}/index.html`)) continue;
    page({ path: `${slug}/`, title: legal.text, seo: null, current: legal.url, body: `<section style="max-width:860px;margin:0 auto;padding:80px 20px"><h1 style="margin-bottom:24px">${esc(legal.text)}</h1><p>${esc(lang === 'it' ? 'Inserire qui il testo di questa pagina.' : 'Put the text of this page here.')}</p></section>` });
  }

  // The shared stylesheet lives in assets/css: its images are two folders up
  files.push({ path: 'assets/css/site.css', data: [sharedCss, WA_CSS].filter(Boolean).join('\n').split(IMAGE_SCHEME).join('../img/') });
  files.push({ path: 'assets/js/site.js', data: SITE_JS });
  files.push({ path: 'send.php', data: sendPhp({ email: project.email, siteName: project.site_name }) });
  files.push({
    path: 'LEGGIMI.txt',
    data:
      lang === 'it'
        ? `Sito statico di ${project.site_name} (HTML, CSS, JavaScript)\n\nPubblicazione: carica tutto il contenuto di questa cartella nella cartella pubblica dell'hosting (es. public_html).\nAnteprima: apri index.html nel browser.\n\nModulo di contatto: funziona su un hosting con PHP (file send.php) e invia a ${project.email || '(indirizzo email del progetto)'}. Aprendo i file dal disco il modulo non invia.\nPagine legali (Cookie Policy, Privacy Policy): sono pagine vuote da completare.\nIcone e font sono caricati da internet (Font Awesome, Google Fonts).\n`
        : `Static website of ${project.site_name} (HTML, CSS, JavaScript)\n\nPublishing: upload the whole content of this folder to the public folder of the hosting (e.g. public_html).\nPreview: open index.html in the browser.\n\nContact form: works on a hosting with PHP (send.php) and sends to ${project.email || '(the e-mail address of the project)'}. It does not send when the files are opened from the disk.\nLegal pages (Cookie Policy, Privacy Policy): empty pages to fill in.\nIcons and fonts are loaded from the internet (Font Awesome, Google Fonts).\n`,
  });
  return { files, notes: [...unknown] };
}
