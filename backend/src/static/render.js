/**
 * Static rendering of the Elementor documents of a site: plain HTML + CSS + a little JavaScript, no
 * WordPress and no Elementor. The same documents the WordPress plugin imports (templates of the
 * generator, Template Kits, websites copied from their HTML) become the pages of a static website.
 *
 * The markup uses the class names of Elementor (and of the UAE menu), so the site CSS of the templates
 * and the CSS of a copied website apply as they are; static/css.js writes what Elementor would generate
 * from the settings of every element.
 */
import { compileParts } from '../elementor/html-parts.js';
import { Sheet, elementCss, unit } from './css.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = (s) => esc(s).replace(/"/g, '&quot;');
const urlOf = (v) => (v && typeof v === 'object' ? v.url : v) || '';

const icon = (i) => (i && typeof i === 'object' && typeof i.value === 'string' && i.value ? `<i aria-hidden="true" class="${attr(i.value)}"></i>` : '');

function linked(l, inner, cls = '') {
  const href = urlOf(l);
  if (!href) return inner;
  const ext = l && typeof l === 'object' && l.is_external ? ' target="_blank" rel="noopener"' : '';
  return `<a href="${attr(href)}"${cls ? ` class="${cls}"` : ''}${ext}>${inner}</a>`;
}

const headingTag = (t, fallback = 'h2') => (/^(h[1-6]|div|span|p)$/.test(t) ? t : fallback);

/** Labels of the contact form and of the interface, per language of the site. */
const TEXTS = {
  it: { name: 'Nome e cognome', email: 'Email', phone: 'Telefono', message: 'Messaggio', privacy: 'Ho letto e accetto la Privacy Policy', send: 'Invia', sent: 'Messaggio inviato. Ti risponderemo al più presto.', failed: 'Invio non riuscito. Riprova o contattaci per telefono.', menu: 'Menu', prev: 'Precedente', next: 'Successivo' },
  en: { name: 'Full name', email: 'Email', phone: 'Phone', message: 'Message', privacy: 'I have read and accept the Privacy Policy', send: 'Send', sent: 'Message sent. We will get back to you soon.', failed: 'The message could not be sent. Try again or call us.', menu: 'Menu', prev: 'Previous', next: 'Next' },
  es: { name: 'Nombre y apellidos', email: 'Email', phone: 'Teléfono', message: 'Mensaje', privacy: 'He leído y acepto la Política de Privacidad', send: 'Enviar', sent: 'Mensaje enviado. Te responderemos lo antes posible.', failed: 'No se pudo enviar. Inténtalo de nuevo o llámanos.', menu: 'Menú', prev: 'Anterior', next: 'Siguiente' },
  fr: { name: 'Nom et prénom', email: 'E-mail', phone: 'Téléphone', message: 'Message', privacy: "J'ai lu et j'accepte la Politique de confidentialité", send: 'Envoyer', sent: 'Message envoyé. Nous vous répondrons au plus vite.', failed: "L'envoi a échoué. Réessayez ou appelez-nous.", menu: 'Menu', prev: 'Précédent', next: 'Suivant' },
  de: { name: 'Vor- und Nachname', email: 'E-Mail', phone: 'Telefon', message: 'Nachricht', privacy: 'Ich habe die Datenschutzerklärung gelesen und akzeptiere sie', send: 'Senden', sent: 'Nachricht gesendet. Wir melden uns so schnell wie möglich.', failed: 'Senden fehlgeschlagen. Bitte erneut versuchen oder anrufen.', menu: 'Menü', prev: 'Zurück', next: 'Weiter' },
  pt: { name: 'Nome e apelido', email: 'Email', phone: 'Telefone', message: 'Mensagem', privacy: 'Li e aceito a Política de Privacidade', send: 'Enviar', sent: 'Mensagem enviada. Responderemos o mais breve possível.', failed: 'Não foi possível enviar. Tente novamente ou ligue-nos.', menu: 'Menu', prev: 'Anterior', next: 'Seguinte' },
};
export const textsFor = (lang) => TEXTS[lang] || TEXTS.en;

