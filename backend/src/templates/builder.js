/**
 * Template builder: turns a template spec (spec.js) + the data of a site into the Elementor
 * documents of the whole site (5 pages, header, footer, single post template), using only native
 * Elementor widgets (+ the contact form shortcode). Flexbox containers, no third-party addons.
 *
 * The spec decides the visual identity: palette and fonts, the look of the whole site
 * (spec.style: light / dark theme, button corners, card style, title style and alignment, title
 * size, image treatment, title case), the layout of every section (spec.layout) and the sections
 * of the Home page and their order (spec.sections).
 *
 * The single post template (Elementor Pro theme template, dynamic) is also turned into one static
 * Elementor document per service article (articleDoc), so the articles have the same design with
 * or without Elementor Pro.
 *
 * Everything that is not marketing copy is decided here and marked "fixed": page titles in the
 * subheaders, menus, service names and links, contact data, copyright. The AI only writes the
 * texts marked with a hint. Each mark is keyed "<elementId>:<settings path>", the same key
 * analyze.js gives to fields (field.ref) and image slots (slot.id):
 *   { fixed }                 value already final (not sent to the AI)
 *   { hint, max, min }        AI field
 *   { share }                 same text on several pages (the 3 reviews of Home and About)
 *   { slot, service }         image slot role: hero | subheader | logo | service_list | photo | gallery | carousel
 *
 * Every text widget gets its text (sample copy of the template or final data): an empty setting
 * would show the Elementor default ("Lorem ipsum…") and would never be given to the AI.
 *
 * Element ids are derived from the page role and the build order, so building the same site
 * twice gives the same ids (field and slot ids stay stable between generation and export).
 */
import crypto from 'node:crypto';
import { telHref } from '../lib/util.js';
import { DEFAULT_SECTIONS, mix, rgba, siteColors, tint } from './spec.js';

/** Image of a template before a project fills it (never left in an exported site). */
export const TEMPLATE_IMAGE = 'https://template.invalid/placeholder.jpg';

/**
 * Version of the generated structure. Field ids depend on it: a generation made with another
 * version cannot be exported (exporter.js), it has to be generated again.
 */
export const BUILDER_VERSION = 5;

export const DOC_ROLES = ['home', 'about', 'services', 'gallery', 'contact', 'single_post', 'header', 'footer'];

/** Fixed labels in the site language. */
const LABELS = {
  it: { menu: 'Menu', links: 'Link', services: 'Servizi', contacts: 'Contatti', about: 'Chi siamo', readMore: 'Scopri di più', phone: 'Telefono', email: 'Email', address: 'Indirizzo', otherServices: 'Altri servizi' },
  en: { menu: 'Menu', links: 'Links', services: 'Services', contacts: 'Contact', about: 'About us', readMore: 'Read more', phone: 'Phone', email: 'Email', address: 'Address', otherServices: 'Other services' },
  es: { menu: 'Menú', links: 'Enlaces', services: 'Servicios', contacts: 'Contacto', about: 'Quiénes somos', readMore: 'Leer más', phone: 'Teléfono', email: 'Email', address: 'Dirección', otherServices: 'Otros servicios' },
  fr: { menu: 'Menu', links: 'Liens', services: 'Services', contacts: 'Contact', about: 'Qui sommes-nous', readMore: 'En savoir plus', phone: 'Téléphone', email: 'E-mail', address: 'Adresse', otherServices: 'Autres services' },
  de: { menu: 'Menü', links: 'Links', services: 'Leistungen', contacts: 'Kontakt', about: 'Über uns', readMore: 'Mehr erfahren', phone: 'Telefon', email: 'E-Mail', address: 'Adresse', otherServices: 'Weitere Leistungen' },
  pt: { menu: 'Menu', links: 'Links', services: 'Serviços', contacts: 'Contactos', about: 'Quem somos', readMore: 'Saiba mais', phone: 'Telefone', email: 'Email', address: 'Morada', otherServices: 'Outros serviços' },
};

const PADDING = { compact: 64, normal: 96, airy: 128 };
const SCALE = { normal: 1, large: 1.12, xl: 1.28 };

const px = (size, unit = 'px') => ({ unit, size });
const sides = (t, r, b, l) => ({ unit: 'px', top: String(t), right: String(r), bottom: String(b), left: String(l), isLinked: false });
const corners = (v) => ({ unit: 'px', top: String(v), right: String(v), bottom: String(v), left: String(v), isLinked: true });
const link = (url) => ({ url, is_external: '', nofollow: '', custom_attributes: '' });
const image = () => ({ url: TEMPLATE_IMAGE, id: '', alt: '', source: 'library' });
const gap = (size) => ({ unit: 'px', size, column: String(size), row: String(size), isLinked: true });
const boxShadow = (vertical, blur, alpha) => ({ horizontal: 0, vertical, blur, spread: 0, color: `rgba(15,27,45,${alpha})` });
const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const isContactLink = (url) => /^(tel|mailto):/.test(url);

/**
 * Colors of the page surfaces for the theme of the template:
 *   bg / alt   main and alternate section backgrounds
 *   card/tint  card backgrounds (white or raised / tinted)
 *   heading, text, kicker, border, iconBg, icon
 */
function surfaces(c, dark) {
  if (dark) {
    return {
      dark: true,
      bg: c.dark,
      alt: mix(c.dark, '#FFFFFF', 0.04),
      card: mix(c.dark, '#FFFFFF', 0.07),
      tint: mix(c.dark, c.primary, 0.3),
      heading: '#FFFFFF',
      text: 'rgba(255,255,255,0.74)',
      kicker: c.secondary,
      border: 'rgba(255,255,255,0.14)',
      iconBg: rgba(c.secondary, 0.16),
      icon: c.secondary,
    };
  }
  return {
    dark: false,
    bg: '#FFFFFF',
    alt: c.background,
    card: '#FFFFFF',
    tint: tint(c.primary, 0.93),
    heading: c.heading,
    text: c.text,
    kicker: c.primaryText,
    border: tint(c.heading, 0.86),
    iconBg: tint(c.primary, 0.86),
    icon: c.primaryText,
  };
}

