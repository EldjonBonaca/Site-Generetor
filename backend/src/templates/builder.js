/**
 * Template builder: turns a template spec (spec.js) + the data of a site into the Elementor
 * documents of the whole site (5 pages, header, footer, single post template), using only native
 * Elementor widgets (+ the contact form shortcode). Flexbox containers, no third-party addons.
 *
 * Everything that is not marketing copy is decided here and marked "fixed": page titles in the
 * subheaders, menus, service names and links, contact data, copyright. The AI only writes the
 * texts marked with a hint. Each mark is keyed "<elementId>:<settings path>", the same key
 * analyze.js gives to fields (field.ref) and image slots (slot.id):
 *   { fixed }                 value already final (not sent to the AI)
 *   { hint, max, min }        AI field
 *   { share }                 same text on several pages (the 3 reviews of Home and About)
 *   { slot, service }         image slot role: hero | subheader | logo | service_list | photo | gallery
 *
 * Element ids are derived from the page role and the build order, so building the same site
 * twice gives the same ids (field and slot ids stay stable between generation and export).
 */
import crypto from 'node:crypto';
import { telHref } from '../lib/util.js';

/** Image of a template before a project fills it (never left in an exported site). */
export const TEMPLATE_IMAGE = 'https://template.invalid/placeholder.jpg';

export const DOC_ROLES = ['home', 'about', 'services', 'gallery', 'contact', 'single_post', 'header', 'footer'];

/** Fixed labels in the site language (footer columns, contact list). */
const LABELS = {
  it: { links: 'Link', services: 'Servizi', contacts: 'Contatti' },
  en: { links: 'Links', services: 'Services', contacts: 'Contact' },
  es: { links: 'Enlaces', services: 'Servicios', contacts: 'Contacto' },
  fr: { links: 'Liens', services: 'Services', contacts: 'Contact' },
  de: { links: 'Links', services: 'Leistungen', contacts: 'Kontakt' },
  pt: { links: 'Links', services: 'Serviços', contacts: 'Contactos' },
};

const PADDING = { compact: 60, normal: 90, airy: 120 };