/** Contact form in the markup of Contact Form 7 (the form CSS of the templates is written for it), sent to send.php. */
function contactForm(R) {
  const t = R.texts;
  const field = (label, control) => `<p><label>${esc(label)}<span class="wpcf7-form-control-wrap">${control}</span></label></p>`;
  return `<div class="wpcf7"><form class="wpcf7-form esg-contact-form" action="${attr(R.formAction)}" method="post" novalidate>
${field(t.name, '<input type="text" name="name" autocomplete="name" required>')}
${field(t.email, '<input type="email" name="email" autocomplete="email" required>')}
${field(t.phone, '<input type="tel" name="phone" autocomplete="tel">')}
${field(t.message, '<textarea name="message" rows="6" required></textarea>')}
<p class="esg-hp" aria-hidden="true"><label>Website<input type="text" name="website" tabindex="-1" autocomplete="off"></label></p>
<p><span class="wpcf7-form-control-wrap"><span class="wpcf7-form-control wpcf7-acceptance"><span class="wpcf7-list-item"><label><input type="checkbox" name="privacy" value="1" required><span class="wpcf7-list-item-label">${esc(t.privacy)}</span></label></span></span></span></p>
<p><input class="wpcf7-form-control wpcf7-submit" type="submit" value="${attr(t.send)}"></p>
<div class="esg-form-status" role="status" hidden data-sent="${attr(t.sent)}" data-failed="${attr(t.failed)}"></div>
</form></div>`;
}