/** Builder of one document: element factories + marks. */
function createDoc(role, spec, site) {
  const st = spec.style;
  const { fonts, headingWeight, radius } = st;
  const c = siteColors(st.colors);
  const ink = surfaces(c, st.theme === 'dark');
  const pad = PADDING[st.spacing] || PADDING.normal;
  const scale = SCALE[st.scale] || 1;
  const btnRadius = st.buttons === 'pill' ? 50 : st.buttons === 'square' ? 0 : radius;
  const imgRadius = st.images === 'rounded' ? Math.max(radius, 6) : 0;
  const cardRadius = st.buttons === 'square' && st.images !== 'rounded' ? Math.min(radius, 2) : radius;
  // Main buttons: primary color on light pages, the brighter secondary color on dark pages
  const mainButton = ink.dark ? 'secondary' : 'primary';
  const L = LABELS[site.lang] || LABELS.en;
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
  /** Entrance animation (free Elementor motion effect), delayed to reveal cards one after the other. */
  const animate = (settings, delay = 0) => Object.assign(settings, { animation: 'fadeInUp', ...(delay ? { animation_delay: delay } : {}) });
  const background = (o) => {
    if (o.gradient) {
      const [from, to, angle = 135] = o.gradient;
      return { background_background: 'gradient', background_color: from, background_color_b: to, background_gradient_type: 'linear', background_gradient_angle: px(angle, 'deg') };
    }
    return o.bg ? { background_background: 'classic', background_color: o.bg } : {};
  };
  /**
   * Photo background + gradient overlay [from, to, angle]: an image slot (o.slot), or the featured
   * image of the post (o.dynamicBg, Elementor Pro dynamic tag; articleDoc() makes it static).
   */
  const photo = (settings, el, o) => {
    Object.assign(settings, { background_background: 'classic', background_color: c.dark, background_image: o.dynamicBg ? { url: '', id: '' } : image(), background_position: 'center center', background_size: 'cover', background_repeat: 'no-repeat' });
    if (o.dynamicBg) settings.__dynamic__ = { background_image: `[elementor-tag id="${id()}" name="post-featured-image" settings="%7B%7D"]` };
    if (o.overlay) {
      const [from, to, angle = 180] = o.overlay;
      Object.assign(settings, {
        background_overlay_background: 'gradient',
        background_overlay_color: from,
        background_overlay_color_b: to,
        background_overlay_gradient_type: 'linear',
        background_overlay_gradient_angle: px(angle, 'deg'),
        background_overlay_opacity: px(1),
      });
    }
    if (o.slot) mark(el, 'background_image', { slot: o.slot, ...(o.service !== undefined ? { service: o.service } : {}) });
  };

  // --- containers -------------------------------------------------------------------------
  /**
   * Top-level section. o: { bg, gradient, slot, overlay: [from, to, angle], minHeight, row, wrap (false: one line), align, justify, padY,
   * full, gap, width, divider: { shape, color }, shadow, borderTop, borderBottom }
   */
  const section = (elements, o = {}) => {
    const py = o.padY ?? pad;
    const settings = {
      content_width: o.full ? 'full' : 'boxed',
      boxed_width: px(o.width || 1200),
      flex_direction: o.row ? 'row' : 'column',
      flex_wrap: o.row && o.wrap !== false ? 'wrap' : 'nowrap',
      flex_gap: gap(o.gap ?? 28),
      flex_align_items: o.align || (o.row ? 'center' : 'stretch'),
      flex_justify_content: o.justify || (o.row ? 'space-between' : 'center'),
      padding: o.full ? sides(0, 0, 0, 0) : sides(py, 20, o.padBottom ?? py, 20),
      padding_mobile: o.full ? sides(0, 0, 0, 0) : sides(Math.round(py * 0.6), 16, Math.round((o.padBottom ?? py) * 0.6), 16),
      ...background(o),
    };
    if (o.minHeight) settings.min_height = px(o.minHeight, 'vh');
    const el = { id: id(), elType: 'container', isInner: false, settings, elements };
    if (o.slot || o.dynamicBg) photo(settings, el, o);
    if (o.css) settings.css_classes = o.css;
    if (o.divider && o.divider.shape !== 'none') {
      Object.assign(settings, {
        shape_divider_bottom: o.divider.shape,
        shape_divider_bottom_color: o.divider.color,
        shape_divider_bottom_width: px(100, '%'),
        shape_divider_bottom_height: px(o.divider.shape === 'waves' ? 60 : 70),
        shape_divider_bottom_height_mobile: px(28),
      });
    }
    if (o.shadow) Object.assign(settings, { box_shadow_box_shadow_type: 'yes', box_shadow_box_shadow: boxShadow(2, 18, 0.08), z_index: 10 });
    if (o.borderTop) Object.assign(settings, { border_border: 'solid', border_width: sides(1, 0, 0, 0), border_color: o.borderTop });
    if (o.borderBottom) Object.assign(settings, { border_border: 'solid', border_width: sides(0, 0, 1, 0), border_color: o.borderBottom });
    return el;
  };
  /**
   * Inner container (column / card / row). o: { width, tablet, mobile, maxWidth, row, align, justify, bg, gradient, card,
   * on ('base' | 'alt' | 'photo': what the card stands on), gap, pad, overflow, anim, slot, service, overlay, minHeightPx, radius }
   */
  const box = (elements, o = {}) => {
    const settings = {
      content_width: 'full',
      flex_direction: o.row ? 'row' : 'column',
      flex_wrap: o.row ? 'wrap' : 'nowrap',
      flex_gap: gap(o.gap ?? 16),
      flex_align_items: o.align || (o.row ? 'center' : 'stretch'),
      flex_justify_content: o.justify || 'flex-start',
      ...background(o),
    };
    if (o.width) Object.assign(settings, { width: px(o.width, '%'), width_tablet: px(o.tablet ?? (o.width < 45 ? 48 : 100), '%'), width_mobile: px(o.mobile ?? 100, '%') });
    else if (o.maxWidth) Object.assign(settings, { width: px(o.maxWidth), width_tablet: px(100, '%'), width_mobile: px(100, '%') });
    else settings.width = px(100, '%');
    if (o.pad) Object.assign(settings, { padding: sides(o.pad, o.pad, o.pad, o.pad), padding_mobile: sides(Math.min(o.pad, 24), Math.min(o.pad, 22), Math.min(o.pad, 24), Math.min(o.pad, 22)) });
    if (o.card) {
      const look = st.cards;
      if (!o.gradient && !o.bg) {
        const tinted = look === 'tinted' && o.on !== 'photo';
        // A tinted card on a tinted section would disappear: it stays white there
        const bg = tinted ? (o.on === 'alt' ? ink.card : ink.tint) : ink.card;
        Object.assign(settings, { background_background: 'classic', background_color: bg });
      }
      settings.border_radius = corners(cardRadius);
      if (look === 'shadow') Object.assign(settings, { box_shadow_box_shadow_type: 'yes', box_shadow_box_shadow: boxShadow(10, 30, ink.dark ? 0.35 : 0.08) });
      if (look === 'outline') Object.assign(settings, { border_border: 'solid', border_width: corners(1), border_color: ink.border });
      if (look === 'accent') Object.assign(settings, { border_border: 'solid', border_width: sides(4, 0, 0, 0), border_color: c.secondary, box_shadow_box_shadow_type: 'yes', box_shadow_box_shadow: boxShadow(6, 20, ink.dark ? 0.3 : 0.06) });
      Object.assign(settings, { box_shadow_hover_box_shadow_type: 'yes', box_shadow_hover_box_shadow: boxShadow(18, 44, ink.dark ? 0.45 : 0.16) });
    }
    if (o.radius !== undefined) settings.border_radius = corners(o.radius);
    if (o.minHeightPx) Object.assign(settings, { min_height: px(o.minHeightPx), min_height_mobile: px(Math.round(o.minHeightPx * 0.8)) });
    if (o.overflow) settings.overflow = 'hidden';
    if (o.anim !== undefined && o.anim !== false) animate(settings, o.anim);
    const el = { id: id(), elType: 'container', isInner: true, settings, elements };
    if (o.slot) photo(settings, el, o);
    if (o.css) settings.css_classes = o.css;
    return el;
  };
  const columns = (count) => ({ 1: 100, 2: 48, 3: 31, 4: 22.5 })[Math.min(4, Math.max(1, count))];

  // --- widgets ----------------------------------------------------------------------------
  /** o: { tag, size, align, color, weight, upper, url, bar, fixed | hint, max } */
  const heading = (text, o = {}) => {
    const tag = o.tag || 'h2';
    const title = tag === 'h1' || tag === 'h2';
    const size = Math.round((o.size || 40) * (title ? scale : 1));
    const upper = o.upper || (title && st.titleCase === 'upper');
    const el = widget('heading', {
      title: text,
      header_size: tag,
      align: o.align || 'left',
      title_color: o.color || ink.heading,
      ...(o.url ? { link: link(o.url) } : {}),
      ...typo('', fonts.heading, size, o.weight || headingWeight, {
        typography_font_size_tablet: px(Math.max(18, Math.round(size * 0.82))),
        typography_font_size_mobile: px(Math.max(18, Math.round(size * (size > 60 ? 0.55 : 0.68)))),
        typography_line_height: px(size >= 40 ? 1.12 : 1.3, 'em'),
        ...(upper ? { typography_text_transform: 'uppercase', typography_letter_spacing: px(o.upper ? 2 : 1) } : size >= 40 ? { typography_letter_spacing: px(-0.5) } : {}),
      }),
      // Colored bar on the left of the title ("bar" title style)
      ...(o.bar ? { _border_border: 'solid', _border_width: sides(0, 0, 0, 5), _border_color: c.secondary, _padding: sides(0, 0, 0, 18) } : {}),
    });
    field(el, 'title', o);
    if (o.url) mark(el, 'link.url', { fixed: true });
    return el;
  };
  /** Small label above a title. */
  const kicker = (text, o = {}) => heading(text, { tag: 'p', size: 13, weight: '700', upper: true, ...o, color: o.color || ink.kicker });
  /** Short accent line under a title. */
  const line = (align = 'left', color = c.secondary) => widget('divider', { style: 'solid', weight: px(3), color, width: px(56), align, gap: px(4) });
  const text = (html, o = {}) => {
    const el = widget('text-editor', {
      editor: /^\s*</.test(html) ? html : `<p>${escapeHtml(html)}</p>`,
      align: o.align || 'left',
      text_color: o.color || ink.text,
      ...typo('', fonts.body, o.size || 17, '400', { typography_line_height: px(1.75, 'em') }),
    });
    field(el, 'editor', o);
    return el;
  };
  /** variant: main | primary | secondary | outline | link */
  const button = (label, url, o = {}) => {
    const variant = o.variant === 'main' || !o.variant ? mainButton : o.variant;
    const fg = { primary: c.onPrimary, secondary: c.onSecondary, outline: o.outlineColor || ink.heading, link: o.color || ink.kicker }[variant];
    const settings = {
      text: label,
      link: link(url),
      align: o.align || 'left',
      button_text_color: fg,
      border_radius: corners(btnRadius),
      ...typo('', fonts.body, 15, '600', st.uppercase ? { typography_text_transform: 'uppercase', typography_letter_spacing: px(1) } : {}),
    };
    if (variant === 'primary') Object.assign(settings, { background_color: c.primary, button_background_hover_color: c.dark, hover_color: '#FFFFFF', text_padding: sides(16, 32, 16, 32) });
    if (variant === 'secondary') Object.assign(settings, { background_color: c.secondary, button_background_hover_color: ink.dark ? '#FFFFFF' : c.dark, hover_color: ink.dark ? c.dark : '#FFFFFF', text_padding: sides(16, 32, 16, 32) });
    if (variant === 'outline')
      Object.assign(settings, {
        background_color: 'rgba(0,0,0,0)',
        button_background_hover_color: fg,
        hover_color: fg === '#FFFFFF' ? c.dark : '#FFFFFF',
        border_border: 'solid',
        border_width: corners(2),
        border_color: fg,
        text_padding: sides(14, 30, 14, 30),
      });
    if (variant === 'link') Object.assign(settings, { background_color: 'rgba(0,0,0,0)', button_background_hover_color: 'rgba(0,0,0,0)', hover_color: ink.heading, text_padding: sides(4, 0, 4, 0) });
    const el = widget('button', settings);
    field(el, 'text', o);
    // tel:/mailto: links are not link fields (analyze.js); site links are decided here
    if (!isContactLink(url)) mark(el, 'link.url', { fixed: true });
    return el;
  };
  /** Image. o: { width (px), mobileWidth (px), height (px, cropped with object-fit), mobileHeight, align, size, round, frame, url, service } */
  const picture = (slot, o = {}) => {
    const framed = o.frame && st.images === 'framed';
    const settings = {
      image: image(),
      image_size: o.size || 'large',
      align: o.align || 'center',
      width: o.width ? px(o.width) : px(100, '%'),
      ...(o.width ? (o.mobileWidth ? { width_mobile: px(o.mobileWidth) } : {}) : { width_mobile: px(100, '%') }),
      ...(o.round !== false && imgRadius ? { image_border_radius: corners(imgRadius) } : {}),
    };
    // "framed": an offset block of the secondary color behind the photo; otherwise a soft shadow
    if (framed) Object.assign(settings, { image_box_shadow_box_shadow_type: 'yes', image_box_shadow_box_shadow: { horizontal: 18, vertical: 18, blur: 0, spread: 0, color: c.secondary } });
    else if (o.frame) Object.assign(settings, { image_box_shadow_box_shadow_type: 'yes', image_box_shadow_box_shadow: boxShadow(18, 40, 0.14) });
    if (o.height) Object.assign(settings, { height: px(o.height), height_tablet: px(Math.round(o.height * 0.8)), height_mobile: px(o.mobileHeight || 260), 'object-fit': 'cover' });
    if (o.url) Object.assign(settings, { link_to: 'custom', link: link(o.url) });
    const el = widget('image', settings);
    mark(el, 'image', { slot, ...(o.service !== undefined ? { service: o.service } : {}) });
    if (o.url) mark(el, 'link.url', { fixed: true });
    return el;
  };
  /** icon list. items: [{ text, url?, icon?, hint? }] (fixed unless they have a hint), o: { inline, align, color, iconColor, hover, size, weight, css } */
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
      space_between: px(o.inline ? 30 : 12),
      icon_color: o.iconColor || c.secondary,
      text_color: o.color || ink.text,
      text_color_hover: o.hover || ink.kicker,
      ...typo('icon_', fonts.body, o.size || 16, o.weight || '400'),
      ...(o.css ? { _css_classes: o.css } : {}),
    });
    items.forEach((it, i) => {
      if (it.hint) field(el, `icon_list.${i}.text`, { hint: it.hint, max: it.max || 40 });
      else mark(el, `icon_list.${i}.text`, { fixed: true });
      if (it.url && !isContactLink(it.url)) mark(el, `icon_list.${i}.link.url`, { fixed: true });
    });
    return el;
  };
  /** Icon box. o: { position, align, titleSize, url, fixed | titleHint + textHint } */
  const iconBox = (icon, title, desc, o = {}) => {
    const left = o.position === 'left';
    const el = widget('icon-box', {
      selected_icon: { value: icon, library: 'fa-solid' },
      view: 'stacked',
      shape: st.buttons === 'square' ? 'square' : 'circle',
      position: o.position || 'top',
      text_align: o.align || (left ? 'left' : 'center'),
      title_text: title,
      description_text: desc,
      ...(o.url ? { link: link(o.url) } : {}),
      title_size: 'h3',
      primary_color: ink.iconBg,
      secondary_color: ink.icon,
      icon_size: px(left ? 20 : 26),
      icon_padding: px(left ? 16 : 20),
      icon_space: px(left ? 18 : 20),
      title_bottom_space: px(left ? 4 : 10),
      title_color: ink.heading,
      description_color: ink.text,
      ...typo('title_', fonts.heading, o.titleSize || 20, headingWeight),
      ...typo('description_', fonts.body, 15, '400', { description_typography_line_height: px(1.65, 'em') }),
    });
    if (o.fixed) {
      mark(el, 'title_text', { fixed: true });
      mark(el, 'description_text', { fixed: true });
    } else {
      field(el, 'title_text', { hint: o.titleHint, max: 50 });
      field(el, 'description_text', { hint: o.textHint, max: 170 });
    }
    return el;
  };
  /** Card of a service: image (same height for every card) + linked title + short text + "read more", or text over the photo ("overlay"). */
  const serviceCard = (service, index, desc, o = {}) => {
    const hint = o.hint || `short description of the service "${service.name}" for its card (1–2 sentences)`;
    if (spec.layout.services === 'overlay') {
      return box(
        [
          heading(service.name, { tag: 'h3', size: 23, color: '#FFFFFF', url: service.url, fixed: true }),
          text(desc, { size: 15, color: 'rgba(255,255,255,0.86)', hint, max: 170 }),
          button(`${L.readMore} →`, service.url, { variant: 'link', color: c.secondary, fixed: true }),
        ],
        { width: o.width, slot: 'service_list', service: index, overlay: [rgba(c.dark, 0.05), rgba(c.dark, 0.9), 180], minHeightPx: 380, justify: 'flex-end', pad: 30, gap: 8, radius: imgRadius, anim: o.anim }
      );
    }
    return box(
      [
        picture('service_list', { service: index, height: 230, mobileHeight: 220, round: false, url: service.url, size: 'medium_large' }),
        box(
          [
            heading(service.name, { tag: 'h3', size: 21, url: service.url, fixed: true }),
            text(desc, { size: 15, hint, max: 170 }),
            button(`${L.readMore} →`, service.url, { variant: 'link', fixed: true }),
          ],
          { gap: 10, pad: 26 }
        ),
      ],
      { width: o.width, card: true, on: o.on, pad: 0, overflow: true, gap: 0, anim: o.anim }
    );
  };
  /** One review, without photo of the customer: quote mark, 5 stars, text, name and role. o: { align, light } */
  const review = (r, i, o = {}) => {
    const align = o.align || 'center';
    const quote = widget('icon', { selected_icon: { value: 'fas fa-quote-left', library: 'fa-solid' }, view: 'default', primary_color: o.light ? c.secondary : tint(c.secondary, 0.25), size: px(30), align });
    const stars = widget('star-rating', { rating_scale: '5', rating: '5', star_style: 'star_fontawesome', stars_color: c.secondary, icon_size: px(16), align });
    const el = widget('testimonial', {
      testimonial_content: r.text,
      testimonial_image: { url: '', id: '' },
      testimonial_name: r.name,
      testimonial_job: r.role,
      testimonial_alignment: align,
      content_content_color: o.light ? 'rgba(255,255,255,0.88)' : ink.text,
      name_text_color: o.light ? '#FFFFFF' : ink.heading,
      job_text_color: o.light ? c.secondary : ink.kicker,
      ...typo('content_', fonts.body, 16, '400', { content_typography_font_style: 'italic', content_typography_line_height: px(1.7, 'em') }),
      ...typo('name_', fonts.heading, 17, headingWeight),
      ...typo('job_', fonts.body, 14, '400'),
    });
    field(el, 'testimonial_content', { hint: `customer review ${i + 1} of 3: realistic, 2–3 sentences, about a different aspect than the other reviews (quality, punctuality, value for money, assistance…)`, max: 300, share: `review${i + 1}.content` });
    field(el, 'testimonial_name', { hint: `first name and surname of the customer of review ${i + 1} (fictional, typical of the site country)`, max: 40, share: `review${i + 1}.name` });
    field(el, 'testimonial_job', { hint: `role or city of the customer of review ${i + 1}`, max: 40, share: `review${i + 1}.job` });
    return [quote, stars, el];
  };
  const shortcode = (code) => widget('shortcode', { shortcode: code });
  const html = (code) => widget('html', { html: code });

  return { id, c, ink, L, st, fonts, pad, radius, imgRadius, marks, mark, section, box, columns, heading, kicker, line, text, button, picture, iconList, iconBox, serviceCard, review, shortcode, html, widget, typo };
}