const px = (size, unit = 'px') => ({ unit, size });
const sides = (t, r, b, l) => ({ unit: 'px', top: String(t), right: String(r), bottom: String(b), left: String(l), isLinked: false });
const corners = (v) => ({ unit: 'px', top: String(v), right: String(v), bottom: String(v), left: String(v), isLinked: true });
const link = (url) => ({ url, is_external: '', nofollow: '', custom_attributes: '' });
const image = () => ({ url: TEMPLATE_IMAGE, id: '', alt: '', source: 'library' });
const gap = (size) => ({ unit: 'px', size, column: String(size), row: String(size), isLinked: true });
const shadow = { box_shadow_box_shadow_type: 'yes', box_shadow_box_shadow: { horizontal: 0, vertical: 12, blur: 32, spread: 0, color: 'rgba(15,27,45,0.08)' } };
const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Builder of one document: element factories + marks. */
function createDoc(role, spec, site) {
  const { colors: c, fonts, headingWeight, radius, spacing, uppercase } = spec.style;
  const pad = PADDING[spacing] || PADDING.normal;
  const marks = new Map();
  let n = 0;
  const id = () => crypto.createHash('md5').update(`${role}:${n++}`).digest('hex').slice(0, 7);
  const mark = (el, path, info) => {
    const key = `${el.id}:${path}`;
    marks.set(key, { ...(marks.get(key) || {}), ...info });
  };
  /** opts.fixed -> final value; otherwise an AI field with opts.hint / max / min / share. */
  const field = (el, path, opts = {}) => {
    if (opts.fixed) return mark(el, path, { fixed: true });
    mark(el, path, { hint: opts.hint, max: opts.max, min: opts.min, share: opts.share });
  };
  const typo = (prefix, family, size, weight, extra = {}) => ({
    [`${prefix}typography_typography`]: 'custom',
    [`${prefix}typography_font_family`]: family,
    [`${prefix}typography_font_size`]: px(size),
    [`${prefix}typography_font_weight`]: String(weight),
    ...extra,
  });
  const widget = (widgetType, settings) => ({ id: id(), elType: 'widget', widgetType, settings, elements: [] });

  // --- containers -------------------------------------------------------------------------
  /** Top-level section. o: { bg, slot, overlay, opacity, minHeight, row, align, justify, padY, full, gap } */
  const section = (elements, o = {}) => {
    const py = o.padY ?? pad;
    const settings = {
      content_width: o.full ? 'full' : 'boxed',
      boxed_width: px(1200),
      flex_direction: o.row ? 'row' : 'column',
      flex_wrap: o.row ? 'wrap' : 'nowrap',
      flex_gap: gap(o.gap ?? 24),
      flex_align_items: o.align || (o.row ? 'center' : 'stretch'),
      flex_justify_content: o.justify || (o.row ? 'space-between' : 'center'),
      padding: o.full ? sides(0, 0, 0, 0) : sides(py, 20, py, 20),
      padding_mobile: o.full ? sides(0, 0, 0, 0) : sides(Math.round(py * 0.6), 16, Math.round(py * 0.6), 16),
    };
    if (o.minHeight) settings.min_height = px(o.minHeight, 'vh');
    if (o.bg || o.slot) Object.assign(settings, { background_background: 'classic', background_color: o.bg || c.dark });
    if (o.slot) Object.assign(settings, { background_image: image(), background_position: 'center center', background_size: 'cover', background_repeat: 'no-repeat' });
    if (o.overlay) Object.assign(settings, { background_overlay_background: 'classic', background_overlay_color: o.overlay, background_overlay_opacity: px(o.opacity ?? 0.6) });
    const el = { id: id(), elType: 'container', isInner: false, settings, elements };
    if (o.slot) mark(el, 'background_image', { slot: o.slot });
    return el;
  };
  /** Inner container (column / card / row). o: { width, tablet, row, align, justify, bg, card, gap, pad } */
  const box = (elements, o = {}) => {
    const settings = {
      content_width: 'full',
      flex_direction: o.row ? 'row' : 'column',
      flex_wrap: o.row ? 'wrap' : 'nowrap',
      flex_gap: gap(o.gap ?? 16),
      flex_align_items: o.align || (o.row ? 'center' : 'stretch'),
      flex_justify_content: o.justify || 'flex-start',
    };
    if (o.width) Object.assign(settings, { width: px(o.width, '%'), width_tablet: px(o.tablet ?? (o.width < 45 ? 48 : 100), '%'), width_mobile: px(100, '%') });
    if (o.bg || o.card) Object.assign(settings, { background_background: 'classic', background_color: o.bg || '#FFFFFF' });
    if (o.card) Object.assign(settings, { border_radius: corners(radius), padding: sides(o.pad ?? 32, o.pad ?? 28, o.pad ?? 32, o.pad ?? 28), ...shadow });
    return { id: id(), elType: 'container', isInner: true, settings, elements };
  };
  const columns = (count) => ({ 1: 100, 2: 48, 3: 31, 4: 22.5 })[Math.min(4, Math.max(1, count))];

  // --- widgets ----------------------------------------------------------------------------
  const heading = (text, o = {}) => {
    const size = o.size || 36;
    const el = widget('heading', {
      title: text,
      header_size: o.tag || 'h2',
      align: o.align || 'left',
      title_color: o.color || c.heading,
      ...typo('', fonts.heading, size, o.weight || headingWeight, {
        typography_font_size_mobile: px(Math.max(18, Math.round(size * 0.72))),
        typography_line_height: px(1.2, 'em'),
        ...(o.upper ? { typography_text_transform: 'uppercase', typography_letter_spacing: px(1.5) } : {}),
      }),
    });
    field(el, 'title', o);
    return el;
  };
  const kicker = (text, o = {}) => heading(text, { tag: 'p', size: 14, weight: '600', color: o.color || c.secondary, upper: true, ...o });
  const text = (html, o = {}) => {
    const el = widget('text-editor', {
      editor: /^\s*</.test(html) ? html : `<p>${escapeHtml(html)}</p>`,
      align: o.align || 'left',
      text_color: o.color || c.text,
      ...typo('', fonts.body, o.size || 17, '400', { typography_line_height: px(1.7, 'em') }),
    });
    field(el, 'editor', o);
    return el;
  };
  const button = (label, url, o = {}) => {
    const variant = o.variant || 'primary';
    const bg = { primary: c.primary, secondary: c.secondary, light: '#FFFFFF', outline: 'rgba(0,0,0,0)' }[variant];
    const fg = { primary: '#FFFFFF', secondary: c.dark, light: c.primary, outline: o.outlineColor || '#FFFFFF' }[variant];
    const el = widget('button', {
      text: label,
      link: link(url),
      align: o.align || 'left',
      background_color: bg,
      button_text_color: fg,
      hover_color: fg,
      button_background_hover_color: variant === 'primary' ? c.dark : variant === 'secondary' ? c.primary : bg,
      border_radius: corners(radius),
      text_padding: sides(15, 30, 15, 30),
      ...(variant === 'outline' ? { border_border: 'solid', border_width: corners(2), border_color: fg } : {}),
      ...typo('', fonts.body, 15, '600', uppercase ? { typography_text_transform: 'uppercase', typography_letter_spacing: px(1) } : {}),
    });
    field(el, 'text', o);
    // tel:/mailto: links are not link fields (analyze.js); site links are decided here
    if (!/^(tel|mailto):/.test(url)) mark(el, 'link.url', { fixed: true });
    return el;
  };
  const picture = (slot, o = {}) => {
    const el = widget('image', {
      image: image(),
      image_size: o.size || 'large',
      align: o.align || 'center',
      ...(o.width ? { width: px(o.width) } : {}),
      ...(o.round !== false ? { image_border_radius: corners(radius) } : {}),
    });
    mark(el, 'image', { slot });
    return el;
  };
  /** icon list. items: [{ text, url?, icon? }] (all fixed), o: { inline, align, color, iconColor, size } */
  const iconList = (items, o = {}) => {
    const el = widget('icon-list', {
      view: o.inline ? 'inline' : 'traditional',
      icon_list: items.map((it) => ({
        _id: id(),
        text: it.text,
        selected_icon: it.icon ? { value: it.icon, library: 'fa-solid' } : { value: '', library: '' },
        ...(it.url ? { link: link(it.url) } : {}),
      })),
      icon_align: o.align || 'left',
      space_between: px(o.inline ? 28 : 10),
      icon_color: o.iconColor || c.secondary,
      text_color: o.color || c.text,
      text_color_hover: o.hover || c.secondary,
      ...typo('icon_', fonts.body, o.size || 16, o.weight || '400'),
    });
    items.forEach((it, i) => {
      mark(el, `icon_list.${i}.text`, { fixed: true });
      if (it.url && !/^(tel|mailto):/.test(it.url)) mark(el, `icon_list.${i}.link.url`, { fixed: true });
    });
    return el;
  };
  const iconBox = (icon, title, desc, o = {}) => {
    const el = widget('icon-box', {
      selected_icon: { value: icon, library: 'fa-solid' },
      view: 'stacked',
      shape: 'circle',
      position: 'top',
      text_align: o.align || 'center',
      title_size: 'h3',
      primary_color: c.primary,
      secondary_color: '#FFFFFF',
      icon_size: px(26),
      icon_padding: px(18),
      title_color: o.titleColor || c.heading,
      description_color: o.textColor || c.text,
      ...typo('title_', fonts.heading, 20, headingWeight),
      ...typo('description_', fonts.body, 15, '400'),
    });
    field(el, 'title_text', { hint: o.titleHint, max: 50 });
    field(el, 'description_text', { hint: o.textHint, max: 170 });
    return el;
  };
  const serviceCard = (service, index, desc, o = {}) => {
    const el = widget('image-box', {
      image: image(),
      thumbnail_size: 'medium_large',
      image_size: px(100, '%'),
      image_space: px(18),
      image_border_radius: corners(radius),
      position: 'top',
      text_align: 'left',
      title_text: service.name,
      description_text: desc,
      link: link(service.url),
      title_size: 'h3',
      title_color: c.heading,
      description_color: c.text,
      ...typo('title_', fonts.heading, 21, headingWeight),
      ...typo('description_', fonts.body, 15, '400'),
    });
    mark(el, 'image', { slot: 'service_list', service: index });
    mark(el, 'title_text', { fixed: true });
    mark(el, 'link.url', { fixed: true });
    field(el, 'description_text', { hint: `short description of the service "${service.name}" for its card (1–2 sentences)`, max: 170, ...o });
    return el;
  };
  const review = (r, i, o = {}) => {
    const stars = widget('star-rating', { rating_scale: '5', rating: '5', star_style: 'star_fontawesome', stars_color: c.secondary, align: 'center' });
    const el = widget('testimonial', {
      testimonial_content: r.text,
      testimonial_name: r.name,
      testimonial_job: r.role,
      testimonial_alignment: 'center',
      content_content_color: o.color || c.text,
      name_text_color: o.nameColor || c.heading,
      job_text_color: c.secondary,
      ...typo('content_', fonts.body, 16, '400', { content_typography_font_style: 'italic' }),
      ...typo('name_', fonts.heading, 17, headingWeight),
      ...typo('job_', fonts.body, 14, '400'),
    });
    field(el, 'testimonial_content', { hint: `customer review ${i + 1} of 3: realistic, 2–3 sentences, about a different aspect than the other reviews (quality, punctuality, value for money, assistance…)`, max: 300, share: `review${i + 1}.content` });
    field(el, 'testimonial_name', { hint: `first name and surname of the customer of review ${i + 1} (fictional, typical of the site country)`, max: 40, share: `review${i + 1}.name` });
    field(el, 'testimonial_job', { hint: `role or city of the customer of review ${i + 1}`, max: 40, share: `review${i + 1}.job` });
    return [stars, el];
  };
  const shortcode = (code) => widget('shortcode', { shortcode: code });
  const html = (code) => widget('html', { html: code });

  return { c, fonts, pad, radius, marks, mark, section, box, columns, heading, kicker, text, button, picture, iconList, iconBox, serviceCard, review, shortcode, html, widget, typo };
}

