/**
 * Preview of a Template Kit page in the browser, without WordPress: the Elementor documents of the kit
 * rendered with the markup Elementor uses (same classes, same data-id), so the CSS of the kit styles
 * them as on a real site. For a kit copied from a website (kits/from-site.js) it shows how its structure
 * came out: the copied CSS (site.css) + the Elementor frontend CSS of that site (preview.css).
 * Served with a sandboxing CSP (no scripts, no forms): the HTML comes from other websites.
 */
import fs from 'node:fs';
import path from 'node:path';
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = (s) => esc(s).replace(/"/g, '&quot;');
const url = (v) => (v && typeof v === 'object' ? v.url : v) || '';

function icon(i) {
  const value = i && typeof i === 'object' ? i.value : '';
  if (!value || typeof value !== 'string') return '';
  return `<i aria-hidden="true" class="${attr(value)}"></i>`;
}

function link(open, l, inner) {
  const href = url(l);
  return href ? `<a href="${attr(href)}"${open || ''}>${inner}</a>` : inner;
}

/** Inner HTML of a widget, in the markup of Elementor (the main widgets; the others show their HTML / a label). */
const WIDGETS = {
  heading: (s) => {
    const tag = /^(h[1-6]|div|span|p)$/.test(s.header_size) ? s.header_size : 'h2';
    return `<${tag} class="elementor-heading-title elementor-size-default">${link('', s.link, s.title || '')}</${tag}>`;
  },
  'text-editor': (s) => s.editor || '',
  image: (s) => {
    const img = url(s.image) ? `<img src="${attr(url(s.image))}" alt="" loading="lazy">` : '';
    const body = link('', s.link_to === 'custom' ? s.link : null, img);
    return s.caption ? `<figure class="wp-caption">${body}<figcaption class="widget-image-caption wp-caption-text">${esc(s.caption)}</figcaption></figure>` : body;
  },
  button: (s) =>
    `<div class="elementor-button-wrapper"><a class="elementor-button elementor-button-link elementor-size-${attr(s.size || 'sm')}" href="${attr(url(s.link) || '#')}"><span class="elementor-button-content-wrapper">${s.selected_icon?.value ? `<span class="elementor-button-icon">${icon(s.selected_icon)}</span>` : ''}<span class="elementor-button-text">${esc(s.text)}</span></span></a></div>`,
  icon: (s) => `<div class="elementor-icon-wrapper"><span class="elementor-icon elementor-animation-">${icon(s.selected_icon)}</span></div>`,
  'icon-box': (s) =>
    `<div class="elementor-icon-box-wrapper"><div class="elementor-icon-box-icon"><span class="elementor-icon elementor-animation-">${icon(s.selected_icon)}</span></div><div class="elementor-icon-box-content"><${/^h[1-6]$/.test(s.title_size) ? s.title_size : 'h3'} class="elementor-icon-box-title"><span>${esc(s.title_text)}</span></${/^h[1-6]$/.test(s.title_size) ? s.title_size : 'h3'}><p class="elementor-icon-box-description">${s.description_text || ''}</p></div></div>`,
  'image-box': (s) =>
    `<div class="elementor-image-box-wrapper">${url(s.image) ? `<figure class="elementor-image-box-img"><img src="${attr(url(s.image))}" alt=""></figure>` : ''}<div class="elementor-image-box-content"><h3 class="elementor-image-box-title">${esc(s.title_text)}</h3><p class="elementor-image-box-description">${s.description_text || ''}</p></div></div>`,
  'icon-list': (s) =>
    `<ul class="elementor-icon-list-items">${(s.icon_list || [])
      .map((it) => `<li class="elementor-icon-list-item">${link('', it.link, `${it.selected_icon?.value ? `<span class="elementor-icon-list-icon">${icon(it.selected_icon)}</span>` : ''}<span class="elementor-icon-list-text">${esc(it.text)}</span>`)}</li>`)
      .join('')}</ul>`,
  counter: (s) =>
    `<div class="elementor-counter"><div class="elementor-counter-number-wrapper"><span class="elementor-counter-number-prefix">${esc(s.prefix)}</span><span class="elementor-counter-number">${esc(s.ending_number)}</span><span class="elementor-counter-number-suffix">${esc(s.suffix)}</span></div><div class="elementor-counter-title">${esc(s.title)}</div></div>`,
  testimonial: (s) =>
    `<div class="elementor-testimonial-wrapper"><div class="elementor-testimonial-content">${s.testimonial_content || ''}</div><div class="elementor-testimonial-meta"><div class="elementor-testimonial-meta-inner"><div class="elementor-testimonial-details"><div class="elementor-testimonial-name">${esc(s.testimonial_name)}</div><div class="elementor-testimonial-job">${esc(s.testimonial_job)}</div></div></div></div></div>`,
  'image-gallery': (s) => `<div class="gallery gallery-columns-${attr(s.gallery_columns || 4)}">${(s.wp_gallery || []).map((g) => `<figure class="gallery-item"><div class="gallery-icon"><img src="${attr(url(g))}" alt=""></div></figure>`).join('')}</div>`,
  'image-carousel': (s) => `<div class="elementor-image-carousel-wrapper" style="display:flex;gap:10px;overflow:hidden">${(s.carousel || []).slice(0, 4).map((g) => `<img src="${attr(url(g))}" alt="" style="width:25%;object-fit:cover">`).join('')}</div>`,
  accordion: (s) => `<div class="elementor-accordion">${(s.tabs || []).map((t) => `<div class="elementor-accordion-item"><div class="elementor-tab-title"><a class="elementor-accordion-title">${esc(t.tab_title)}</a></div></div>`).join('')}</div>`,
  toggle: (s) => WIDGETS.accordion(s),
  tabs: (s) => WIDGETS.accordion(s),
  'social-icons': (s) => `<div class="elementor-social-icons-wrapper elementor-grid">${(s.social_icon_list || []).map((i) => `<span class="elementor-grid-item"><a class="elementor-icon elementor-social-icon">${icon(i.social_icon)}</a></span>`).join('')}</div>`,
  'star-rating': (s) => `<div class="elementor-star-rating__wrapper"><div class="elementor-star-rating">${'★'.repeat(Math.round(Number(s.rating) || 5))}</div></div>`,
  divider: () => '<div class="elementor-divider"><span class="elementor-divider-separator"></span></div>',
  spacer: () => '<div class="elementor-spacer"><div class="elementor-spacer-inner"></div></div>',
  html: (s) => s.html || '',
  google_maps: (s) => `<div class="elementor-custom-embed" style="background:#e5e7eb;height:300px;display:flex;align-items:center;justify-content:center;color:#475569">Google Maps · ${esc(s.address)}</div>`,
  video: () => '<div class="elementor-wrapper" style="background:#0f172a;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;color:#fff">▶ Video</div>',
};

/** Background photo set in the settings (the CSS of the copied site no longer holds it). */
function backgroundStyle(s) {
  const bg = url(s.background_image);
  return bg && s.background_background === 'classic' ? ` style="background-image:url('${attr(bg)}');background-size:cover;background-position:center"` : '';
}

function renderElement(el) {
  const s = el.settings || {};
  const id = attr(el.id);
  const extra = s._css_classes || s.css_classes ? ` ${attr(s._css_classes || s.css_classes)}` : '';
  const children = (el.elements || []).map(renderElement).join('');
  if (el.elType === 'widget') {
    const type = String(el.widgetType || 'html');
    const render = WIDGETS[type];
    const inner = render ? render(s) : `<div style="padding:12px;border:1px dashed #94a3b8;color:#64748b;font:13px sans-serif">${esc(type)}</div>`;
    return `<div class="elementor-element elementor-element-${id} elementor-widget elementor-widget-${attr(type)}${extra}" data-id="${id}" data-element_type="widget" data-widget_type="${attr(type)}.default"><div class="elementor-widget-container">${inner}</div></div>`;
  }
  if (el.elType === 'section') {
    const layout = s.layout === 'full_width' ? 'elementor-section-full_width' : 'elementor-section-boxed';
    const overlay = s.background_overlay_background ? '<div class="elementor-background-overlay"></div>' : '';
    return `<section class="elementor-section ${el.isInner ? 'elementor-inner-section' : 'elementor-top-section'} elementor-element elementor-element-${id} ${layout} elementor-section-height-default${extra}" data-id="${id}" data-element_type="section"${backgroundStyle(s)}>${overlay}<div class="elementor-container elementor-column-gap-${attr(s.gap || 'default')}">${children}</div></section>`;
  }
  if (el.elType === 'column') {
    return `<div class="elementor-column elementor-col-${attr(s._column_size || 100)} elementor-element elementor-element-${id}${extra}" data-id="${id}" data-element_type="column"${backgroundStyle(s)}><div class="elementor-widget-wrap elementor-element-populated">${children}</div></div>`;
  }
  const boxed = s.content_width !== 'full';
  return `<div class="elementor-element elementor-element-${id} e-flex ${boxed ? 'e-con-boxed' : 'e-con-full'} e-con ${el.isInner ? 'e-child' : 'e-parent'}${extra}" data-id="${id}" data-element_type="container"${backgroundStyle(s)}>${boxed ? `<div class="e-con-inner">${children}</div>` : children}</div>`;
}

/** An Elementor document (its content) in the markup of Elementor. */
export function renderDocument(doc, postId = 1) {
  const content = Array.isArray(doc) ? doc : doc?.content || [];
  return `<div class="elementor elementor-${attr(postId)}">${content.map(renderElement).join('')}</div>`;
}

/** CSS files of a kit folder (next to its manifest): site.css (on the new site) and preview.css (Elementor frontend, preview only). */
function kitCss(dir) {
  const read = (name) => {
    for (const d of [dir, ...fs.readdirSync(dir, { withFileTypes: true }).filter((x) => x.isDirectory()).map((x) => path.join(dir, x.name))]) {
      const file = path.join(d, name);
      if (fs.existsSync(file) && fs.existsSync(path.join(d, 'manifest.json'))) return fs.readFileSync(file, 'utf8');
    }
    return '';
  };
  return { site: read('site.css'), frontend: read('preview.css') };
}

/** Elementor kit settings (global colors and fonts) as the CSS variables Elementor defines. */
function globalVars(styles) {
  if (!styles) return '';
  const colors = [...(styles.system_colors || []), ...(styles.custom_colors || [])].filter((c) => c?._id && c.color).map((c) => `--e-global-color-${c._id}:${c.color}`);
  const fonts = [...(styles.system_typography || []), ...(styles.custom_typography || [])]
    .filter((f) => f?._id && f.typography_font_family)
    .flatMap((f) => [`--e-global-typography-${f._id}-font-family:"${f.typography_font_family}"`, ...(f.typography_font_weight ? [`--e-global-typography-${f._id}-font-weight:${f.typography_font_weight}`] : [])]);
  return colors.length || fonts.length ? `body{${[...colors, ...fonts].join(';')}}` : '';
}

/** Minimal Elementor frontend (layout of sections, columns and flex containers) when the kit has no preview.css. */
const BASE_CSS = `*,*::before,*::after{box-sizing:border-box}body{margin:0;font-family:sans-serif;line-height:1.5}img{max-width:100%;height:auto}
.elementor-section{position:relative}.elementor-section .elementor-container{display:flex;margin:0 auto;position:relative}.elementor-section.elementor-section-boxed>.elementor-container{max-width:1140px}
.elementor-column{position:relative;min-height:1px;display:flex}.elementor-widget-wrap{position:relative;width:100%;flex-wrap:wrap;align-content:flex-start;display:flex;padding:10px}
@media(min-width:768px){.elementor-column.elementor-col-10{width:10%}.elementor-column.elementor-col-20{width:20%}.elementor-column.elementor-col-25{width:25%}.elementor-column.elementor-col-30{width:30%}.elementor-column.elementor-col-33{width:33.333%}.elementor-column.elementor-col-40{width:40%}.elementor-column.elementor-col-50{width:50%}.elementor-column.elementor-col-60{width:60%}.elementor-column.elementor-col-66{width:66.666%}.elementor-column.elementor-col-70{width:70%}.elementor-column.elementor-col-75{width:75%}.elementor-column.elementor-col-80{width:80%}.elementor-column.elementor-col-90{width:90%}.elementor-column.elementor-col-100{width:100%}}
@media(max-width:767px){.elementor-column{width:100%}.elementor-section .elementor-container{flex-wrap:wrap}}
.elementor-widget-wrap>.elementor-element{width:100%}.elementor-background-overlay{position:absolute;inset:0}
.e-con{--container-max-width:1140px;--content-width:min(100%,var(--container-max-width));--flex-direction:column;--gap:20px;--padding-block:10px;--padding-inline:10px;display:var(--display,flex);flex-direction:var(--flex-direction);gap:var(--gap);padding:var(--padding-top,var(--padding-block)) var(--padding-right,var(--padding-inline)) var(--padding-bottom,var(--padding-block)) var(--padding-left,var(--padding-inline));position:relative;width:var(--width,100%);margin-inline:auto}
.e-con-boxed>.e-con-inner{display:flex;flex-direction:var(--flex-direction);gap:var(--gap);width:100%;max-width:var(--content-width);margin:0 auto;flex-wrap:var(--flex-wrap,nowrap);justify-content:var(--justify-content,flex-start);align-items:var(--align-items,stretch)}
.e-con-full{flex-wrap:var(--flex-wrap,nowrap);justify-content:var(--justify-content,flex-start);align-items:var(--align-items,stretch)}.e-con.e-child{--width:auto}
.elementor-button{display:inline-block;padding:12px 24px;background:var(--e-global-color-accent,#69727d);color:#fff;text-decoration:none;border-radius:3px}
.elementor-icon{display:inline-block;font-size:50px;line-height:1}.elementor-icon svg,.e-font-icon-svg{width:1em;height:1em}.elementor-icon-list-items{list-style:none;margin:0;padding:0}
.elementor-heading-title{margin:0;line-height:1.2}.elementor-counter-number-wrapper{font-size:69px;font-weight:600}`;

/**
 * A full page for the preview: header + page + footer of the kit, its global styles and CSS.
 * docs: { header?, page, footer? } (Elementor documents), kit: { dir, info }.
 */
export function previewPage(kit, docs, title = '') {
  const css = kitCss(kit.dir);
  const parts = [docs.header && renderDocument(docs.header, 'header'), docs.page && renderDocument(docs.page, 'page'), docs.footer && renderDocument(docs.footer, 'footer')].filter(Boolean);
  // @import must come first in a stylesheet: the font imports of the copied CSS go in their own <style>
  const imports = (css.site.match(/^@import[^;]+;/gm) || []).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">
<style>${imports}</style>
<style>${BASE_CSS}</style>
<style>${css.frontend}</style>
<style>${globalVars(kit.info?.globalStyles)}</style>
<style>${css.site.replace(/^@import[^;]+;/gm, '')}</style>
</head><body class="elementor-page">${parts.join('\n')}</body></html>`;
}

/** Content-Security-Policy of the preview: no scripts, no forms, only images / fonts / styles / map and video frames. */
export const PREVIEW_CSP =
  "sandbox allow-popups; default-src 'none'; img-src * data: blob:; style-src 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; font-src * data:; frame-src https://www.google.com https://www.youtube.com https://player.vimeo.com; media-src *";