// ---------------------------------------------------------------------------------------------
// Shared sections
// ---------------------------------------------------------------------------------------------

/**
 * Title block of a section: small label, title (+ accent line or side bar, per the title style), intro text.
 * parts: { kicker?, title, text? } each { value, hint, max } or { value, fixed }.
 * o: { align (default: the template alignment), light (on a photo / dark band) }
 */
function intro(b, parts, o = {}) {
  const bar = b.st.titles === 'bar';
  const align = bar ? 'left' : o.align || b.st.align;
  const light = o.light;
  const els = [];
  if (parts.kicker) els.push(b.kicker(parts.kicker.value, { ...parts.kicker, align, color: light ? b.c.secondary : undefined }));
  els.push(b.heading(parts.title.value, { ...parts.title, align, bar, color: light ? '#FFFFFF' : undefined }));
  if (b.st.titles === 'line') els.push(b.line(align));
  if (parts.text) els.push(b.text(parts.text.value, { ...parts.text, align, color: light ? 'rgba(255,255,255,0.86)' : undefined }));
  return align === 'center' ? b.box(els, { maxWidth: 760, gap: 12, align: 'center' }) : b.box(els, { maxWidth: 820, gap: 12, align: 'stretch' });
}

const shape = (b, color) => ({ shape: b.spec.layout.divider, color });