// ---------------------------------------------------------------------------------------------
// Shared sections
// ---------------------------------------------------------------------------------------------

function subheader(b, site, role) {
  return b.section(
    [
      b.heading(site.pages[role].title, { tag: 'h1', size: 48, color: '#FFFFFF', align: 'center', fixed: true }),
      b.text(b.spec.copy.subheaderText, { color: 'rgba(255,255,255,0.88)', align: 'center', hint: `short sentence under the title "${site.pages[role].title}" in the page banner`, max: 140 }),
    ],
    { slot: 'subheader', overlay: b.c.dark, opacity: 0.62, padY: Math.round(b.pad * 1.2), align: 'center' }
  );
}

function features(b) {
  const { copy, icons, layout } = b.spec;
  const cards = layout.features === 'cards';
  const items = copy.features.map((f, i) => {
    const ib = b.iconBox(icons[i], f.title, f.text, { titleHint: `strength ${i + 1} of 4 of the business (short title)`, textHint: `explanation of strength ${i + 1} (1–2 sentences)` });
    return b.box([ib], { width: b.columns(4), card: cards, pad: 28 });
  });
  return b.section(
    [
      b.heading(copy.featuresTitle, { align: 'center', color: cards ? '#FFFFFF' : undefined, hint: '"Why choose us" section title', max: 60 }),
      b.text(copy.featuresText, { align: 'center', color: cards ? 'rgba(255,255,255,0.85)' : undefined, hint: 'intro of the "why choose us" section (1 sentence)', max: 200 }),
      b.box(items, { row: true, gap: 24, align: 'stretch', justify: 'space-between' }),
    ],
    cards ? { slot: 'photo', overlay: b.c.dark, opacity: 0.82 } : { bg: b.c.background }
  );
}