/** Inner HTML of each widget, in the markup of Elementor. */
const WIDGETS = {
  heading: (s) => {
    const tag = headingTag(s.header_size);
    return `<${tag} class="elementor-heading-title elementor-size-default">${linked(s.link, s.title || '')}</${tag}>`;
  },
  'text-editor': (s) => s.editor || '',
  image: (s) => {
    const src = urlOf(s.image);
    if (!src) return '';
    const img = `<img src="${attr(src)}" alt="${attr(s.image?.alt || '')}" loading="lazy" decoding="async">`;
    const body = s.link_to === 'custom' ? linked(s.link, img) : s.link_to === 'file' ? `<a href="${attr(src)}" class="esg-zoomable">${img}</a>` : img;
    return s.caption ? `<figure class="wp-caption">${body}<figcaption class="widget-image-caption wp-caption-text">${esc(s.caption)}</figcaption></figure>` : body;
  },
  button: (s) => {
    const inner = `<span class="elementor-button-content-wrapper">${s.selected_icon?.value ? `<span class="elementor-button-icon">${icon(s.selected_icon)}</span>` : ''}<span class="elementor-button-text">${esc(s.text)}</span></span>`;
    const href = urlOf(s.link);
    const ext = s.link?.is_external ? ' target="_blank" rel="noopener"' : '';
    return `<div class="elementor-button-wrapper"><a class="elementor-button elementor-button-link elementor-size-${attr(s.size || 'sm')}" href="${attr(href || '#')}"${ext}>${inner}</a></div>`;
  },
  icon: (s) => {
    const href = urlOf(s.link);
    return `<div class="elementor-icon-wrapper">${href ? `<a class="elementor-icon" href="${attr(href)}">${icon(s.selected_icon)}</a>` : `<div class="elementor-icon">${icon(s.selected_icon)}</div>`}</div>`;
  },
  'icon-box': (s) => {
    const tag = headingTag(s.title_size, 'h3');
    const ico = icon(s.selected_icon);
    return `<div class="elementor-icon-box-wrapper">${ico ? `<div class="elementor-icon-box-icon"><span class="elementor-icon">${ico}</span></div>` : ''}<div class="elementor-icon-box-content"><${tag} class="elementor-icon-box-title">${linked(s.link, `<span>${esc(s.title_text)}</span>`)}</${tag}>${s.description_text ? `<p class="elementor-icon-box-description">${s.description_text}</p>` : ''}</div></div>`;
  },
  'image-box': (s) =>
    `<div class="elementor-image-box-wrapper">${urlOf(s.image) ? `<figure class="elementor-image-box-img"><img src="${attr(urlOf(s.image))}" alt="${attr(s.image?.alt || '')}" loading="lazy"></figure>` : ''}<div class="elementor-image-box-content"><${headingTag(s.title_size, 'h3')} class="elementor-image-box-title">${esc(s.title_text)}</${headingTag(s.title_size, 'h3')}><p class="elementor-image-box-description">${s.description_text || ''}</p></div></div>`,
  'icon-list': (s) =>
    `<ul class="elementor-icon-list-items${s.view === 'inline' ? ' elementor-inline-items' : ''}">${(s.icon_list || [])
      .map((it) => `<li class="elementor-icon-list-item">${linked(it.link, `${it.selected_icon?.value ? `<span class="elementor-icon-list-icon">${icon(it.selected_icon)}</span>` : ''}<span class="elementor-icon-list-text">${esc(it.text)}</span>`)}</li>`)
      .join('')}</ul>`,
  counter: (s) =>
    `<div class="elementor-counter"><div class="elementor-counter-number-wrapper"><span class="elementor-counter-number-prefix">${esc(s.prefix)}</span><span class="elementor-counter-number" data-count="${attr(s.ending_number)}">${esc(s.ending_number)}</span><span class="elementor-counter-number-suffix">${esc(s.suffix)}</span></div><div class="elementor-counter-title">${esc(s.title)}</div></div>`,
  'star-rating': (s) => {
    const n = Math.max(0, Math.min(5, Math.round(Number(s.rating) || 5)));
    return `<div class="elementor-star-rating__wrapper"><div class="elementor-star-rating" role="img" aria-label="${n}/5">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</div></div>`;
  },
  testimonial: (s) =>
    `<div class="elementor-testimonial-wrapper"><div class="elementor-testimonial-content">${s.testimonial_content || ''}</div><div class="elementor-testimonial-meta"><div class="elementor-testimonial-details"><span class="elementor-testimonial-name">${esc(s.testimonial_name)}</span><span class="elementor-testimonial-job">${esc(s.testimonial_job)}</span></div></div></div>`,
  // <details>: opens and closes without any script
  accordion: (s) =>
    `<div class="elementor-accordion">${(s.tabs || [])
      .map((t, i) => {
        const tag = headingTag(s.title_html_tag, 'div');
        return `<details class="elementor-accordion-item"${i === 0 ? ' open' : ''}><summary class="elementor-tab-title"><span class="elementor-accordion-icon"><span class="esg-plus">${icon(s.selected_icon) || '+'}</span><span class="esg-minus">${icon(s.selected_active_icon) || '−'}</span></span><${tag} class="elementor-accordion-title" style="margin:0;font:inherit;color:inherit">${esc(t.tab_title)}</${tag}></summary><div class="elementor-tab-content">${t.tab_content || ''}</div></details>`;
      })
      .join('')}</div>`,
  toggle: (s) => WIDGETS.accordion(s),
  divider: () => '<div class="elementor-divider"><span class="elementor-divider-separator"></span></div>',
  spacer: (s) => `<div class="elementor-spacer"><div class="elementor-spacer-inner" style="height:${attr(unit(s.space) || '50px')}"></div></div>`,
  'social-icons': (s) =>
    `<div class="elementor-social-icons-wrapper">${(s.social_icon_list || [])
      .filter((i) => urlOf(i.link))
      .map((i) => `<a class="elementor-icon elementor-social-icon" href="${attr(urlOf(i.link))}" target="_blank" rel="noopener" aria-label="${attr(String(i.social_icon?.value || '').replace(/^.*fa-/, ''))}">${icon(i.social_icon)}</a>`)
      .join('')}</div>`,
  'image-gallery': (s) =>
    `<div class="gallery">${(s.wp_gallery || [])
      .filter((g) => urlOf(g))
      .map((g) => `<a href="${attr(urlOf(g))}" class="esg-zoomable"><img src="${attr(urlOf(g))}" alt="${attr(g.alt || '')}" loading="lazy" decoding="async"></a>`)
      .join('')}</div>`,
  'image-carousel': (s, el, R) => {
    const slides = (s.carousel || []).filter((g) => urlOf(g));
    const delay = s.autoplay === 'yes' ? Number(s.autoplay_speed) || 4000 : 0;
    const arrows = s.navigation === 'both' || s.navigation === 'arrows';
    return `<div class="esg-carousel" data-autoplay="${delay}"><div class="esg-carousel-track">${slides
      .map((g) => `<a href="${attr(urlOf(g))}" class="esg-zoomable"><img src="${attr(urlOf(g))}" alt="${attr(g.alt || '')}" loading="lazy" decoding="async"></a>`)
      .join('')}</div>${arrows && slides.length > 1 ? `<button type="button" class="esg-carousel-arrow prev" aria-label="${attr(R.texts.prev)}">&#10094;</button><button type="button" class="esg-carousel-arrow next" aria-label="${attr(R.texts.next)}">&#10095;</button>` : ''}</div>`;
  },
  // The menu of the site, in the markup of the UAE menu widget (the header CSS of the templates is written for it)
  'navigation-menu': (s, el, R) => {
    const item = (m) => `<li class="menu-item${m.cls ? ` ${attr(m.cls)}` : ''}${m.url === R.current ? ' current-menu-item' : ''}"><a class="hfe-menu-item" href="${attr(m.url)}"${m.url === R.current ? ' aria-current="page"' : ''}${/^https?:/.test(m.url) ? ' target="_blank" rel="noopener"' : ''}>${esc(m.title)}</a></li>`;
    // A menu of the site shown as a list (footer columns, article sidebar): the pages, the services or the contacts
    if (s.layout === 'vertical') {
      const items = (s.esg_menu && s.esg_menu !== 'main' ? R.menus?.[s.esg_menu] : R.menu) || [];
      return items.length ? `<nav class="hfe-nav-menu__layout-vertical"><ul class="hfe-nav-menu">${items.map(item).join('')}</ul></nav>` : '';
    }
    return `<nav class="hfe-nav-menu__layout-horizontal" aria-label="${attr(R.texts.menu)}"><button type="button" class="hfe-nav-menu__toggle" aria-expanded="false" aria-label="${attr(R.texts.menu)}"><span class="hfe-nav-menu-icon"><i class="fas fa-bars" aria-hidden="true"></i></span></button><ul class="hfe-nav-menu">${R.menu
      .map((m) => `<li class="menu-item${m.url === R.current ? ' current-menu-item' : ''}"><a class="hfe-menu-item" href="${attr(m.url)}"${m.url === R.current ? ' aria-current="page"' : ''}>${esc(m.title)}</a></li>`)
      .join('')}</ul></nav>`;
  },
  // The services of the site (the posts widget of the WordPress site): one card per service page
  'hfe-basic-posts': (s, el, R) => {
    const posts = (R.posts || []).slice(0, Math.max(1, Number(s.posts_per_page) || 6));
    if (!posts.length) return '';
    const tag = headingTag(s.title_tag, 'h3');
    const words = Math.max(0, Number(s.excerpt_length) || 20);
    const excerpt = (text) => {
      const w = String(text || '').trim().split(/\s+/).filter(Boolean);
      return w.length > words ? `${w.slice(0, words).join(' ')}...` : w.join(' ');
    };
    return `<div class="hfe-posts-grid">${posts
      .map(
        (p) =>
          `<article class="hfe-post-card">${s.show_image === 'yes' && p.image ? `<div class="hfe-post-image"><a href="${attr(p.url)}"><img src="${attr(p.image)}" alt="${attr(p.title)}" loading="lazy"></a></div>` : ''}<div class="hfe-post-content"><${tag} class="hfe-post-title"><a href="${attr(p.url)}">${esc(p.title)}</a></${tag}>${s.show_excerpt === 'yes' && p.excerpt ? `<div class="hfe-post-excerpt">${esc(excerpt(p.excerpt))}</div>` : ''}${s.show_read_more === 'yes' ? `<a href="${attr(p.url)}" class="hfe-read-more">${esc(s.read_more_text || '→')}</a>` : ''}</div></article>`
      )
      .join('')}</div>`;
  },
  'nav-menu': (s, el, R) => WIDGETS['navigation-menu'](s, el, R),
  'wp-widget-nav_menu': (s, el, R) => WIDGETS['navigation-menu'](s, el, R),
  // The contact form of the site (a WordPress shortcode in the documents)
  shortcode: (s, el, R) => (/contact-form|wpcf7|form/i.test(s.shortcode || '') ? contactForm(R) : ''),
  form: (s, el, R) => contactForm(R),
  html: (s) => compileParts(s),
  google_maps: (s) => (s.address ? `<div class="elementor-custom-embed"><iframe loading="lazy" src="https://maps.google.com/maps?q=${encodeURIComponent(s.address)}&t=m&z=${Number(s.zoom?.size) || 14}&output=embed&iwloc=near" title="${attr(s.address)}" style="border:0;width:100%;height:${attr(unit(s.height) || '400px')}"></iframe></div>` : ''),
  progress: (s) => {
    const percent = Math.max(0, Math.min(100, Number(s.percent?.size) || 0));
    return `${s.title ? `<span class="elementor-title">${esc(s.title)}</span>` : ''}<div class="elementor-progress-wrapper" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><div class="elementor-progress-bar" style="width:${percent}%"><span class="elementor-progress-text">${esc(s.inner_text || '')}</span><span class="elementor-progress-percentage">${percent}%</span></div></div>`;
  },
  video: (s) => {
    const src = String(s.youtube_url || s.vimeo_url || '');
    return /^https?:///.test(src) ? `<div class="elementor-wrapper elementor-open-inline" style="aspect-ratio:16/9"><iframe src="${attr(src)}" title="Video" loading="lazy" allowfullscreen style="border:0;width:100%;height:100%"></iframe></div>` : '';
  },
  'theme-post-title': (s, el, R) => `<${headingTag(s.header_size, 'h1')} class="elementor-heading-title elementor-size-default">${esc(R.title)}</${headingTag(s.header_size, 'h1')}>`,
  'theme-site-logo': (s, el, R) => (R.logo ? `<a href="${attr(R.home)}"><img src="${attr(R.logo)}" alt="${attr(R.siteName)}"></a>` : `<a href="${attr(R.home)}">${esc(R.siteName)}</a>`),
};