function subheader(b, site, role, nextBg = b.ink.bg) {
  const center = b.st.align === 'center' && b.st.titles !== 'bar';
  const align = center ? 'center' : 'left';
  return b.section(
    [
      b.heading(site.pages[role].title, { tag: 'h1', size: 52, color: '#FFFFFF', align, fixed: true }),
      ...(b.st.titles === 'plain' ? [] : [b.line(align)]),
      b.text(b.spec.copy.subheaderText, { color: 'rgba(255,255,255,0.88)', align, hint: `short sentence under the title "${site.pages[role].title}" in the page banner`, max: 140 }),
    ],
    {
      slot: 'subheader',
      overlay: center ? [rgba(b.c.dark, 0.6), rgba(b.c.dark, 0.82), 180] : [rgba(b.c.dark, 0.9), rgba(b.c.dark, 0.45), 90],
      padY: Math.round(b.pad * 1.25),
      gap: 14,
      align: center ? 'center' : 'flex-start',
      divider: shape(b, nextBg),
    }
  );
}

const featureHints = (i) => ({ titleHint: `strength ${i + 1} of 4 of the business (short title, 2–4 words)`, textHint: `explanation of strength ${i + 1} (1–2 sentences)` });

function features(b) {
  const { copy, icons, layout } = b.spec;
  const parts = {
    kicker: { value: copy.featuresKicker, hint: 'small label above the "Why choose us" title', max: 40 },
    title: { value: copy.featuresTitle, hint: '"Why choose us" section title', max: 60 },
    text: { value: copy.featuresText, hint: 'intro of the "why choose us" section (1 sentence)', max: 200 },
  };
  // "list": title on the left, the 4 strengths in two columns (icon beside the text, no cards)
  if (layout.features === 'list') {
    const items = copy.features.map((f, i) => b.box([b.iconBox(icons[i], f.title, f.text, { position: 'left', ...featureHints(i) })], { width: 47, tablet: 100, anim: i * 100 }));
    return b.section([b.box([intro(b, parts, { align: 'left' })], { width: 36 }), b.box(items, { width: 58, row: true, gap: 32, align: 'flex-start', justify: 'space-between' })], {
      row: true,
      bg: b.ink.bg,
      align: 'flex-start',
    });
  }
  const onPhoto = layout.features === 'cards';
  const items = copy.features.map((f, i) => b.box([b.iconBox(icons[i], f.title, f.text, featureHints(i))], { width: b.columns(4), card: true, on: onPhoto ? 'photo' : 'alt', pad: 30, anim: i * 120 }));
  return b.section(
    [intro(b, parts, { light: onPhoto }), b.box(items, { row: true, gap: 24, align: 'stretch', justify: 'space-between' })],
    onPhoto ? { slot: 'photo', overlay: [rgba(b.c.dark, 0.9), rgba(b.c.dark, 0.78), 180], align: 'center', gap: 44 } : { bg: b.ink.alt, align: 'center', gap: 44 }
  );
}

function cta(b, site) {
  const { copy, layout } = b.spec;
  const banner = layout.cta !== 'split';
  const title = b.heading(copy.ctaTitle, { size: 40, color: '#FFFFFF', align: banner ? 'center' : 'left', hint: 'call to action title: invite to contact the business', max: 80 });
  const body = b.text(copy.ctaText, { color: 'rgba(255,255,255,0.9)', align: banner ? 'center' : 'left', size: 18, hint: 'call to action text (1–2 sentences)', max: 200 });
  const btn = b.button(copy.ctaButton, site.pages.contact.url, { variant: 'secondary', align: banner ? 'center' : 'right', hint: 'call to action button text (leads to the contact page)', max: 30 });
  if (banner) {
    return b.section([b.box([title, body, btn], { maxWidth: 820, gap: 18, align: 'center', anim: 0 })], {
      slot: 'photo',
      overlay: [rgba(b.c.primary, 0.92), rgba(b.c.dark, 0.9), 135],
      align: 'center',
    });
  }
  // A rounded colored band floating on the page
  return b.section(
    [
      b.box([b.box([title, body], { width: 64, gap: 12 }), b.box([btn], { width: 30, align: 'flex-end' })], {
        row: true,
        card: true,
        gradient: [b.c.primaryText, b.c.dark, 135],
        pad: 56,
        justify: 'space-between',
        anim: 0,
      }),
    ],
    { bg: b.ink.bg, padY: Math.round(b.pad * 0.7) }
  );
}

function reviews(b) {
  const { copy, layout } = b.spec;
  const parts = {
    kicker: { value: copy.reviewsKicker, hint: 'small label above the reviews title', max: 40 },
    title: { value: copy.reviewsTitle, hint: 'title of the customer reviews section', max: 60 },
  };
  const band = layout.testimonials === 'band';
  const cards = layout.testimonials === 'cards';
  const align = cards ? 'left' : 'center';
  return b.section(
    [
      intro(b, parts, { light: band }),
      b.box(
        b.spec.copy.reviews.map((r, i) => b.box(b.review(r, i, { align, light: band }), { width: b.columns(3), card: cards, on: 'alt', pad: cards ? 34 : 10, gap: 12, tablet: 100, align: cards ? 'stretch' : 'center', anim: i * 120 })),
        { row: true, gap: 24, align: 'stretch', justify: 'space-between' }
      ),
    ],
    band ? { gradient: [b.c.primaryText, b.c.dark, 135], align: 'center', gap: 44 } : { bg: cards ? b.ink.alt : b.ink.bg, align: 'center', gap: 44 }
  );
}

/**
 * Image + text (about teaser on Home, "Chi siamo" on the About page): image on the left or on the
 * right of the text, or ("wide") text on top and a wide photo below.
 */
function mediaRow(b, content, o = {}) {
  const variant = o.imageFirst === undefined ? b.spec.layout.about : o.imageFirst ? 'image-left' : 'image-right';
  if (variant === 'wide') {
    return b.section(
      [b.box(content, { maxWidth: 860, gap: 16, align: 'stretch' }), b.box([b.picture('photo', { height: o.wideHeight || 460, frame: true })], { anim: 0 })],
      { bg: o.bg || b.ink.bg, align: 'center', gap: 48 }
    );
  }
  const img = b.box([b.picture('photo', { height: o.height || 460, frame: true })], { width: 46, anim: 0 });
  const txt = b.box(content, { width: 48, gap: 16 });
  return b.section(variant === 'image-left' ? [img, txt] : [txt, img], { row: true, bg: o.bg || b.ink.bg });
}

/** Accent line under a left-aligned title (only for the "line" title style). */
const titleLine = (b) => (b.st.titles === 'line' ? [b.line()] : []);

// ---------------------------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------------------------