function cta(b, site) {
  const { copy, layout } = b.spec;
  if (layout.cta === 'none') return null;
  const title = b.heading(copy.ctaTitle, { color: '#FFFFFF', align: layout.cta === 'banner' ? 'center' : 'left', hint: 'call to action title: invite to contact the business', max: 80 });
  const body = b.text(copy.ctaText, { color: 'rgba(255,255,255,0.9)', align: layout.cta === 'banner' ? 'center' : 'left', hint: 'call to action text (1–2 sentences)', max: 200 });
  const btn = b.button(copy.ctaButton, site.pages.contact.url, { variant: 'secondary', align: layout.cta === 'banner' ? 'center' : 'right', hint: 'call to action button text (leads to the contact page)', max: 30 });
  if (layout.cta === 'banner') return b.section([title, body, btn], { slot: 'photo', overlay: b.c.primary, opacity: 0.86, align: 'center' });
  return b.section([b.box([title, body], { width: 65 }), b.box([btn], { width: 30, align: 'flex-end' })], { row: true, bg: b.c.primary, padY: Math.round(b.pad * 0.7) });
}

function reviews(b) {
  const { copy, layout } = b.spec;
  const cards = layout.testimonials === 'cards';
  return b.section(
    [
      b.heading(copy.reviewsTitle, { align: 'center', hint: 'title of the customer reviews section', max: 60 }),
      b.box(
        copy.reviews.map((r, i) => b.box(b.review(r, i), { width: b.columns(3), card: cards, gap: 10, tablet: 100 })),
        { row: true, gap: 24, align: 'stretch', justify: 'space-between' }
      ),
    ],
    { bg: cards ? b.c.background : '#FFFFFF' }
  );
}