/** Shapes of the section edges (viewBox 1000×100, the filled part is the color of the next section). */
const SHAPES = {
  tilt: 'M0,100 L1000,100 L1000,0 Z',
  'opacity-tilt': 'M0,100 L1000,100 L1000,0 Z',
  triangle: 'M0,100 L500,0 L1000,100 Z',
  arrow: 'M0,100 L0,70 L460,70 L500,20 L540,70 L1000,70 L1000,100 Z',
  curve: 'M0,100 L0,90 Q500,-70 1000,90 L1000,100 Z',
  'curve-asymmetrical': 'M0,100 L0,85 Q260,-60 1000,75 L1000,100 Z',
  waves: 'M0,100 L0,55 C160,100 340,5 500,50 C660,95 840,10 1000,55 L1000,100 Z',
  'wave-brush': 'M0,100 L0,60 C120,95 210,20 330,48 C450,76 520,18 650,45 C780,72 880,22 1000,52 L1000,100 Z',
  mountains: 'M0,100 L0,72 L140,32 L290,66 L440,14 L590,60 L740,26 L890,58 L1000,36 L1000,100 Z',
  zigzag: `M0,100 ${Array.from({ length: 41 }, (_, i) => `L${i * 25},${i % 2 ? 40 : 100}`).join(' ')} L1000,100 Z`,
};