function hero(b, site) {
  const { copy, layout } = b.spec;
  const tel = `tel:${telHref(site.phone)}`;
  const variant = layout.hero;
  const onImage = variant === 'center' || variant === 'left' || variant === 'bottom';
  const align = variant === 'center' ? 'center' : 'left';
  const size = variant === 'bottom' ? 66 : 58;
  const content = [
    b.kicker(copy.heroKicker, { align, color: onImage ? b.c.secondary : undefined, hint: 'short tagline above the main title', max: 50 }),
    b.heading(copy.heroTitle, { tag: 'h1', size, align, color: onImage ? '#FFFFFF' : undefined, hint: 'main title of the site (H1): the promise of the business, with its activity and city', max: 80 }),
    b.text(copy.heroText, { align, color: onImage ? 'rgba(255,255,255,0.9)' : undefined, size: 19, hint: 'hero subtitle (1–2 sentences)', max: 200 }),
    b.box(
      [
        b.button(copy.heroButton, site.pages.contact.url, { variant: onImage ? 'secondary' : 'main', hint: 'main hero button (leads to the contact page)', max: 30 }),
        b.button(copy.heroButton2, tel, { variant: 'outline', outlineColor: onImage ? '#FFFFFF' : b.ink.heading, hint: 'second hero button: call the business by phone', max: 30 }),
      ],
      { row: true, gap: 14, justify: align === 'center' ? 'center' : 'flex-start' }
    ),
  ];
  const edge = shape(b, b.ink.bg);
  if (variant === 'split') {
    return b.section([b.box(content, { width: 50, gap: 20 }), b.box([b.picture('hero', { height: 540, mobileHeight: 300, frame: true })], { width: 46, anim: 0 })], {
      row: true,
      bg: b.ink.alt,
      minHeight: 80,
    });
  }
  if (variant === 'card') {
    // Full photo with the text in a card on the left
    return b.section([b.box(content, { maxWidth: 620, card: true, on: 'photo', pad: 52, gap: 20, anim: 0 })], {
      slot: 'hero',
      overlay: [rgba(b.c.dark, 0.35), rgba(b.c.dark, 0.15), 90],
      minHeight: 86,
      align: 'flex-start',
      divider: edge,
    });
  }
  if (variant === 'bottom') {
    // Big title at the bottom of a full-height photo
    return b.section([b.box(content, { maxWidth: 900, gap: 20, align: 'flex-start', anim: 0 })], {
      slot: 'hero',
      overlay: [rgba(b.c.dark, 0.1), rgba(b.c.dark, 0.94), 180],
      minHeight: 94,
      align: 'flex-start',
      justify: 'flex-end',
      padBottom: Math.round(b.pad * 1.1),
      divider: edge,
    });
  }
  return b.section([b.box(content, { maxWidth: variant === 'left' ? 680 : 860, gap: 20, align: variant === 'left' ? 'flex-start' : 'center', anim: 0 })], {
    slot: 'hero',
    overlay: variant === 'left' ? [rgba(b.c.dark, 0.9), rgba(b.c.dark, 0.3), 90] : [rgba(b.c.dark, 0.55), rgba(b.c.dark, 0.8), 180],
    minHeight: 88,
    align: variant === 'left' ? 'flex-start' : 'center',
    divider: edge,
  });
}

/** "Chi siamo" teaser of the Home page. */
function aboutTeaser(b, site) {
  const { copy } = b.spec;
  return mediaRow(b, [
    b.kicker(copy.aboutKicker, { hint: 'small label of the "about us" section', max: 30 }),
    b.heading(copy.aboutTitle, { bar: b.st.titles === 'bar', hint: '"About us" section title', max: 70 }),
    ...titleLine(b),
    b.text(copy.aboutText, { hint: 'short presentation of the business (2–4 sentences)', max: 600 }),
    b.button(copy.aboutButton, site.pages.about.url, { hint: 'button "Scopri di più" leading to the About page', max: 30 }),
  ]);
}

/** Featured services (max 3) + "all services". */
function featuredServices(b, site) {
  const { copy, layout } = b.spec;
  if (!site.services.length) return null;
  const shown = site.services.slice(0, 3);
  const boxed = layout.services === 'boxed';
  const left = b.st.align === 'left' || b.st.titles === 'bar';
  return b.section(
    [
      intro(b, {
        kicker: { value: copy.servicesKicker, hint: 'small label of the services section', max: 30 },
        title: { value: copy.servicesTitle, hint: 'title of the featured services section', max: 60 },
        text: { value: copy.servicesText, hint: 'intro of the services section (1 sentence)', max: 200 },
      }),
      b.box(
        shown.map((s, i) => b.serviceCard(s, i, copy.serviceText, { width: b.columns(shown.length), on: boxed ? 'alt' : 'base', anim: i * 120 })),
        { row: true, gap: 28, align: 'stretch', justify: shown.length < 3 ? 'center' : 'space-between' }
      ),
      b.button(copy.servicesButton, site.pages.services.url, { align: left ? 'left' : 'center', hint: 'button "Tutti i servizi" leading to the Services page', max: 30 }),
    ],
    { bg: boxed ? b.ink.alt : b.ink.bg, align: 'center', gap: 44 }
  );
}

/** Photo carousel (Elementor image carousel, free): all the photos, cropped to the same size, with lightbox. */
function homeGallery(b, site) {
  const { copy } = b.spec;
  const left = b.st.align === 'left' || b.st.titles === 'bar';
  const carousel = b.widget('image-carousel', {
    carousel: [image()],
    thumbnail_size: 'large',
    slides_to_show: '3',
    slides_to_show_tablet: '2',
    slides_to_show_mobile: '1',
    slides_to_scroll: '1',
    navigation: 'both',
    image_stretch: 'yes',
    link_to: 'file',
    open_lightbox: 'yes',
    autoplay: 'yes',
    autoplay_speed: 4000,
    pause_on_hover: 'yes',
    infinite: 'yes',
    speed: 600,
    image_spacing: 'custom',
    image_spacing_custom: px(18),
    image_border_radius: corners(b.imgRadius),
    arrows_size: px(26),
    arrows_color: b.ink.dark ? '#FFFFFF' : b.c.heading,
    dots_color: b.ink.dark ? 'rgba(255,255,255,0.4)' : tint(b.c.heading, 0.7),
    dots_color_active: b.c.secondary,
  });
  b.mark(carousel, 'carousel', { slot: 'carousel' });
  return b.section(
    [
      intro(b, {
        kicker: { value: copy.galleryKicker, hint: 'small label of the photo gallery section of the Home page', max: 30 },
        title: { value: copy.galleryTitle, hint: 'title of the photo gallery of the Home page (e.g. our works)', max: 60 },
      }),
      b.box([carousel], { anim: 0 }),
      b.button(copy.galleryButton, site.pages.gallery.url, { variant: 'outline', outlineColor: b.ink.heading, align: left ? 'left' : 'center', hint: 'button leading to the Gallery page', max: 30 }),
    ],
    { bg: b.ink.bg, align: 'center', gap: 40 }
  );
}

/** Key numbers: 4 figures on a colored band. */
function stats(b) {
  const items = b.spec.copy.stats.map((x, i) =>
    b.box(
      [
        b.heading(x.value, { tag: 'p', size: 46, align: 'center', color: b.c.secondary, hint: `key figure ${i + 1} of 4 of the business (e.g. "20+" years, "24h" response time): short, realistic for this business — the client will check it`, max: 12 }),
        b.text(x.label, { align: 'center', color: 'rgba(255,255,255,0.85)', size: 15, hint: `label of key figure ${i + 1} (2–4 words)`, max: 40 }),
      ],
      { width: b.columns(4), tablet: 48, gap: 4, anim: i * 100 }
    )
  );
  return b.section([b.box(items, { row: true, gap: 24, align: 'flex-start', justify: 'space-between' })], { gradient: [b.c.primaryText, b.c.dark, 135], padY: Math.round(b.pad * 0.75) });
}

/** How we work: 4 numbered steps. */
function processSteps(b) {
  const { copy } = b.spec;
  const steps = copy.steps.map((x, i) =>
    b.box(
      [
        b.heading(String(i + 1).padStart(2, '0'), { tag: 'p', size: 44, color: b.c.secondary, fixed: true }),
        b.heading(x.title, { tag: 'h3', size: 20, hint: `step ${i + 1} of 4 of the way the business works with its customers (short title)`, max: 50 }),
        b.text(x.text, { size: 15, hint: `explanation of step ${i + 1} (1–2 sentences)`, max: 160 }),
      ],
      { width: b.columns(4), card: true, on: 'base', pad: 28, gap: 8, anim: i * 120 }
    )
  );
  return b.section(
    [
      intro(b, {
        kicker: { value: copy.processKicker, hint: 'small label of the "how we work" section', max: 30 },
        title: { value: copy.processTitle, hint: 'title of the "how we work" section', max: 60 },
        text: { value: copy.processText, hint: 'intro of the "how we work" section (1 sentence)', max: 200 },
      }),
      b.box(steps, { row: true, gap: 24, align: 'stretch', justify: 'space-between' }),
    ],
    { bg: b.ink.bg, align: 'center', gap: 44 }
  );
}