/** Image + text row (about teaser, story, mission). */
function mediaRow(b, imageFirst, content, o = {}) {
  const img = b.box([b.picture('photo')], { width: 46 });
  const txt = b.box(content, { width: 48, gap: 14 });
  return b.section(imageFirst ? [img, txt] : [txt, img], { row: true, bg: o.bg });
}

// ---------------------------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------------------------

function home(b, site) {
  const { copy, layout } = b.spec;
  const out = [];
  const tel = `tel:${telHref(site.phone)}`;

  // 1. Hero
  const heroLeft = layout.hero !== 'center';
  const align = heroLeft ? 'left' : 'center';
  const onImage = layout.hero !== 'split';
  const heroText = [
    b.kicker(copy.heroKicker, { align, hint: 'short tagline above the main title', max: 50 }),
    b.heading(copy.heroTitle, { tag: 'h1', size: 54, align, color: onImage ? '#FFFFFF' : undefined, hint: 'main title of the site (H1): the promise of the business, with its activity and city', max: 80 }),
    b.text(copy.heroText, { align, color: onImage ? 'rgba(255,255,255,0.9)' : undefined, size: 19, hint: 'hero subtitle (1–2 sentences)', max: 200 }),
    b.box(
      [
        b.button(copy.heroButton, site.pages.contact.url, { variant: 'secondary', hint: 'main hero button (leads to the contact page)', max: 30 }),
        b.button(copy.heroButton2, tel, { variant: 'outline', outlineColor: onImage ? '#FFFFFF' : b.c.primary, hint: 'second hero button: call the business by phone', max: 30 }),
      ],
      { row: true, gap: 14, justify: heroLeft ? 'flex-start' : 'center' }
    ),
  ];
  if (layout.hero === 'split') {
    out.push(b.section([b.box(heroText, { width: 50, gap: 18 }), b.box([b.picture('hero')], { width: 46 })], { row: true, bg: b.c.background, minHeight: 75 }));
  } else {
    out.push(
      b.section([b.box(heroText, { width: heroLeft ? 62 : 100, gap: 18, align: heroLeft ? 'flex-start' : 'center' })], {
        slot: 'hero',
        overlay: b.c.dark,
        opacity: 0.55,
        minHeight: 85,
        align: heroLeft ? 'flex-start' : 'center',
      })
    );
  }

  // 2. About teaser
  out.push(
    mediaRow(b, layout.about === 'image-left', [
      b.kicker(copy.aboutKicker, { hint: 'small label of the "about us" section', max: 30 }),
      b.heading(copy.aboutTitle, { hint: '"About us" section title', max: 70 }),
      b.text(copy.aboutText, { hint: 'short presentation of the business (2–4 sentences)', max: 600 }),
      b.button(copy.aboutButton, site.pages.about.url, { hint: 'button "Scopri di più" leading to the About page', max: 30 }),
    ])
  );

  // 3. Why choose us, 4. call to action
  out.push(features(b));
  const action = cta(b, site);
  if (action) out.push(action);

  // 5. Featured services (max 3) + "all services"
  if (site.services.length) {
    const shown = site.services.slice(0, 3);
    const boxed = layout.services === 'boxed';
    out.push(
      b.section(
        [
          b.kicker(copy.servicesKicker, { align: 'center', hint: 'small label of the services section', max: 30 }),
          b.heading(copy.servicesTitle, { align: 'center', hint: 'title of the featured services section', max: 60 }),
          b.text(copy.servicesText, { align: 'center', hint: 'intro of the services section (1 sentence)', max: 200 }),
          b.box(shown.map((s, i) => b.box([b.serviceCard(s, i, copy.serviceText)], { width: b.columns(shown.length), card: boxed, pad: 22 })), { row: true, gap: 24, align: 'stretch', justify: shown.length < 3 ? 'center' : 'space-between' }),
          b.button(copy.servicesButton, site.pages.services.url, { align: 'center', hint: 'button "Tutti i servizi" leading to the Services page', max: 30 }),
        ],
        { bg: boxed ? b.c.background : '#FFFFFF' }
      )
    );
  }

  // 6. Reviews
  out.push(reviews(b));
  return out;
}