function shapeDivider(s, side) {
  const name = s[`shape_divider_${side}`];
  const path = SHAPES[name];
  if (!path) return '';
  const height = unit(s[`shape_divider_${side}_height`]) || '70px';
  const fill = attr(s[`shape_divider_${side}_color`] || '#fff');
  const layer = name === 'opacity-tilt' ? `<path d="M0,100 L1000,100 L1000,30 Z" fill="${fill}"/><path d="${path}" fill="${fill}" opacity=".35"/>` : `<path d="${path}" fill="${fill}"/>`;
  return `<div class="elementor-shape elementor-shape-${side}" aria-hidden="true"><svg viewBox="0 0 1000 100" preserveAspectRatio="none" style="height:${attr(height)}">${layer}</svg></div>`;
}

/** Entrance animation of an element: revealed when it enters the screen (script of the site). */
function entrance(s) {
  const name = s.animation || s._animation;
  if (!name || name === 'none') return { cls: '', style: '' };
  const anim = { fadeIn: 'esg-fadeIn', fadeInLeft: 'esg-fadeInLeft', fadeInRight: 'esg-fadeInLeft', zoomIn: 'esg-zoomIn' }[name] || 'esg-fadeInUp';
  const delay = Number(s.animation_delay || s._animation_delay) || 0;
  const slow = (s.animation_duration || s._animation_duration) === 'slow';
  return { cls: ' esg-anim', style: `--anim:${anim};${delay ? `--delay:${delay}ms;` : ''}${slow ? '--dur:1.6s;' : ''}` };
}