/** Frequently asked questions (accordion). */
function faq(b) {
  const { copy } = b.spec;
  const accordion = b.widget('accordion', {
    tabs: copy.faq.map((x) => ({ _id: b.id(), tab_title: x.q, tab_content: `<p>${escapeHtml(x.a)}</p>` })),
    selected_icon: { value: 'fas fa-plus', library: 'fa-solid' },
    selected_active_icon: { value: 'fas fa-minus', library: 'fa-solid' },
    title_html_tag: 'h3',
    border_width: px(1),
    border_color: b.ink.border,
    title_background: b.ink.card,
    title_color: b.ink.heading,
    tab_active_color: b.ink.kicker,
    icon_color: b.c.secondary,
    icon_active_color: b.c.secondary,
    content_background_color: b.ink.card,
    content_color: b.ink.text,
    title_padding: sides(20, 24, 20, 24),
    content_padding: sides(4, 24, 22, 24),
    ...b.typo('title_', b.fonts.heading, 17, b.st.headingWeight),
    ...b.typo('content_', b.fonts.body, 16, '400'),
  });
  copy.faq.forEach((_, i) => {
    b.mark(accordion, `tabs.${i}.tab_title`, { hint: `frequently asked question ${i + 1} of 4 of the customers of this business`, max: 120 });
    b.mark(accordion, `tabs.${i}.tab_content`, { hint: `answer to question ${i + 1} (1–3 sentences, no invented prices)`, max: 400 });
  });
  const parts = {
    kicker: { value: copy.faqKicker, hint: 'small label of the FAQ section', max: 30 },
    title: { value: copy.faqTitle, hint: 'title of the frequently asked questions section', max: 60 },
  };
  const left = b.st.align === 'left' || b.st.titles === 'bar';
  if (left) return b.section([b.box([intro(b, parts, { align: 'left' })], { width: 34 }), b.box([accordion], { width: 60, anim: 0 })], { row: true, bg: b.ink.alt, align: 'flex-start' });
  return b.section([intro(b, parts), b.box([accordion], { maxWidth: 860, anim: 0 })], { bg: b.ink.alt, align: 'center', gap: 40 });
}

/** Strip of 4 short guarantees. */
function highlights(b) {
  const items = b.spec.copy.highlights.map((x, i) => ({ text: x, icon: 'fas fa-check-circle', hint: `short guarantee ${i + 1} of 4 of the business (2–4 words, e.g. free estimate)`, max: 40 }));
  return b.section([b.iconList(items, { inline: true, align: 'center', color: '#FFFFFF', iconColor: b.c.secondary, hover: '#FFFFFF', size: 16, weight: '600' })], {
    gradient: [b.c.primaryText, b.c.dark, 90],
    padY: 26,
    align: 'center',
  });
}

const HOME_SECTIONS = { about: aboutTeaser, features, cta, services: featuredServices, gallery: homeGallery, reviews, stats, process: processSteps, faq, highlights };

function home(b, site) {
  const out = [hero(b, site)];
  for (const id of b.spec.sections || DEFAULT_SECTIONS) {
    const el = HOME_SECTIONS[id]?.(b, site);
    if (el) out.push(el);
  }
  // The shaped bottom edge of the hero takes the color of the next section
  const next = out[1]?.settings;
  if (next && out[0].settings.shape_divider_bottom) out[0].settings.shape_divider_bottom_color = next.background_color || b.ink.bg;
  return out;
}

function about(b, site) {
  const { copy } = b.spec;
  const sections = b.spec.sections || DEFAULT_SECTIONS;
  // "Chi siamo" in two rows: text | image, then image | text (no "Our story" / "Our mission" titles)
  const out = [
    subheader(b, site, 'about'),
    mediaRow(
      b,
      [
        b.heading(b.L.about, { bar: b.st.titles === 'bar', fixed: true }),
        ...titleLine(b),
        b.text(copy.aboutPageText, {
          hint: 'first part of the presentation of the business on the About page: who we are, history and experience (2 paragraphs), WITHOUT sub-titles',
          max: 1200,
          min: 300,
        }),
      ],
      { imageFirst: false, height: 500 }
    ),
    mediaRow(
      b,
      [
        b.text(copy.aboutPageText2, {
          hint: 'second part of the presentation on the About page, after the first one: values, way of working and commitment to the customers (2 paragraphs, may include a short list), WITHOUT sub-titles and without repeating the first part',
          max: 1200,
          min: 250,
        }),
      ],
      { imageFirst: true, height: 500, bg: b.ink.alt }
    ),
  ];
  if (sections.includes('stats')) out.push(stats(b));
  out.push(features(b));
  if (sections.includes('cta')) out.push(cta(b, site));
  out.push(reviews(b));
  return out;
}

function services(b, site) {
  const boxed = b.spec.layout.services === 'boxed';
  const bg = boxed ? b.ink.alt : b.ink.bg;
  const out = [subheader(b, site, 'services', bg)];
  if (site.services.length) {
    out.push(
      b.section(
        [
          b.box(
            site.services.map((s, i) => b.serviceCard(s, i, b.spec.copy.serviceText, { width: b.columns(3), on: boxed ? 'alt' : 'base', anim: (i % 3) * 120, hint: `short excerpt of the article about "${s.name}" for the services grid (1–2 sentences)` })),
            { row: true, gap: 30, align: 'stretch', justify: 'flex-start' }
          ),
        ],
        { bg }
      )
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
    image_spacing_custom: px(16),
    image_border_radius: corners(b.imgRadius),
  });
  b.mark(el, 'wp_gallery', { slot: 'gallery' });
  return [subheader(b, site, 'gallery'), b.section([el], { bg: b.ink.bg })];
}

function contactItems(site) {
  return [
    { text: site.phone, url: `tel:${telHref(site.phone)}`, icon: 'fas fa-phone-alt', label: 'phone' },
    { text: site.email, url: `mailto:${site.email}`, icon: 'fas fa-envelope', label: 'email' },
    { text: site.address, icon: 'fas fa-map-marker-alt', label: 'address' },
  ].filter((i) => i.text);
}