function about(b, site) {
  const { copy, layout } = b.spec;
  const left = layout.about === 'image-left';
  const out = [
    subheader(b, site, 'about'),
    mediaRow(b, left, [
      b.heading(copy.storyTitle, { hint: 'title of the extended "about us": history of the business', max: 70 }),
      b.text(copy.storyText, { hint: 'history and experience of the business (2 paragraphs)', max: 1000, min: 250 }),
    ]),
    mediaRow(
      b,
      !left,
      [
        b.heading(copy.missionTitle, { hint: 'title about mission and values', max: 70 }),
        b.text(copy.missionText, { hint: 'mission and values of the business (1–2 paragraphs, may use a short list)', max: 800, min: 150 }),
      ],
      { bg: b.c.background }
    ),
    features(b),
  ];
  const action = cta(b, site);
  if (action) out.push(action);
  out.push(reviews(b));
  return out;
}

function services(b, site) {
  const out = [subheader(b, site, 'services')];
  if (site.services.length) {
    const boxed = b.spec.layout.services === 'boxed';
    out.push(
      b.section([b.box(site.services.map((s, i) => b.box([b.serviceCard(s, i, b.spec.copy.serviceText, { hint: `short excerpt of the article about "${s.name}" for the services grid (1–2 sentences)` })], { width: b.columns(3), card: boxed, pad: 22 })), { row: true, gap: 30, align: 'stretch', justify: 'flex-start' })], {
        bg: boxed ? b.c.background : '#FFFFFF',
      })
    );
  }
  return out;
}

function gallery(b, site) {
  const el = b.widget('image-gallery', {
    wp_gallery: [image()],
    thumbnail_size: 'medium_large',
    gallery_columns: b.spec.layout.gallery,
    gallery_columns_mobile: '2',
    gallery_link: 'file',
    open_lightbox: 'yes',
    image_spacing: 'custom',
    image_spacing_custom: px(14),
    image_border_radius: corners(b.radius),
  });
  b.mark(el, 'wp_gallery', { slot: 'gallery' });
  return [subheader(b, site, 'gallery'), b.section([el])];
}