function renderElement(el, R) {
  if (!el || typeof el !== 'object') return '';
  const s = el.settings || {};
  const id = attr(el.id);
  const classes = s._css_classes || s.css_classes ? ` ${attr(s._css_classes || s.css_classes)}` : '';
  const hidden = ['desktop', 'tablet', 'mobile'].filter((d) => s[`hide_${d}`]).map((d) => ` elementor-hidden-${d}`).join('');
  const anim = entrance(s);
  const style = anim.style ? ` style="${attr(anim.style)}"` : '';
  if (el.elType === 'widget') {
    const type = String(el.widgetType || 'html');
    const render = WIDGETS[type];
    const inner = render ? render(s, el, R) : '';
    if (!render) R.unknown.add(type);
    const position = s._position === 'fixed' ? ' elementor-fixed' : s._position === 'absolute' ? ' elementor-absolute' : '';
    return `<div class="elementor-element elementor-element-${id} elementor-widget elementor-widget-${attr(type)}${position}${classes}${hidden}${anim.cls}" data-id="${id}"${style}><div class="elementor-widget-container">${inner}</div></div>`;
  }
  const children = (el.elements || []).map((child) => renderElement(child, R)).join('');
  // Sections and columns of older Elementor documents: the same layout with containers
  if (el.elType === 'section') {
    return `<section class="elementor-section elementor-top-section elementor-element elementor-element-${id} ${s.layout === 'full_width' ? 'elementor-section-full_width' : 'elementor-section-boxed'}${classes}${hidden}${anim.cls}" data-id="${id}"${style}>${s.background_overlay_background ? '<div class="elementor-background-overlay"></div>' : ''}<div class="elementor-container elementor-column-gap-${attr(s.gap || 'default')}">${children}</div></section>`;
  }
  if (el.elType === 'column') {
    return `<div class="elementor-column elementor-col-${attr(s._column_size || 100)} elementor-element elementor-element-${id}${classes}${hidden}${anim.cls}" data-id="${id}"${style}><div class="elementor-widget-wrap elementor-element-populated">${children}</div></div>`;
  }
  const boxed = s.content_width !== 'full';
  const slideshow =
    s.background_background === 'slideshow' && Array.isArray(s.background_slideshow_gallery)
      ? `<div class="esg-slideshow" data-delay="${Number(s.background_slideshow_slide_duration) || 6000}">${s.background_slideshow_gallery.filter((g) => urlOf(g)).map((g, i) => `<img src="${attr(urlOf(g))}" alt=""${i ? ' loading="lazy"' : ''}${i === 0 ? ' class="is-on"' : ''}>`).join('')}</div>`
      : '';
  const shapes = shapeDivider(s, 'top') + shapeDivider(s, 'bottom');
  const tag = /^(header|footer|main|article|section|aside|nav)$/.test(s.html_tag) ? s.html_tag : 'div';
  return `<${tag} class="elementor-element elementor-element-${id} e-flex ${boxed ? 'e-con-boxed' : 'e-con-full'} e-con ${el.isInner ? 'e-child' : 'e-parent'}${classes}${hidden}${anim.cls}" data-id="${id}"${style}>${slideshow}${boxed ? `<div class="e-con-inner">${children}</div>` : children}${shapes}</${tag}>`;
}