function contact(b, site) {
  const { copy, layout } = b.spec;
  const stacked = layout.contact === 'stacked';
  const items = contactItems(site);
  const parts = {
    title: { value: copy.contactTitle, hint: 'title of the contact details section', max: 60 },
    text: { value: copy.contactText, hint: 'invitation to contact the business (1–2 sentences)', max: 300 },
  };
  const infoBox = (it, o) => b.iconBox(it.icon, b.L[it.label], it.text, { fixed: true, url: it.url, titleSize: 17, ...o });
  // The form card is always light: the fields of the form plugin are styled for light backgrounds
  const form = b.box([b.heading(copy.formTitle, { size: 26, color: b.c.heading, hint: 'title above the contact form', max: 60 }), b.line(), b.shortcode(site.contactShortcode)], {
    card: true,
    bg: '#FFFFFF',
    pad: 40,
    gap: 16,
    ...(stacked ? { maxWidth: 860 } : { width: 52 }),
    anim: 0,
  });
  const out = [subheader(b, site, 'contact', b.ink.alt)];
  if (stacked) {
    out.push(
      b.section(
        [
          intro(b, parts),
          b.box(
            items.map((it, i) => b.box([infoBox(it)], { width: b.columns(items.length), card: true, on: 'alt', pad: 28, anim: i * 120 })),
            { row: true, gap: 24, align: 'stretch', justify: 'center' }
          ),
          form,
        ],
        { bg: b.ink.alt, align: 'center', gap: 40 }
      )
    );
  } else {
    out.push(
      b.section([b.box([intro(b, parts, { align: 'left' }), ...items.map((it) => infoBox(it, { position: 'left' }))], { width: 42, gap: 22 }), form], {
        row: true,
        bg: b.ink.alt,
        align: 'flex-start',
      })
    );
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
  const center = b.st.align === 'center' && b.st.titles !== 'bar';
  const align = center ? 'center' : 'left';
  const hero = b.section(
    [
      b.kicker(b.L.services, { align, color: b.c.secondary, fixed: true }),
      b.widget('theme-post-title', {
        header_size: 'h1',
        align,
        title_color: '#FFFFFF',
        ...b.typo('', b.fonts.heading, Math.round(48 * ({ normal: 1, large: 1.1, xl: 1.2 }[b.st.scale] || 1)), b.st.headingWeight, {
          typography_line_height: px(1.15, 'em'),
          typography_font_size_mobile: px(32),
          ...(b.st.titleCase === 'upper' ? { typography_text_transform: 'uppercase' } : {}),
        }),
      }),
      ...(b.st.titles === 'plain' ? [] : [b.line(align)]),
    ],
    {
      dynamicBg: true,
      overlay: center ? [rgba(b.c.dark, 0.6), rgba(b.c.dark, 0.85), 180] : [rgba(b.c.dark, 0.92), rgba(b.c.dark, 0.45), 90],
      padY: Math.round(b.pad * 1.35),
      gap: 14,
      align: center ? 'center' : 'flex-start',
      divider: shape(b, b.ink.bg),
    }
  );
  const main = b.box(
    [
      b.widget('theme-post-content', { text_color: b.ink.text, ...b.typo('', b.fonts.body, 17, '400', { typography_line_height: px(1.85, 'em') }) }),
      b.box(
        [
          b.heading(copy.postCtaTitle, { size: 28, color: '#FFFFFF', hint: 'call to action at the end of every service article', max: 70 }),
          b.text(copy.postCtaText, { color: 'rgba(255,255,255,0.9)', hint: 'call to action text at the end of the articles (1 sentence)', max: 200 }),
          b.button(copy.postCtaButton, site.pages.contact.url, { variant: 'secondary', hint: 'button leading to the contact page', max: 30 }),
        ],
        { card: true, gradient: [b.c.primaryText, b.c.dark, 135], pad: 40, gap: 14 }
      ),
    ],
    { width: 64, gap: 40 }
  );
  const sideTitle = (t) => [b.heading(t, { tag: 'h3', size: 20, fixed: true }), b.line()];
  const sidebar = [];
  // Other services: every service; each article removes itself (articleDoc)
  if (site.services.length) {
    sidebar.push(
      b.box(
        [...sideTitle(b.L.otherServices), b.iconList(site.services.map((s) => ({ text: s.name, url: s.url, icon: 'fas fa-chevron-right' })), { color: b.ink.heading, weight: '600', size: 15, css: OTHER_SERVICES })],
        { card: true, on: 'base', pad: 30, gap: 14, css: OTHER_SERVICES_BOX }
      )
    );
  }
  sidebar.push(b.box([...sideTitle(b.L.contacts), b.iconList(contactItems(site), { size: 15 })], { card: true, on: 'base', pad: 30, gap: 14 }));
  return [hero, b.section([main, b.box(sidebar, { width: 31, gap: 24 })], { row: true, bg: b.ink.bg, align: 'flex-start', gap: 40 })];
}

/** CSS classes marking the "Other services" list of the single post template. */
const OTHER_SERVICES = 'esg-other-services';
const OTHER_SERVICES_BOX = 'esg-other-services-box';

/**
 * Static Elementor document of one service article, from the final single post template document:
 * featured image in the hero, title, content, and "Other services" without the article itself.
 * Works without Elementor Pro (no dynamic tag, no theme widget).
 * @param {object} doc   single post document (texts already filled)
 * @param {{ title, content, imageUrl, url }} post
 */
export function articleDoc(doc, post) {
  const out = structuredClone(doc);
  const walk = (list) =>
    list
      .map((el) => {
        const st = el.settings || {};
        if (st.__dynamic__?.background_image) {
          delete st.__dynamic__.background_image;
          if (!Object.keys(st.__dynamic__).length) delete st.__dynamic__;
          if (post.imageUrl) st.background_image = { url: post.imageUrl, id: '', alt: post.title, source: 'library' };
          else delete st.background_image;
        }
        if (el.widgetType === 'theme-post-title') {
          el.widgetType = 'heading';
          st.title = post.title;
        }
        if (el.widgetType === 'theme-post-content') {
          el.widgetType = 'text-editor';
          st.editor = post.content || '';
        }
        if (st._css_classes === OTHER_SERVICES) st.icon_list = (st.icon_list || []).filter((it) => it.link?.url !== post.url);
        el.elements = walk(el.elements || []);
        return el;
      })
      // A list of other services left empty (a site with one service): no box
      .filter((el) => !(el.settings?.css_classes === OTHER_SERVICES_BOX && !JSON.stringify(el).includes('"icon_list":[{')));
  out.content = walk(out.content || []);
  out.type = 'wp-post';
  out.title = post.title;
  out.page_settings = { hide_title: 'yes' };
  return out;
}

const menuItems = (site) => ['home', 'about', 'services', 'gallery', 'contact'].map((r) => ({ text: site.pages[r].title, url: site.pages[r].url }));

/** Logo image, or the site name when the project has no logo. */
function brand(b, site, o = {}) {
  if (site.hasLogo) return b.picture('logo', { width: o.width || 180, mobileWidth: o.mobileWidth, align: o.align || 'left', size: 'medium', round: false });
  return b.heading(site.siteName, { tag: 'p', size: 24, align: o.align || 'left', color: o.color || b.ink.kicker, fixed: true });
}

const escapeAttr = (s) => escapeHtml(s).replace(/"/g, '&quot;');

/** Script of the hamburger menu (registered once per page): open / close, outside tap, Escape, current page, CTA text. */
const NAV_SCRIPT = `(function(){if(window.esgNav)return;window.esgNav=1;
function set(n,open){n.classList.toggle('is-open',open);var t=n.querySelector('.esg-nav-toggle');if(t)t.setAttribute('aria-expanded',open?'true':'false');}
document.addEventListener('click',function(e){var x=e.target;if(!x.closest)return;
document.querySelectorAll('.esg-nav.is-open').forEach(function(n){if(!n.contains(x)||x.closest('.esg-nav-list a'))set(n,false);});
var t=x.closest('.esg-nav-toggle');if(t){var n=t.closest('.esg-nav');set(n,!n.classList.contains('is-open'));}});
document.addEventListener('keydown',function(e){if(e.key!=='Escape')return;document.querySelectorAll('.esg-nav.is-open').forEach(function(n){set(n,false);var t=n.querySelector('.esg-nav-toggle');if(t)t.focus();});});
function init(){var here=location.pathname.replace(/\\/+$/,'');
document.querySelectorAll('.esg-nav-list a').forEach(function(a){if(a.pathname.replace(/\\/+$/,'')===here)a.setAttribute('aria-current','page');});
var src=document.querySelector('.esg-hd-cta .elementor-button-text');
document.querySelectorAll('.esg-nav-cta a').forEach(function(a){if(src&&src.textContent.trim())a.textContent=src.textContent.trim();});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();})();`;

/**
 * Navigation of the header (Elementor HTML widget, no Pro or addon needed): the 5 pages in a row on
 * desktop; below 1025px a hamburger button opening a dropdown panel (with the call to action on
 * phones, where the header button is hidden). The style also keeps the header on one line:
 * logo and button take their width, the menu the rest.
 * o: { justify ('flex-end' | 'center'), color, hover, button: { text, url } }
 */
function navMenu(b, site, o) {
  const { st, c, ink, fonts } = b;
  const upper = st.titleCase === 'upper';
  const radius = st.buttons === 'pill' ? 50 : st.buttons === 'square' ? 0 : b.radius;
  const panelBg = ink.dark ? ink.card : '#FFFFFF';
  const ctaBg = ink.dark ? c.secondary : c.primary;
  const vars = {
    '--esg-justify': o.justify,
    '--esg-color': o.color,
    '--esg-hover': o.hover,
    '--esg-panel': panelBg,
    '--esg-panel-color': ink.heading,
    '--esg-panel-hover': ink.dark ? rgba(c.secondary, 0.14) : tint(c.primary, 0.92),
    '--esg-line': ink.border,
    '--esg-cta-bg': ctaBg,
    '--esg-cta-color': ink.dark ? c.onSecondary : c.onPrimary,
    '--esg-radius': `${Math.min(radius, 12)}px`,
  };
  const style = Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';');
  const items = menuItems(site).map((m) => `<li><a href="${escapeAttr(m.url)}">${escapeHtml(m.text)}</a></li>`).join('');
  const css = `.esg-header{position:relative;z-index:100}
.esg-header .esg-hd-brand,.esg-header .esg-hd-cta{flex:0 0 auto!important;width:auto!important;max-width:none}
.esg-header .esg-hd-nav{flex:1 1 auto!important;width:auto!important;min-width:0}
.esg-nav{position:relative;display:flex;justify-content:var(--esg-justify);align-items:center;font-family:"${fonts.body}",sans-serif}
.esg-nav-list{list-style:none;margin:0;padding:0;display:flex;flex-wrap:nowrap;align-items:center;gap:6px ${upper ? 26 : 30}px}
.esg-nav-list li{margin:0;padding:0}
.esg-nav-list a{position:relative;display:block;padding:8px 0;color:var(--esg-color);font-size:${upper ? 13 : 15}px;font-weight:600;line-height:1.3;${upper ? 'text-transform:uppercase;letter-spacing:1px;' : ''}text-decoration:none;white-space:nowrap;transition:color .2s}
.esg-nav-list a::after{content:"";position:absolute;left:0;right:0;bottom:2px;height:2px;background:var(--esg-hover);transform:scaleX(0);transform-origin:left;transition:transform .25s}
.esg-nav-list a:hover,.esg-nav-list a:focus-visible,.esg-nav-list a[aria-current=page]{color:var(--esg-hover)}
.esg-nav-list a:hover::after,.esg-nav-list a:focus-visible::after,.esg-nav-list a[aria-current=page]::after{transform:scaleX(1)}
.esg-nav-toggle,.esg-nav-list .esg-nav-cta{display:none}
@media (max-width:1024px){
.esg-header .esg-hd-nav{flex:0 0 auto!important;order:3}
.esg-header .esg-hd-cta{margin-left:auto}
.esg-nav-toggle{display:inline-flex;align-items:center;justify-content:center;width:46px;height:46px;padding:0;margin:0;border:1px solid var(--esg-line);border-radius:var(--esg-radius);background:transparent;color:var(--esg-color);cursor:pointer;-webkit-tap-highlight-color:transparent}
.esg-nav-toggle:hover,.esg-nav-toggle:focus{background:transparent;color:var(--esg-color)}
.esg-nav-toggle:focus-visible{outline:2px solid var(--esg-hover);outline-offset:2px}
.esg-nav-bars{position:relative;display:block;width:22px;height:16px}
.esg-nav-bars span{position:absolute;left:0;width:100%;height:2px;border-radius:2px;background:currentColor;transition:transform .25s,opacity .2s,top .25s}
.esg-nav-bars span:nth-child(1){top:0}.esg-nav-bars span:nth-child(2){top:7px}.esg-nav-bars span:nth-child(3){top:14px}
.esg-nav.is-open .esg-nav-bars span:nth-child(1){top:7px;transform:rotate(45deg)}
.esg-nav.is-open .esg-nav-bars span:nth-child(2){opacity:0}
.esg-nav.is-open .esg-nav-bars span:nth-child(3){top:7px;transform:rotate(-45deg)}
.esg-nav-list{position:absolute;top:calc(100% + 14px);right:0;z-index:9999;width:min(320px,calc(100vw - 32px));flex-direction:column;align-items:stretch;gap:2px;padding:10px;background:var(--esg-panel);border:1px solid var(--esg-line);border-radius:var(--esg-radius);box-shadow:0 18px 44px rgba(15,27,45,.2);opacity:0;visibility:hidden;transform:translateY(-8px);transition:opacity .2s,transform .2s,visibility .2s}
.esg-nav.is-open .esg-nav-list{opacity:1;visibility:visible;transform:none}
.esg-nav-list a{padding:12px 14px;color:var(--esg-panel-color);border-radius:var(--esg-radius);white-space:normal}
.esg-nav-list a::after{display:none}
.esg-nav-list a:hover,.esg-nav-list a:focus-visible,.esg-nav-list a[aria-current=page]{color:var(--esg-panel-color);background:var(--esg-panel-hover)}
}
@media (max-width:767px){
.esg-header .esg-hd-cta{display:none!important}
.esg-header .esg-hd-nav{margin-left:auto}
.esg-nav-list .esg-nav-cta{display:block;margin-top:8px}
.esg-nav-list .esg-nav-cta a,.esg-nav-list .esg-nav-cta a:hover{background:var(--esg-cta-bg);color:var(--esg-cta-color);text-align:center}
}`;
  const html =
    `<nav class="esg-nav" style="${style}" aria-label="${escapeAttr(b.L.menu)}">` +
    `<button type="button" class="esg-nav-toggle" aria-expanded="false" aria-controls="esg-nav-list" aria-label="${escapeAttr(b.L.menu)}"><span class="esg-nav-bars" aria-hidden="true"><span></span><span></span><span></span></span></button>` +
    `<ul id="esg-nav-list" class="esg-nav-list">${items}<li class="esg-nav-cta"><a href="${escapeAttr(o.button.url)}">${escapeHtml(o.button.text)}</a></li></ul>` +
    `</nav>\n<style>\n${css}\n</style>\n<script>\n${NAV_SCRIPT}\n</script>`;
  const el = b.html(html);
  b.mark(el, 'html', { fixed: true });
  return el;
}

function header(b, site) {
  const { copy, layout } = b.spec;
  const out = [];
  // "bold": a header in the primary color; otherwise the color of the pages
  const bold = layout.header === 'bold';
  const bg = bold ? b.c.primary : b.ink.bg;
  const menuColor = bold ? b.c.onPrimary : b.ink.heading;
  const hover = bold ? b.c.secondary : b.ink.kicker;
  const frame = b.ink.dark || bold ? { borderBottom: b.ink.border } : { shadow: true };
  if (layout.header === 'topbar') {
    out.push(
      b.section([b.iconList(contactItems(site).slice(0, 2), { inline: true, color: '#FFFFFF', iconColor: b.c.secondary, hover: b.c.secondary, size: 14 })], {
        row: true,
        bg: b.ink.dark ? '#000000' : b.c.dark,
        padY: 9,
        justify: 'flex-end',
      })
    );
  }
  // Logo, menu and button on one line (never wrapping); "centered": the menu in the middle, otherwise next to the button
  const button = { text: copy.headerButton, url: site.pages.contact.url };
  out.push(
    b.section(
      [
        b.box([brand(b, site, { color: bold ? b.c.onPrimary : undefined, mobileWidth: 140 })], { width: 20, tablet: 30, mobile: 60, css: 'esg-hd-brand' }),
        b.box([navMenu(b, site, { justify: layout.header === 'centered' ? 'center' : 'flex-end', color: menuColor, hover, button })], { width: 56, tablet: 15, mobile: 30, css: 'esg-hd-nav' }),
        b.box([b.button(button.text, button.url, { variant: bold ? 'secondary' : 'main', align: 'right', hint: 'header button leading to the contact page', max: 25 })], { width: 20, tablet: 40, align: 'flex-end', css: 'esg-hd-cta' }),
      ],
      { row: true, wrap: false, bg, padY: 16, gap: 20, ...frame, css: 'esg-header' }
    )
  );
  return out;
}

function footer(b, site) {
  const variant = b.spec.layout.footer;
  const light = variant === 'light';
  const deep = b.ink.dark ? mix(b.c.dark, '#000000', 0.4) : b.c.dark;
  const style = light ? { bg: b.ink.alt } : variant === 'brand' ? { gradient: [b.c.primaryText, b.c.dark, 135] } : { bg: deep };
  const color = light ? b.ink.text : 'rgba(255,255,255,0.78)';
  const titleColor = light ? b.ink.heading : '#FFFFFF';
  const hover = light ? b.ink.kicker : b.c.secondary;
  const colTitle = (t) => [b.heading(t, { tag: 'h4', size: 18, color: titleColor, fixed: true }), b.line('left')];
  const list = (items) => b.iconList(items, { color, hover, iconColor: b.c.secondary });
  const cols = [
    b.box([brand(b, site, { color: titleColor })], { width: 22 }),
    b.box([...colTitle(b.L.links), list(menuItems(site))], { width: 22, gap: 12 }),
  ];
  if (site.services.length) cols.push(b.box([...colTitle(b.L.services), list(site.services.map((s) => ({ text: s.name, url: s.url })))], { width: 22, gap: 12 }));
  cols.push(b.box([...colTitle(b.L.contacts), list(contactItems(site))], { width: 22, gap: 12 }));
  return [
    b.section(cols, { row: true, ...style, align: 'flex-start', padY: Math.round(b.pad * 0.8) }),
    b.section([b.text(`<p>${escapeHtml(site.copyright)}</p>`, { align: 'center', size: 14, color, fixed: true })], {
      ...(variant === 'brand' ? { bg: b.c.dark } : style),
      padY: 20,
      borderTop: light ? b.ink.border : 'rgba(255,255,255,0.12)',
    }),
  ];
}

const BUILDERS = { home, about, services, gallery, contact, single_post: singlePost, header, footer };
const DOC_TYPES = { header: 'header', footer: 'footer', single_post: 'single-post' };

/** Elementor global colors and fonts (merged into the active Elementor kit by the WordPress plugin). */
export function globalStyles(spec) {
  const { fonts, headingWeight } = spec.style;
  const colors = siteColors(spec.style.colors);
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