function contactItems(site) {
  return [
    { text: site.phone, url: `tel:${telHref(site.phone)}`, icon: 'fas fa-phone-alt' },
    { text: site.email, url: `mailto:${site.email}`, icon: 'fas fa-envelope' },
    { text: site.address, icon: 'fas fa-map-marker-alt' },
  ].filter((i) => i.text);
}

function contact(b, site) {
  const { copy, layout } = b.spec;
  const intro = [
    b.heading(copy.contactTitle, { align: layout.contact === 'stacked' ? 'center' : 'left', hint: 'title of the contact details section', max: 60 }),
    b.text(copy.contactText, { align: layout.contact === 'stacked' ? 'center' : 'left', hint: 'invitation to contact the business (1–2 sentences)', max: 300 }),
  ];
  const form = [b.heading(copy.formTitle, { size: 26, hint: 'title above the contact form', max: 60 }), b.shortcode(site.contactShortcode)];
  const out = [subheader(b, site, 'contact')];
  if (layout.contact === 'stacked') {
    out.push(
      b.section([...intro, b.iconList(contactItems(site), { inline: true, align: 'center', size: 17 }), b.box(form, { card: true, width: 100, tablet: 100 })], { bg: b.c.background, align: 'center' })
    );
  } else {
    out.push(b.section([b.box([...intro, b.iconList(contactItems(site), { size: 17 })], { width: 42, gap: 18 }), b.box(form, { width: 52, card: true })], { row: true, bg: b.c.background, align: 'flex-start' }));
  }
  if (site.mapEmbed && site.address) {
    out.push(
      b.section(
        [
          b.html(
            `<iframe src="https://www.google.com/maps?q=${encodeURIComponent(site.address)}&output=embed" width="100%" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`
          ),
        ],
        { full: true, gap: 0 }
      )
    );
  }
  return out;
}

function singlePost(b, site) {
  const { copy } = b.spec;
  return [
    b.section(
      [
        b.widget('theme-post-featured-image', { image_size: 'large', image_border_radius: corners(b.radius) }),
        b.widget('theme-post-title', { header_size: 'h1', title_color: b.c.heading, ...b.typo('', b.fonts.heading, 40, b.spec.style.headingWeight) }),
        b.widget('theme-post-content', { text_color: b.c.text, ...b.typo('', b.fonts.body, 17, '400') }),
        b.box(
          [
            b.heading(copy.postCtaTitle, { size: 26, hint: 'call to action at the end of every service article', max: 70 }),
            b.text(copy.postCtaText, { hint: 'call to action text at the end of the articles (1 sentence)', max: 200 }),
            b.button(copy.postCtaButton, site.pages.contact.url, { hint: 'button leading to the contact page', max: 30 }),
          ],
          { card: true, bg: b.c.background, gap: 14 }
        ),
      ],
      { gap: 28 }
    ),
  ];
}

const menuItems = (site) => ['home', 'about', 'services', 'gallery', 'contact'].map((r) => ({ text: site.pages[r].title, url: site.pages[r].url }));

/** Logo image, or the site name when the project has no logo. */
function brand(b, site, o = {}) {
  if (site.hasLogo) return b.picture('logo', { width: o.width || 180, align: o.align || 'left', size: 'medium', round: false });
  return b.heading(site.siteName, { tag: 'p', size: 24, align: o.align || 'left', color: o.color || b.c.primary, fixed: true });
}