/**
 * An Elementor document as HTML + the CSS of its elements.
 * R: { texts, menu: [{ title, url }], current (url of the page), formAction, title, siteName, home, logo }
 * @returns {{ html: string, css: string, unknown: string[] }}
 */
export function renderDocument(doc, R) {
  const content = Array.isArray(doc) ? doc : doc?.content || [];
  const ctx = { unknown: new Set(), ...R };
  const sheet = new Sheet();
  content.forEach((el) => elementCss(sheet, el));
  return { html: content.map((el) => renderElement(el, ctx)).join('\n'), css: sheet.toString(), unknown: [...ctx.unknown] };
}

/** Script of the site: menu on phones, carousels, slideshows, lightbox, entrance animations, contact form. */
export const SITE_JS = `(function(){
var $=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
// Menu on phones and tablets
$('.hfe-nav-menu__toggle').forEach(function(b){var nav=b.parentNode,menu=nav.querySelector('.hfe-nav-menu');b.addEventListener('click',function(){var open=nav.classList.toggle('is-open');b.setAttribute('aria-expanded',open);if(open){var r=nav.getBoundingClientRect();menu.style.left=(-r.left)+'px';menu.style.right='auto';menu.style.width=document.documentElement.clientWidth+'px'}});nav.style.position='relative'});
// Entrance animations
var anim=$('.esg-anim');
if('IntersectionObserver' in window){var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('is-in');io.unobserve(e.target)}})},{threshold:.12});anim.forEach(function(e){io.observe(e)})}else anim.forEach(function(e){e.classList.add('is-in')});
// Carousels: arrows, autoplay (paused under the mouse), back to the start at the end
$('.esg-carousel').forEach(function(c){var t=c.querySelector('.esg-carousel-track');if(!t)return;var step=function(d){var max=t.scrollWidth-t.clientWidth,w=t.children[0]?t.children[0].getBoundingClientRect().width+(parseFloat(getComputedStyle(t).columnGap)||0):t.clientWidth,to=t.scrollLeft+d*w;if(d>0&&t.scrollLeft>=max-4)to=0;if(d<0&&t.scrollLeft<=4)to=max;t.scrollTo({left:to,behavior:'smooth'})};var p=c.querySelector('.prev'),n=c.querySelector('.next');if(p)p.addEventListener('click',function(){step(-1)});if(n)n.addEventListener('click',function(){step(1)});var d=+c.getAttribute('data-autoplay');if(d&&!matchMedia('(prefers-reduced-motion: reduce)').matches)setInterval(function(){if(!c.matches(':hover')&&t.scrollWidth>t.clientWidth+4)step(1)},d)});
// Background slideshows
$('.esg-slideshow').forEach(function(s){var imgs=$('img',s),i=0;if(imgs.length<2)return;setInterval(function(){imgs[i].classList.remove('is-on');i=(i+1)%imgs.length;imgs[i].classList.add('is-on')},+s.getAttribute('data-delay')||6000)});
// Photos open large (gallery, carousel)
document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a.esg-zoomable');if(!a)return;e.preventDefault();var box=document.createElement('div');box.className='esg-lightbox';var img=document.createElement('img');img.src=a.getAttribute('href');img.alt='';box.appendChild(img);var close=function(){box.remove();document.removeEventListener('keydown',key)};var key=function(ev){if(ev.key==='Escape')close()};box.addEventListener('click',close);document.addEventListener('keydown',key);document.body.appendChild(box)});
// Contact form: sent without leaving the page
$('form.esg-contact-form').forEach(function(f){var st=f.querySelector('.esg-form-status');f.addEventListener('submit',function(e){e.preventDefault();if(!f.checkValidity()){f.reportValidity();return}var b=f.querySelector('[type=submit]');b.disabled=true;var show=function(ok){st.hidden=false;st.className='esg-form-status'+(ok?'':' is-error');st.textContent=st.getAttribute(ok?'data-sent':'data-failed');b.disabled=false;if(ok)f.reset()};fetch(f.action,{method:'POST',body:new FormData(f),headers:{'X-Requested-With':'fetch'}}).then(function(r){return r.ok?r.json():Promise.reject()}).then(function(j){show(j&&j.ok)}).catch(function(){show(false)})})});
})();`;