function header(b, site) {
  const { copy, layout } = b.spec;
  const out = [];
  if (layout.header === 'topbar') {
    out.push(
      b.section([b.iconList(contactItems(site).slice(0, 2), { inline: true, color: '#FFFFFF', iconColor: b.c.secondary, size: 14 })], { row: true, bg: b.c.dark, padY: 8, justify: 'flex-end' })
    );
  }
  if (layout.header === 'centered') {
    out.push(b.section([brand(b, site, { align: 'center' }), b.iconList(menuItems(site), { inline: true, align: 'center', color: b.c.heading, weight: '600' })], { bg: '#FFFFFF', padY: 18, align: 'center', gap: 14 }));
    return out;
  }
  out.push(
    b.section(
      [
        b.box([brand(b, site)], { width: 22, tablet: 40 }),
        b.box([b.iconList(menuItems(site), { inline: true, align: 'center', color: b.c.heading, weight: '600' })], { width: 54, tablet: 100 }),
        b.box([b.button(copy.headerButton, site.pages.contact.url, { align: 'right', hint: 'header button leading to the contact page', max: 25 })], { width: 20, tablet: 40, align: 'flex-end' }),
      ],
      { row: true, bg: '#FFFFFF', padY: 16 }
    )
  );
  return out;
}

function footer(b, site) {
  const dark = b.spec.layout.footer === 'dark';
  const color = dark ? 'rgba(255,255,255,0.8)' : b.c.text;
  const titleColor = dark ? '#FFFFFF' : b.c.heading;
  const L = LABELS[site.lang] || LABELS.en;
  const colTitle = (t) => b.heading(t, { tag: 'h4', size: 18, color: titleColor, fixed: true });
  const cols = [
    b.box([brand(b, site, { color: titleColor })], { width: 22 }),
    b.box([colTitle(L.links), b.iconList(menuItems(site), { color })], { width: 22 }),
  ];
  if (site.services.length) cols.push(b.box([colTitle(L.services), b.iconList(site.services.map((s) => ({ text: s.name, url: s.url })), { color })], { width: 22 }));
  cols.push(b.box([colTitle(L.contacts), b.iconList(contactItems(site), { color })], { width: 22 }));
  return [
    b.section(cols, { row: true, bg: dark ? b.c.dark : b.c.background, align: 'flex-start', padY: Math.round(b.pad * 0.8) }),
    b.section([b.text(`<p>${escapeHtml(site.copyright)}</p>`, { align: 'center', size: 14, color, fixed: true })], { bg: dark ? b.c.dark : b.c.background, padY: 18 }),
  ];
}

const BUILDERS = { home, about, services, gallery, contact, single_post: singlePost, header, footer };
const DOC_TYPES = { header: 'header', footer: 'footer', single_post: 'single-post' };

/** Elementor global colors and fonts (merged into the active Elementor kit by the WordPress plugin). */
export function globalStyles(spec) {
  const { colors, fonts, headingWeight } = spec.style;
  const font = (_id, title, family, weight) => ({ _id, title, typography_typography: 'custom', typography_font_family: family, typography_font_weight: weight });
  return {
    system_colors: [
      { _id: 'primary', title: 'Primary', color: colors.primary },
      { _id: 'secondary', title: 'Secondary', color: colors.secondary },
      { _id: 'text', title: 'Text', color: colors.text },
      { _id: 'accent', title: 'Accent', color: colors.accent },
    ],
    system_typography: [
      font('primary', 'Primary', fonts.heading, headingWeight),
      font('secondary', 'Secondary', fonts.heading, '600'),
      font('text', 'Text', fonts.body, '400'),
      font('accent', 'Accent', fonts.body, '600'),
    ],
  };
}

/**
 * Build every document of a site.
 * @param {object} spec  sanitized template spec
 * @param {object} site  { lang, siteName, phone, email, address, copyright, hasLogo, mapEmbed, contactShortcode,
 *                         pages: { home|about|services|gallery|contact: { title, url } }, services: [{ name, url }] }
 * @returns {{ docs: Record<role, { doc, marks: Map }>, globalStyles }}
 */
export function buildSite(spec, site) {
  const docs = {};
  for (const role of DOC_ROLES) {
    const b = createDoc(role, spec, site);
    b.spec = spec;
    const content = BUILDERS[role](b, site);
    docs[role] = {
      doc: { version: '0.4', title: role, type: DOC_TYPES[role] || 'page', content, page_settings: role in DOC_TYPES ? {} : { hide_title: 'yes' } },
      marks: b.marks,
    };
  }
  return { docs, globalStyles: globalStyles(spec) };
}
