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
import { mapIframe, siteMap } from '../lib/maps.js';
import { DEFAULT_SECTIONS, featureCount, hueSat, mix, rgba, siteColors, tint } from './spec.js';

/** Image of a template before a project fills it (never left in an exported site). */
export const TEMPLATE_IMAGE = 'https://template.invalid/placeholder.jpg';

/**
 * Version of the generated structure. Field ids depend on it: a generation made with another
 * version cannot be exported (exporter.js), it has to be generated again.
 */
export const BUILDER_VERSION = 10;

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
/** Height (px) of each shape divider at the bottom of the hero and the banners (others: 70). */
const SHAPE_HEIGHT = { waves: 60, 'wave-brush': 50, triangle: 44, arrow: 30, zigzag: 26, mountains: 90, 'opacity-tilt': 90 };
const SCALE = { normal: 1, large: 1.12, xl: 1.28 };
/** Height of the main photos per the photo ratio of the template (others: the height of the layout). */
const PHOTO_RATIO = { tall: 1.18, wide: 0.78 };

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
  // "arch": photos with a rounded top (portrait-like photos only); small rounded corners elsewhere
  const imgRadius = st.images === 'rounded' ? Math.max(radius, 6) : st.images === 'arch' ? Math.max(radius, 10) : 0;
  const archCorners = { unit: 'px', top: '1000', right: '1000', bottom: '0', left: '0', isLinked: false };
  const cardRadius = st.buttons === 'square' && st.images !== 'rounded' ? Math.min(radius, 2) : radius;
  // Main buttons: primary color on light pages, the brighter secondary color on dark pages
  const mainButton = ink.dark ? 'secondary' : 'primary';
  const L = LABELS[site.lang] || LABELS.en;
  const marks = new Map();
  const bands = new Set();
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
  /**
   * Entrance animation (free Elementor motion effect) per the motion style of the template, delayed
   * to reveal cards one after the other: rising, slow fade, sliding in from the side, zoom, or none.
   */
  const animate = (settings, delay = 0) => {
    if (st.motion === 'none') return settings;
    const name = { fade: 'fadeIn', slide: 'fadeInLeft', zoom: 'zoomIn' }[st.motion] || 'fadeInUp';
    return Object.assign(settings, { animation: name, ...(delay ? { animation_delay: delay } : {}), ...(st.motion === 'fade' ? { animation_duration: 'slow' } : {}) });
  };
  const background = (o) => {
    if (o.radial) {
      const [from, to] = o.radial;
      return { background_background: 'gradient', background_color: from, background_color_b: to, background_gradient_type: 'radial', background_gradient_position: 'center center' };
    }
    if (o.gradient) {
      const [from, to, angle = 135] = o.gradient;
      return { background_background: 'gradient', background_color: from, background_color_b: to, background_gradient_type: 'linear', background_gradient_angle: px(angle, 'deg') };
    }
    return o.bg ? { background_background: 'classic', background_color: o.bg } : {};
  };
  /**
   * Background of the colored bands (key numbers, guarantees, review band, call to action, badge,
   * footer), per the fill style of the template. Deep bands on dark pages take the tinted dark,
   * which stays visible on the dark page color.
   */
  const fill = (angle = 135) =>
    ({
      flat: { bg: c.primaryText },
      deep: { bg: ink.dark ? ink.tint : c.dark },
      radial: { radial: [c.primaryText, c.dark] },
    })[st.fill] || { gradient: [c.primaryText, c.dark, angle] };
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
    // A section under the transparent header ("esg-under") starts below it, also when its content is taller than the screen
    const under = String(o.css || '').split(' ').includes('esg-under');
    const top = under ? Math.max(py, 150) : py;
    const topMobile = under ? Math.max(Math.round(py * 0.6), 110) : Math.round(py * 0.6);
    const settings = {
      content_width: o.full ? 'full' : 'boxed',
      boxed_width: px(o.width || 1200),
      flex_direction: o.row ? 'row' : 'column',
      flex_wrap: o.row && o.wrap !== false ? 'wrap' : 'nowrap',
      flex_gap: gap(o.gap ?? 28),
      flex_align_items: o.align || (o.row ? 'center' : 'stretch'),
      flex_justify_content: o.justify || (o.row ? 'space-between' : 'center'),
      padding: o.full ? sides(0, 0, 0, 0) : sides(top, 20, o.padBottom ?? py, 20),
      padding_mobile: o.full ? sides(0, 0, 0, 0) : sides(topMobile, 16, Math.round((o.padBottom ?? py) * 0.6), 16),
      ...background(o),
    };
    if (o.minHeight) settings.min_height = px(o.minHeight, 'vh');
    const el = { id: id(), elType: 'container', isInner: false, settings, elements };
    if (o.slot || o.dynamicBg) photo(settings, el, o);
    if (o.slideshow) {
      // Background slideshow (free Elementor): the hero image then other photos (exporter.js), fading with a slow zoom
      Object.assign(settings, {
        background_background: 'slideshow',
        background_color: c.dark,
        background_slideshow_gallery: [image()],
        background_slideshow_loop: 'yes',
        background_slideshow_slide_duration: 6000,
        background_slideshow_slide_transition: 'fade',
        background_slideshow_transition_duration: 1500,
        background_slideshow_background_size: 'cover',
        background_slideshow_ken_burns: 'yes',
        background_slideshow_ken_burns_zoom_direction: 'in',
      });
      const [from, to, angle = 180] = o.overlay;
      Object.assign(settings, {
        background_overlay_background: 'gradient',
        background_overlay_color: from,
        background_overlay_color_b: to,
        background_overlay_gradient_type: 'linear',
        background_overlay_gradient_angle: px(angle, 'deg'),
        background_overlay_opacity: px(1),
      });
      mark(el, 'background_slideshow_gallery', { slot: 'slideshow' });
    }
    // "grid", "dots" and "lines" decor: a fine grid or a light texture on the tinted sections (CSS of the header)
    const tinted = o.bg === ink.alt && !o.slot;
    const texture = tinted && ({ grid: 'esg-grid', dots: 'esg-texture', lines: 'esg-texture' })[st.decor];
    const classes = [o.css, texture].filter(Boolean).join(' ');
    if (classes) settings.css_classes = classes;
    // Colored or photo band: may get shaped edges towards its neighbours (bandEdges)
    if (o.band) bands.add(el);
    if (o.divider && o.divider.shape !== 'none') {
      Object.assign(settings, {
        shape_divider_bottom: o.divider.shape,
        shape_divider_bottom_color: o.divider.color,
        shape_divider_bottom_width: px(100, '%'),
        shape_divider_bottom_height: px(SHAPE_HEIGHT[o.divider.shape] || 70),
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
   * on ('base' | 'alt' | 'photo': what the card stands on), gap, pad, overflow, anim, slot, service, overlay, minHeightPx, radius,
   * margin [t, r, b, l] (negative top: overlaps the element above), padding [t, r, b, l], border [t, r, b, l, color], zIndex,
   * lift (hover), zoom (photo zoom on hover), desktopOnly (hidden on tablets and phones), css }
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
    if (o.padding) Object.assign(settings, { padding: sides(...o.padding), padding_mobile: sides(...o.padding) });
    if (o.card) {
      const look = st.cards;
      if (!o.gradient && !o.radial && !o.bg) {
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
    if (o.border) {
      const [t, r, bt, l, color] = o.border;
      Object.assign(settings, { border_border: 'solid', border_width: sides(t, r, bt, l), border_color: color });
    }
    if (o.radius !== undefined) settings.border_radius = corners(o.radius);
    if (o.margin) Object.assign(settings, { margin: sides(...o.margin), margin_mobile: sides(Math.max(o.margin[0], -40), 0, o.margin[2], Math.min(o.margin[3], 16)) });
    if (o.zIndex) settings.z_index = o.zIndex;
    if (o.minHeightPx) Object.assign(settings, { min_height: px(o.minHeightPx), min_height_mobile: px(Math.round(o.minHeightPx * 0.8)) });
    if (o.overflow) settings.overflow = 'hidden';
    if (o.desktopOnly) Object.assign(settings, { hide_tablet: 'hidden-tablet', hide_mobile: 'hidden-mobile' });
    if (o.anim !== undefined && o.anim !== false) animate(settings, o.anim);
    const el = { id: id(), elType: 'container', isInner: true, settings, elements };
    if (o.slot) photo(settings, el, o);
    // Cards of a grid rise a little on hover (esg-card), their photo zooms (esg-zoom): CSS of the header
    const classes = [o.css, o.lift && 'esg-card', o.zoom && 'esg-zoom'].filter(Boolean).join(' ');
    if (classes) settings.css_classes = classes;
    return el;
  };
  const columns = (count) => ({ 1: 100, 2: 48, 3: 31, 4: 22.5 })[Math.min(4, Math.max(1, count))];

  // --- widgets ----------------------------------------------------------------------------
  /**
   * o: { tag, size, align, color, weight, upper, url, bar, hl, fixed | hint, max }
   * hl: hero / section title whose last word the highlight style of the template accentuates
   * (wrapped at runtime: the AI only writes plain text in the titles).
   */
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
        // Phones: large titles at most 36px (H1) / 30px, so long words still fit a 360px screen
        typography_font_size_mobile: px(Math.min(tag === 'h1' ? 36 : 30, Math.max(18, Math.round(size * (size > 60 ? 0.55 : 0.68))))),
        typography_line_height: px(size >= 40 ? 1.12 : 1.3, 'em'),
        ...(upper ? { typography_text_transform: 'uppercase', typography_letter_spacing: px(o.upper ? 2 : 1) } : size >= 40 ? { typography_letter_spacing: px(-0.5) } : {}),
      }),
      // Colored bar on the left of the title ("bar" title style)
      ...(o.bar ? { _border_border: 'solid', _border_width: sides(0, 0, 0, 5), _border_color: c.secondary, _padding: sides(0, 0, 0, 18) } : {}),
    });
    field(el, 'title', o);
    if (o.url) mark(el, 'link.url', { fixed: true });
    if (o.hl && st.highlight && st.highlight !== 'none') el.settings._css_classes = o.color === '#FFFFFF' ? 'esg-hl esg-hl-light' : 'esg-hl';
    return el;
  };
  /**
   * Small label above a title, per the template label style: plain, a tinted pill, or with a thin
   * line beside it ("dash", CSS of the header). o.onDark: on a photo or a dark band.
   */
  const kicker = (text, o = {}) => {
    const el = heading(text, { tag: 'p', size: st.kicker === 'pill' ? 12 : 13, weight: '700', upper: true, ...o, color: o.color || ink.kicker });
    const align = o.align || 'left';
    if (st.kicker === 'pill') {
      Object.assign(el.settings, {
        _background_background: 'classic',
        _background_color: o.onDark ? 'rgba(255,255,255,0.14)' : ink.dark ? rgba(c.secondary, 0.16) : tint(c.primary, 0.88),
        _padding: sides(7, 16, 7, 16),
        _border_radius: corners(50),
        _element_width: 'auto',
        _flex_align_self: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
      });
    }
    if (st.kicker === 'dash') el.settings._css_classes = align === 'center' ? 'esg-kicker-dash esg-kicker-c' : 'esg-kicker-dash';
    // "vertical" signature: the label of a left-aligned section title written vertically beside it (desktop)
    if (st.signature === 'vertical' && o.vertical !== false && align === 'left') el.settings._css_classes = [el.settings._css_classes, 'esg-vlabel'].filter(Boolean).join(' ');
    return el;
  };
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
    // "dropcap" decor: the first letter of the About texts large, in the title font
    if (o.dropcap && st.decor === 'dropcap') el.settings._css_classes = 'esg-dropcap';
    return el;
  };
  /** variant: main | primary | secondary | outline | link; o.icon: Font Awesome icon before the label; o.hoverColor: of a link */
  const button = (label, url, o = {}) => {
    const variant = o.variant === 'main' || !o.variant ? mainButton : o.variant;
    const fg = { primary: c.onPrimary, secondary: c.onSecondary, outline: o.outlineColor || ink.heading, link: o.color || ink.kicker }[variant];
    const settings = {
      text: label,
      link: link(url),
      align: o.align || 'left',
      button_text_color: fg,
      border_radius: corners(btnRadius),
      ...(o.icon ? { selected_icon: { value: o.icon, library: 'fa-solid' }, icon_align: 'left', icon_indent: px(10) } : {}),
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
    if (variant === 'link') Object.assign(settings, { background_color: 'rgba(0,0,0,0)', button_background_hover_color: 'rgba(0,0,0,0)', hover_color: o.hoverColor || ink.heading, text_padding: sides(4, 0, 4, 0) });
    const el = widget('button', settings);
    field(el, 'text', o);
    // tel:/mailto: links are not link fields (analyze.js); site links are decided here
    if (!isContactLink(url)) mark(el, 'link.url', { fixed: true });
    return el;
  };
  /**
   * Image. o: { width (px), mobileWidth (px), height (px, cropped with object-fit), mobileHeight, align, size, round, frame, wide (no arch), deco, url, service }
   * frame / deco: a main photo, which gets the photo decor of the template (corner brackets, inset frame, blob behind).
   */
  const picture = (slot, o = {}) => {
    const framed = o.frame && st.images === 'framed';
    // Main photos (frame) taller or wider per the photo ratio of the template
    const height = o.height && Math.round(o.height * ((o.frame && PHOTO_RATIO[st.photoRatio]) || 1));
    const settings = {
      image: image(),
      image_size: o.size || 'large',
      align: o.align || 'center',
      width: o.width ? px(o.width) : px(100, '%'),
      ...(o.width ? (o.mobileWidth ? { width_mobile: px(o.mobileWidth) } : {}) : { width_mobile: px(100, '%') }),
      ...(o.round !== false && st.images === 'arch' && !o.wide ? { image_border_radius: archCorners } : o.round !== false && imgRadius ? { image_border_radius: corners(imgRadius) } : {}),
    };
    // "framed": an offset block of the secondary color behind the photo; otherwise a soft shadow
    if (framed) Object.assign(settings, { image_box_shadow_box_shadow_type: 'yes', image_box_shadow_box_shadow: { horizontal: 18, vertical: 18, blur: 0, spread: 0, color: c.secondary } });
    else if (o.frame) Object.assign(settings, { image_box_shadow_box_shadow_type: 'yes', image_box_shadow_box_shadow: boxShadow(18, 40, 0.14) });
    if (height) Object.assign(settings, { height: px(height), height_tablet: px(Math.round(height * 0.8)), height_mobile: px(o.mobileHeight || 260), 'object-fit': 'cover' });
    if (o.url) Object.assign(settings, { link_to: 'custom', link: link(o.url) });
    const deco = (o.frame || o.deco) && { grid: 'esg-brackets', frame: 'esg-frame', blob: 'esg-blob' }[st.decor];
    // Photos (not the logo) take the photo treatment of the template (CSS of the header)
    const tone = slot !== 'logo' && st.photoTone && st.photoTone !== 'natural' && 'esg-photo';
    // "tilted" signature: the main photos slightly tilted
    const tilt = o.frame && st.signature === 'tilted' && 'esg-tilt';
    const classes = [deco, tone, tilt].filter(Boolean).join(' ');
    if (classes) settings._css_classes = classes;
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
      if (it.hint) field(el, `icon_list.${i}.text`, { hint: it.hint, max: it.max || 40, share: it.share });
      else mark(el, `icon_list.${i}.text`, { fixed: true });
      if (it.url && !isContactLink(it.url)) mark(el, `icon_list.${i}.link.url`, { fixed: true });
    });
    return el;
  };
  /** Icon box. o: { position, align, titleSize, url, light (on a photo), fixed | titleHint + textHint } */
  const iconBox = (icon, title, desc, o = {}) => {
    // Icon beside the text (left or right): smaller icon and spacing
    const left = o.position === 'left' || o.position === 'right';
    const el = widget('icon-box', {
      selected_icon: { value: icon, library: 'fa-solid' },
      view: 'stacked',
      shape: st.buttons === 'square' ? 'square' : 'circle',
      position: o.position || 'top',
      text_align: o.align || (o.position === 'left' ? 'left' : o.position === 'right' ? 'right' : 'center'),
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
    if (o.light) Object.assign(el.settings, { primary_color: c.secondary, secondary_color: c.onSecondary, title_color: '#FFFFFF', description_color: 'rgba(255,255,255,0.86)' });
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
    if (spec.layout.services === 'list') {
      // Numbered row: photo on one side, number + title + text on the other (alternating), thin line below
      const img = box([picture('service_list', { service: index, height: 300, mobileHeight: 230, url: service.url, size: 'medium_large', wide: true })], { width: 42, tablet: 100, overflow: true, zoom: true, radius: imgRadius });
      const txt = box(
        [
          heading(String(index + 1).padStart(2, '0'), { tag: 'p', size: 15, weight: '700', color: ink.kicker, fixed: true }),
          heading(service.name, { tag: 'h3', size: 30, url: service.url, fixed: true }),
          text(desc, { size: 16, hint, max: 170 }),
          button(`${L.readMore} →`, service.url, { variant: 'link', fixed: true }),
        ],
        { width: 52, tablet: 100, gap: 12 }
      );
      return box(index % 2 ? [txt, img] : [img, txt], { row: true, justify: 'space-between', gap: 32, anim: o.anim, css: 'esg-svc-row' });
    }
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
      { width: o.width, card: true, on: o.on, pad: 0, overflow: true, gap: 0, anim: o.anim, lift: true, zoom: true }
    );
  };
  /** One review, without photo of the customer: quote mark, 5 stars, text, name and role. o: { align, light, big (large serif quote) } */
  const review = (r, i, o = {}) => {
    const align = o.align || 'center';
    const quote = widget('icon', { selected_icon: { value: 'fas fa-quote-left', library: 'fa-solid' }, view: 'default', primary_color: o.light ? c.secondary : tint(c.secondary, 0.25), size: px(o.big ? 44 : 30), align });
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
      ...(o.big
        ? typo('content_', fonts.heading, 27, '400', { content_typography_font_style: 'italic', content_typography_line_height: px(1.45, 'em'), content_typography_font_size_mobile: px(20) })
        : typo('content_', fonts.body, 16, '400', { content_typography_font_style: 'italic', content_typography_line_height: px(1.7, 'em') })),
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

  return { id, c, ink, L, st, fonts, pad, radius, imgRadius, marks, mark, fill, bands, section, box, columns, heading, kicker, line, text, button, picture, iconList, iconBox, serviceCard, review, shortcode, html, widget, typo };
}

// ---------------------------------------------------------------------------------------------
// Shared sections
// ---------------------------------------------------------------------------------------------

/**
 * Title block of a section: small label, title (+ accent line or side bar, per the title style), intro text.
 * parts: { kicker?, title, text? } each { value, hint, max } or { value, fixed }.
 * o: { align (default: the template alignment), light (on a photo / dark band), fill (as wide as its column, never wider) }
 * An explicit left alignment means the block is in a side column (beside cards, steps, a form…): it then
 * fills that column instead of its fixed width, which would run over the content beside it, and its
 * title is smaller, so a long one stays a few lines.
 */
function intro(b, parts, o = {}) {
  const bar = b.st.titles === 'bar';
  const align = bar ? 'left' : o.align || b.st.align;
  const column = o.fill || o.align === 'left';
  const light = o.light;
  const els = [];
  if (b.st.signature === 'numbers') els.push(sectionNumber(b));
  if (parts.kicker) els.push(b.kicker(parts.kicker.value, { ...parts.kicker, align, color: light ? b.c.secondary : undefined, onDark: light }));
  els.push(b.heading(parts.title.value, { ...parts.title, align, bar, hl: true, color: light ? '#FFFFFF' : undefined, ...(column ? { size: 34 } : {}) }));
  if (b.st.titles === 'line') els.push(b.line(align));
  if (parts.text) els.push(b.text(parts.text.value, { ...parts.text, align, color: light ? 'rgba(255,255,255,0.86)' : undefined }));
  if (column) return b.box(els, { gap: 12, align: align === 'center' ? 'center' : 'stretch' });
  return align === 'center' ? b.box(els, { maxWidth: 760, gap: 12, align: 'center' }) : b.box(els, { maxWidth: 820, gap: 12, align: 'stretch' });
}

/** "numbers" signature: the number of the section (CSS counter of the page) in large outlined figures above its title. */
function sectionNumber(b) {
  const el = b.html('<div class="esg-num" aria-hidden="true"></div>');
  b.mark(el, 'html', { fixed: true });
  return el;
}

const shape = (b, color) => ({ shape: b.spec.layout.divider, color });

/**
 * Class of the first section of a page when it is a photo (hero, banner, article hero) and the
 * header is "transparent": the header then lies over it with white links (CSS of the header).
 */
const underHeader = (b) => (b.spec.layout.header === 'transparent' ? 'esg-under' : undefined);

/**
 * Surface of each Home section for its layout: page color ("bg"), tinted ("alt"), or a colored or
 * photo band ("band", never changed by the rhythm).
 */
const NATURAL_SURFACE = {
  about: () => 'bg',
  features: (l) => (l.features === 'cards' ? 'band' : l.features === 'icons' || l.features === 'center' ? 'alt' : 'bg'),
  cta: (l) => (l.cta === 'split' || l.cta === 'photo-split' ? 'bg' : 'band'),
  services: (l) => (l.services === 'boxed' ? 'alt' : 'bg'),
  gallery: () => 'bg',
  reviews: (l) => (l.testimonials === 'band' ? 'band' : l.testimonials === 'cards' ? 'alt' : 'bg'),
  stats: (l) => (l.stats === 'band' ? 'band' : l.stats === 'cards' ? 'alt' : 'bg'),
  process: () => 'bg',
  faq: () => 'alt',
  highlights: () => 'band',
};

/**
 * Backgrounds of the plain sections of a page, per the rhythm of the template (b.surfaces, read by
 * the section builders): "fixed" keeps the surface of each layout; "alternate" switches a section
 * to the other surface when the section before it has the same one; "lines" puts every plain
 * section on the page color (sectionLines then draws a thin line between neighbours).
 * entries: [{ id, natural }] in page order; before: surface of the hero / banner above them.
 */
function planSurfaces(b, entries, before) {
  const out = {};
  let prev = before;
  for (const { id, natural } of entries) {
    let s = natural;
    if (natural !== 'band' && b.st.rhythm === 'lines') s = 'bg';
    else if (natural !== 'band' && b.st.rhythm === 'alternate' && prev === natural) s = natural === 'bg' ? 'alt' : 'bg';
    out[id] = s;
    prev = s;
  }
  b.surfaces = out;
}
const surface = (b, id, natural) => b.surfaces?.[id] || natural;
/** Background color of a plain section, and what its cards stand on. */
const surfaceBg = (b, id, natural) => (surface(b, id, natural) === 'alt' ? b.ink.alt : b.ink.bg);
const surfaceOn = (b, id, natural) => (surface(b, id, natural) === 'alt' ? 'alt' : 'base');

/** "lines" rhythm: a thin line on top of each plain section that follows another plain section. ids: section id of each element of `out`. */
function sectionLines(b, out, ids) {
  if (b.st.rhythm !== 'lines') return;
  const plain = (id) => ['bg', 'alt'].includes(b.surfaces?.[id]);
  for (let i = 1; i < out.length; i++) {
    if (plain(ids[i - 1]) && plain(ids[i])) Object.assign(out[i].settings, { border_border: 'solid', border_width: sides(1, 0, 0, 0), border_color: b.ink.border });
  }
}

/**
 * "edges: all": the colored and photo bands of a page (key numbers, review band, call to action
 * banner, "why choose us" over a photo) get the divider shape of the template on their top and
 * bottom edges, in the color of the plain section next to them. Lower than the hero edge, so it
 * stays clear of the band content.
 */
function bandEdges(b, out) {
  const shapeName = b.spec.layout.divider;
  if (b.st.edges !== 'all' || shapeName === 'none') return;
  const height = Math.min(48, Math.round((SHAPE_HEIGHT[shapeName] || 70) * 0.6));
  const plain = (s) => (s && s.background_background === 'classic' && !s.background_image ? s.background_color : null);
  out.forEach((el, i) => {
    if (!b.bands.has(el)) return;
    for (const [side, neighbour] of [['top', out[i - 1]], ['bottom', out[i + 1]]]) {
      const color = plain(neighbour?.settings);
      if (!color) continue;
      Object.assign(el.settings, {
        [`shape_divider_${side}`]: shapeName,
        [`shape_divider_${side}_color`]: color,
        [`shape_divider_${side}_width`]: px(100, '%'),
        [`shape_divider_${side}_height`]: px(height),
        [`shape_divider_${side}_height_mobile`]: px(Math.min(height, 24)),
      });
    }
  });
}

/**
 * Banner of the inner pages, per the subheader layout: the page title over a photo ("photo"), on a
 * tinted band with a breadcrumb and no photo ("plain"), or beside a photo ("split").
 */
function subheader(b, site, role, nextBg = b.ink.bg) {
  const variant = b.spec.layout.subheader;
  const center = b.st.align === 'center' && b.st.titles !== 'bar' && variant !== 'split';
  const align = center ? 'center' : 'left';
  if (variant === 'plain' || variant === 'split') {
    const bar = b.st.titles === 'bar';
    // Breadcrumb as a text (not a heading): the page title stays the first heading of the banner, as in the photo banner
    const crumb = b.text(`${site.pages.home.title} / ${site.pages[role].title}`, { align, size: 13, color: b.ink.kicker, fixed: true });
    Object.assign(crumb.settings, { typography_font_weight: '600', typography_text_transform: 'uppercase', typography_letter_spacing: px(1.5) });
    const content = [
      crumb,
      b.heading(site.pages[role].title, { tag: 'h1', size: 56, align, bar, fixed: true }),
      ...(b.st.titles === 'line' ? [b.line(align)] : []),
      b.text(b.spec.copy.subheaderText, { align, size: 18, hint: `short sentence under the title "${site.pages[role].title}" in the page banner`, max: 140 }),
    ];
    // The band stands out from the section below it
    const bg = nextBg === b.ink.alt ? b.ink.bg : b.ink.alt;
    if (variant === 'plain') {
      return b.section([b.box(content, { maxWidth: center ? 820 : 900, gap: 14, align: center ? 'center' : 'stretch', anim: 0 })], {
        bg,
        padY: Math.round(b.pad * 1.1),
        align: center ? 'center' : 'flex-start',
        borderBottom: b.ink.border,
      });
    }
    return b.section(
      [b.box(content, { width: 50, gap: 14, anim: 0 }), b.box([b.picture('subheader', { height: 380, mobileHeight: 220, frame: true })], { width: 44, anim: 150 })],
      { row: true, bg, padY: Math.round(b.pad * 0.8) }
    );
  }
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
      css: underHeader(b),
    }
  );
}

const featureHints = (i, n) => ({ titleHint: `strength ${i + 1} of ${n} of the business (short title, 2–4 words)`, textHint: `explanation of strength ${i + 1} (1–2 sentences)` });

function features(b) {
  const { copy, icons, layout } = b.spec;
  // The first strengths (most important first), as many as the layout shows
  const n = featureCount(layout);
  const shown = copy.features.slice(0, n);
  const parts = {
    kicker: { value: copy.featuresKicker, hint: 'small label above the "Why choose us" title', max: 40 },
    title: { value: copy.featuresTitle, hint: '"Why choose us" section title', max: 60 },
    text: { value: copy.featuresText, hint: 'intro of the "why choose us" section (1 sentence)', max: 200 },
  };
  // "bento": the first strength large over a photo, the others as compact cards beside it (stacked, or 2 × 2 for four)
  if (layout.features === 'bento') {
    const [first, ...rest] = shown;
    const grid = rest.length > 3;
    const big = b.box([b.iconBox(icons[0], first.title, first.text, { light: true, align: 'left', titleSize: 26, ...featureHints(0, n) })], {
      width: 48,
      tablet: 100,
      slot: 'photo',
      overlay: [rgba(b.c.dark, 0.2), rgba(b.c.dark, 0.92), 180],
      minHeightPx: 440,
      justify: 'flex-end',
      pad: 40,
      radius: b.imgRadius,
      anim: 0,
    });
    const small = rest.map((f, i) =>
      b.box([b.iconBox(icons[i + 1], f.title, f.text, { position: 'left', ...featureHints(i + 1, n) })], { card: true, on: surfaceOn(b, 'features', 'bg'), pad: 26, anim: (i + 1) * 120, lift: true, ...(grid ? { width: 48, tablet: 48, mobile: 100 } : {}) })
    );
    return b.section([intro(b, parts), b.box([big, b.box(small, { width: 48, tablet: 100, gap: 20, justify: 'space-between', ...(grid ? { row: true, align: 'stretch' } : {}) })], { row: true, gap: 24, align: 'stretch', justify: 'space-between' })], {
      bg: surfaceBg(b, 'features', 'bg'),
      align: 'center',
      gap: 44,
    });
  }
  // "split": title and the strengths as a list (thin lines between them) beside a large photo, on the other side than the About photo
  if (layout.features === 'split') {
    const items = shown.map((f, i) =>
      b.box([b.iconBox(icons[i], f.title, f.text, { position: 'left', ...featureHints(i, n) })], { anim: i * 100, ...(i ? { padding: [22, 0, 0, 0], border: [1, 0, 0, 0, b.ink.border] } : {}) })
    );
    const list = b.box([intro(b, parts, { align: 'left' }), b.box(items, { gap: 22 })], { width: 48, gap: 36 });
    const photo = b.box([b.picture('photo', { height: 600, mobileHeight: 300, frame: true })], { width: 44, anim: 0 });
    return b.section(layout.about === 'image-right' ? [photo, list] : [list, photo], { row: true, bg: surfaceBg(b, 'features', 'bg') });
  }
  // "center": a photo in the middle, half of the strengths on each side facing it (stacked on tablets and phones)
  if (layout.features === 'center') {
    const half = Math.ceil(shown.length / 2);
    const side = (list, offset, right) =>
      b.box(
        list.map((f, j) => {
          const i = offset + j;
          const el = b.iconBox(icons[i], f.title, f.text, { position: right ? 'right' : 'left', ...featureHints(i, n) });
          if (right) Object.assign(el.settings, { position_tablet: 'left', text_align_tablet: 'left' });
          return b.box([el], { anim: i * 120 });
        }),
        { width: 30, tablet: 100, gap: 44 }
      );
    const photo = b.box([b.picture('photo', { height: 540, mobileHeight: 300, frame: true })], { width: 32, tablet: 100, anim: 0 });
    return b.section(
      [intro(b, parts), b.box([side(shown.slice(0, half), 0, true), photo, side(shown.slice(half), half, false)], { row: true, gap: 32, align: 'center', justify: 'space-between' })],
      { bg: surfaceBg(b, 'features', 'alt'), align: 'center', gap: 56 }
    );
  }
  // "list": title on the left, the strengths in two columns (icon beside the text, no cards)
  if (layout.features === 'list') {
    const items = shown.map((f, i) => b.box([b.iconBox(icons[i], f.title, f.text, { position: 'left', ...featureHints(i, n) })], { width: 47, tablet: 100, anim: i * 100 }));
    return b.section([b.box([intro(b, parts, { align: 'left' })], { width: 36 }), b.box(items, { width: 58, row: true, gap: 32, align: 'flex-start', justify: 'space-between' })], {
      row: true,
      bg: surfaceBg(b, 'features', 'bg'),
      align: 'flex-start',
    });
  }
  const onPhoto = layout.features === 'cards';
  const items = shown.map((f, i) => b.box([b.iconBox(icons[i], f.title, f.text, featureHints(i, n))], { width: b.columns(n === 4 ? 4 : 3), card: true, on: onPhoto ? 'photo' : surfaceOn(b, 'features', 'alt'), pad: 30, anim: i * 120, lift: true }));
  return b.section(
    [intro(b, parts, { light: onPhoto }), b.box(items, { row: true, gap: 24, align: 'stretch', justify: n === 5 ? 'center' : 'space-between' })],
    onPhoto ? { slot: 'photo', overlay: [rgba(b.c.dark, 0.9), rgba(b.c.dark, 0.78), 180], align: 'center', gap: 44, band: true } : { bg: surfaceBg(b, 'features', 'alt'), align: 'center', gap: 44 }
  );
}

function cta(b, site) {
  const { copy, layout } = b.spec;
  // Without a phone number the "phone" band is a banner
  const variant = layout.cta === 'phone' && !site.phone ? 'banner' : layout.cta;
  const banner = variant === 'banner';
  const title = b.heading(copy.ctaTitle, { size: 40, color: '#FFFFFF', align: banner ? 'center' : 'left', hint: 'call to action title: invite to contact the business (short, at most 8 words)', max: 70 });
  const body = b.text(copy.ctaText, { color: 'rgba(255,255,255,0.9)', align: banner ? 'center' : 'left', size: 18, hint: 'call to action text (1–2 sentences)', max: 200 });
  const btn = b.button(copy.ctaButton, site.pages.contact.url, { variant: 'secondary', align: banner ? 'center' : variant === 'split' ? 'right' : 'left', hint: 'call to action button text (leads to the contact page)', max: 30 });
  // "phone": a colored band, the invitation on the left, the phone number in large type and the button on the right
  if (variant === 'phone') {
    const icon = b.widget('icon', {
      selected_icon: { value: 'fas fa-phone-alt', library: 'fa-solid' },
      view: 'stacked',
      shape: b.st.buttons === 'square' ? 'square' : 'circle',
      primary_color: b.c.secondary,
      secondary_color: b.c.onSecondary,
      size: px(20),
      icon_padding: px(16),
    });
    const number = b.heading(site.phone, { tag: 'p', size: 36, color: '#FFFFFF', url: `tel:${telHref(site.phone)}`, fixed: true });
    return b.section(
      [b.box([title, body], { width: 54, gap: 12, anim: 0 }), b.box([b.box([icon, number], { row: true, gap: 16 }), btn], { width: 40, gap: 20, align: 'flex-start', anim: 150 })],
      { row: true, ...b.fill(), padY: Math.round(b.pad * 0.8), band: true }
    );
  }
  // "photo-split": a photo beside a colored panel, the two with rounded outer corners
  if (variant === 'photo-split') {
    const panel = b.box([title, body, btn], { width: 50, tablet: 100, ...b.fill(), pad: 56, gap: 18, justify: 'center', anim: 0 });
    const photo = b.box([], { width: 50, tablet: 100, slot: 'photo', minHeightPx: 420 });
    return b.section([b.box([photo, panel], { row: true, gap: 0, align: 'stretch', overflow: true, radius: b.st.buttons === 'square' ? 0 : Math.min(b.radius + 6, 24) })], {
      bg: surfaceBg(b, 'cta', 'bg'),
      padY: Math.round(b.pad * 0.7),
    });
  }
  if (banner) {
    return b.section([b.box([title, body, btn], { maxWidth: 820, gap: 18, align: 'center', anim: 0 })], {
      slot: 'photo',
      overlay: [rgba(b.c.primary, 0.92), rgba(b.c.dark, 0.9), 135],
      align: 'center',
      band: true,
    });
  }
  // A rounded colored band floating on the page
  return b.section(
    [
      b.box([b.box([title, body], { width: 64, gap: 12 }), b.box([btn], { width: 30, align: 'flex-end' })], {
        row: true,
        card: true,
        ...b.fill(),
        pad: 56,
        justify: 'space-between',
        anim: 0,
      }),
    ],
    { bg: surfaceBg(b, 'cta', 'bg'), padY: Math.round(b.pad * 0.7) }
  );
}

function reviews(b) {
  const { copy, layout } = b.spec;
  const parts = {
    kicker: { value: copy.reviewsKicker, hint: 'small label above the reviews title', max: 40 },
    title: { value: copy.reviewsTitle, hint: 'title of the customer reviews section', max: 60 },
  };
  // "quote": the first review large in the title font, the other two smaller below a thin line
  if (layout.testimonials === 'quote') {
    const [first, ...others] = copy.reviews;
    return b.section(
      [
        intro(b, parts, { align: 'center' }),
        b.box(b.review(first, 0, { big: true }), { maxWidth: 900, gap: 16, align: 'center', anim: 0 }),
        b.box(
          others.map((r, i) => b.box(b.review(r, i + 1), { width: 47, tablet: 100, gap: 10, align: 'center', anim: (i + 1) * 120 })),
          { row: true, gap: 32, align: 'stretch', justify: 'space-between', maxWidth: 1000, css: 'esg-quote-more' }
        ),
      ],
      { bg: surfaceBg(b, 'reviews', 'bg'), align: 'center', gap: 48 }
    );
  }
  // "side": the title and large stars on the left, the reviews one under the other on the right, thin lines between them
  if (layout.testimonials === 'side') {
    const stars = b.widget('star-rating', { rating_scale: '5', rating: '5', star_style: 'star_fontawesome', stars_color: b.c.secondary, icon_size: px(28), align: 'left' });
    const head = b.box([intro(b, parts, { align: 'left' }), stars], { width: 34, gap: 20 });
    const items = copy.reviews.map((r, i) => b.box(b.review(r, i, { align: 'left' }), { gap: 10, anim: i * 120, ...(i ? { padding: [30, 0, 0, 0], border: [1, 0, 0, 0, b.ink.border] } : {}) }));
    return b.section([head, b.box(items, { width: 58, gap: 30 })], { row: true, bg: surfaceBg(b, 'reviews', 'bg'), align: 'flex-start' });
  }
  const band = layout.testimonials === 'band';
  const cards = layout.testimonials === 'cards';
  const align = cards ? 'left' : 'center';
  return b.section(
    [
      intro(b, parts, { light: band }),
      b.box(
        b.spec.copy.reviews.map((r, i) => b.box(b.review(r, i, { align, light: band }), { width: b.columns(3), card: cards, on: surfaceOn(b, 'reviews', 'alt'), pad: cards ? 34 : 10, gap: 12, tablet: 100, align: cards ? 'stretch' : 'center', anim: i * 120, lift: cards })),
        { row: true, gap: 24, align: 'stretch', justify: 'space-between' }
      ),
    ],
    band ? { ...b.fill(), align: 'center', gap: 44, band: true } : { bg: surfaceBg(b, 'reviews', cards ? 'alt' : 'bg'), align: 'center', gap: 44 }
  );
}

/**
 * Image + text (about teaser on Home, "Chi siamo" on the About page): image on the left or on the
 * right of the text, ("wide") text on top and a wide photo below, or ("triptych") the text between
 * two photos. ("stacked" is built by aboutTeaser: it splits the title from the text.)
 */
function mediaRow(b, content, o = {}) {
  const variant = o.imageFirst === undefined ? b.spec.layout.about : o.imageFirst ? 'image-left' : 'image-right';
  if (variant === 'wide') {
    return b.section(
      [b.box(content, { maxWidth: 860, gap: 16, align: 'stretch' }), b.box([b.picture('photo', { height: o.wideHeight || 460, frame: true, wide: true })], { anim: 0 })],
      { bg: o.bg || b.ink.bg, align: 'center', gap: 48 }
    );
  }
  // "collage": a large photo and a smaller one overlapping its bottom-right corner, cut out by a border of the section color
  if (variant === 'collage') {
    const bg = o.bg || b.ink.bg;
    const inset = b.picture('photo', { height: 260, mobileHeight: 190 });
    Object.assign(inset.settings, { image_border_border: 'solid', image_border_width: corners(10), image_border_color: bg });
    const small = b.box([inset], { width: 52, tablet: 52, mobile: 72, margin: [-150, 0, 0, 0], zIndex: 2, anim: 200 });
    small.settings._flex_align_self = 'flex-end';
    const img = b.box([b.box([b.picture('photo', { height: o.height || 440, frame: true })], { width: 80, tablet: 80, mobile: 100 }), small], { width: 46, gap: 0, anim: 0 });
    return b.section([img, b.box(content, { width: 48, gap: 16 })], { row: true, bg });
  }
  // "triptych": the text between two photos, the second one lower and smaller (only on desktop)
  if (variant === 'triptych') {
    return b.section(
      [
        b.box([b.picture('photo', { height: o.height || 460, frame: true })], { width: 27, tablet: 100, anim: 0 }),
        b.box(content, { width: 38, tablet: 100, gap: 16, align: 'center' }),
        b.box([b.picture('photo', { height: 380 })], { width: 27, margin: [90, 0, 0, 0], desktopOnly: true, anim: 200 }),
      ],
      { row: true, bg: o.bg || b.ink.bg }
    );
  }
  // "badge": photo on the left with a small colored card (a key figure) overlapping its bottom-left corner
  const stat = b.spec.copy.stats[0];
  const badge = variant === 'badge'
    ? [b.box([b.heading(stat.value, { tag: 'p', size: 44, color: '#FFFFFF', ...statHints(0).value }), b.text(stat.label, { size: 14, color: 'rgba(255,255,255,0.86)', ...statHints(0).label })], { maxWidth: 230, ...b.fill(), pad: 28, gap: 2, radius: b.st.buttons === 'square' ? 0 : Math.min(b.radius + 6, 24), margin: [-96, 0, 0, 28], zIndex: 2, anim: 200, css: 'esg-badge' })]
    : [];
  const img = b.box([b.picture('photo', { height: o.height || 460, frame: !badge.length }), ...badge], { width: 46, anim: 0 });
  const txt = b.box(content, { width: 48, gap: 16 });
  return b.section(variant === 'image-right' ? [txt, img] : [img, txt], { row: true, bg: o.bg || b.ink.bg });
}

/** Accent line under a left-aligned title (only for the "line" title style). */
const titleLine = (b) => (b.st.titles === 'line' ? [b.line()] : []);

/** Full-screen hero (the editorial hero keeps its height: title + wide photo). */
const fullHero = (layout) => layout.heroHeight === 'full' && layout.hero !== 'editorial';
/** The arrow to the next section: full-screen heroes, except "bottom" whose title already sits at the bottom. */
const hasScrollCue = (layout) => fullHero(layout) && layout.hero !== 'bottom';
/** Height of the shaped bottom edge of the hero (the arrow stands above it). */
const heroEdge = (layout) => (layout.hero !== 'split' && layout.divider !== 'none' ? SHAPE_HEIGHT[layout.divider] || 70 : 0);
/** CSS id of the section after the hero, target of the arrow. */
const NEXT_ID = 'esg-next';

/**
 * Three short phrases under the hero title, taking turns in the same place (CSS of the header,
 * no script: without it they stay readable one under the other). The H1 does not change.
 */
function rotatingPhrases(b, align, color) {
  const phrases = b.spec.copy.heroPhrases.map((x, i) =>
    b.heading(x, { tag: 'p', size: 26, align, color, hint: `rotating phrase ${i + 1} of 3 under the hero title: a short benefit or service of the business (2–5 words), different from the others`, max: 40 })
  );
  return b.box(phrases, { gap: 0, css: 'esg-rotate' });
}

/**
 * "stamp" signature: a round stamp with the business name around a dot, slowly turning in the
 * bottom-right corner of the hero (site CSS; only from 1200px wide, where it never reaches the text).
 */
function heroStamp(b, site, color) {
  const name = String(site.siteName || '').toUpperCase();
  const text = `${name} • `.repeat(Math.max(2, Math.ceil(36 / (name.length + 3))));
  // Font size so that the text goes once around the circle (283 units), at most 10
  const size = Math.min(10, 283 / (text.length * 0.72)).toFixed(1);
  const el = b.html(
    '<div class="esg-stamp" aria-hidden="true"><svg viewBox="0 0 120 120" width="100%" height="100%">' +
      '<path id="esg-stamp-path" d="M60,60 m-45,0 a45,45 0 1,1 90,0 a45,45 0 1,1 -90,0" fill="none"/>' +
      `<text font-size="${size}" font-weight="700" letter-spacing="1" fill="${color}" font-family="${escapeAttr(b.fonts.body)},sans-serif"><textPath href="#esg-stamp-path" textLength="280" lengthAdjust="spacingAndGlyphs">${escapeHtml(text)}</textPath></text>` +
      `<circle cx="60" cy="60" r="6" fill="${b.c.secondary}"/></svg></div>`
  );
  el.settings._css_classes = 'esg-stamp-w';
  b.mark(el, 'html', { fixed: true });
  return el;
}

/** Arrow at the bottom of a full-screen hero, leading to the next section (CSS of the header: centered at the bottom, bobbing). */
function scrollCue(b, color) {
  // An #anchor is not a link field (analyze.js): the AI and the export leave it as it is
  return b.widget('icon', {
    selected_icon: { value: 'fas fa-chevron-down', library: 'fa-solid' },
    view: 'default',
    primary_color: color,
    hover_primary_color: b.c.secondary,
    size: px(22),
    align: 'center',
    link: link(`#${NEXT_ID}`),
    _css_classes: 'esg-scroll',
  });
}

// ---------------------------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------------------------

function hero(b, site) {
  const { copy, layout } = b.spec;
  const tel = `tel:${telHref(site.phone)}`;
  const variant = layout.hero;
  // Light texts on a photo, or on the brand color ("color")
  const onImage = variant === 'center' || variant === 'left' || variant === 'bottom' || variant === 'slideshow' || variant === 'color';
  const align = variant === 'center' || variant === 'editorial' || variant === 'slideshow' ? 'center' : 'left';
  const css = underHeader(b);
  // Beside the photo ("split", "color") the title has half the width: a smaller size keeps long words inside it
  const size = variant === 'bottom' ? 66 : variant === 'editorial' ? 64 : variant === 'split' || variant === 'color' ? 50 : 58;
  // Buttons: contact + call ("two"), contact only ("one"), or contact + a text link with a phone icon ("link").
  // Built after the texts (element ids, hence field ids, follow the creation order)
  const buttons = () => {
    const list = [b.button(copy.heroButton, site.pages.contact.url, { variant: onImage ? 'secondary' : 'main', hint: 'main hero button (leads to the contact page)', max: 30 })];
    const callHint = { hint: 'second hero button: call the business by phone', max: 30 };
    if (layout.heroButtons === 'link') {
      list.push(b.button(copy.heroButton2, tel, { variant: 'link', icon: 'fas fa-phone-alt', color: onImage ? '#FFFFFF' : b.ink.heading, hoverColor: onImage ? b.c.secondary : b.ink.kicker, ...callHint }));
    } else if (layout.heroButtons !== 'one') {
      list.push(b.button(copy.heroButton2, tel, { variant: 'outline', outlineColor: onImage ? '#FFFFFF' : b.ink.heading, ...callHint }));
    }
    return b.box(list, { row: true, gap: layout.heroButtons === 'link' ? 28 : 14, justify: align === 'center' ? 'center' : 'flex-start' });
  };
  const content = [
    b.kicker(copy.heroKicker, { align, color: onImage ? b.c.secondary : undefined, onDark: onImage, vertical: false, hint: 'short tagline above the main title', max: 50 }),
    b.heading(copy.heroTitle, { tag: 'h1', size, align, hl: true, color: onImage ? '#FFFFFF' : undefined, hint: 'main title of the site (H1): the promise of the business, with its activity and city (at most 9 words)', max: 70 }),
    ...(layout.heroPhrases === 'rotating' ? [rotatingPhrases(b, align, onImage ? b.c.secondary : b.ink.kicker)] : []),
    b.text(copy.heroText, { align, color: onImage ? 'rgba(255,255,255,0.9)' : undefined, size: 19, hint: 'hero subtitle (1–2 sentences)', max: 200 }),
    buttons(),
  ];
  const edge = shape(b, b.ink.bg);
  // Height (vh): the one of the layout, the whole screen with an arrow to the next section ("full"), or lower ("compact")
  const height = (base) => ({ full: 100, compact: Math.min(base, base > 90 ? 72 : 66) })[layout.heroHeight] || base;
  const light = variant === 'split' || variant === 'editorial';
  const cue = [
    ...(hasScrollCue(layout) ? [scrollCue(b, light ? b.ink.heading : '#FFFFFF')] : []),
    ...(b.st.signature === 'stamp' && site.siteName ? [heroStamp(b, site, light ? b.ink.heading : '#FFFFFF')] : []),
  ];
  // Room for the arrow under the content: when the content is taller than the screen (phones) it would lie on the buttons
  const cuePad = hasScrollCue(layout) ? { padBottom: Math.max(b.pad, heroEdge(layout) + 100) } : {};
  if (variant === 'editorial') {
    // Magazine opening: big centered title on the page color, a wide photo below
    return b.section(
      [b.box(content, { maxWidth: 900, gap: 22, align: 'center', anim: 0 }), b.box([b.picture('hero', { height: 560, mobileHeight: 280, wide: true, deco: true })], { anim: 200, overflow: true, zoom: true, radius: b.imgRadius }), ...cue],
      { bg: b.ink.alt, align: 'center', gap: 56, padY: Math.round(b.pad * 1.1) }
    );
  }
  if (variant === 'split') {
    return b.section([b.box(content, { width: 50, gap: 20 }), b.box([b.picture('hero', { height: 540, mobileHeight: 300, frame: true })], { width: 46, anim: 0 }), ...cue], {
      row: true,
      bg: b.ink.alt,
      minHeight: height(80),
      ...cuePad,
    });
  }
  if (variant === 'color') {
    // The text on the brand color (no photo behind it), the hero photo framed beside it
    return b.section([b.box(content, { width: 52, gap: 20, anim: 0 }), b.box([b.picture('hero', { height: 520, mobileHeight: 280, frame: true })], { width: 42, anim: 150 }), ...cue], {
      row: true,
      ...b.fill(),
      minHeight: height(84),
      ...cuePad,
      divider: edge,
      css,
    });
  }
  if (variant === 'card') {
    // Full photo with the text in a card on the left
    return b.section([b.box(content, { maxWidth: 620, card: true, on: 'photo', pad: 52, gap: 20, anim: 0 }), ...cue], {
      slot: 'hero',
      overlay: [rgba(b.c.dark, 0.35), rgba(b.c.dark, 0.15), 90],
      minHeight: height(86),
      ...cuePad,
      align: 'flex-start',
      divider: edge,
      css,
    });
  }
  if (variant === 'bottom') {
    // Big title at the bottom of a full-height photo
    return b.section([b.box(content, { maxWidth: 900, gap: 20, align: 'flex-start', anim: 0 }), ...cue], {
      slot: 'hero',
      overlay: [rgba(b.c.dark, 0.1), rgba(b.c.dark, 0.94), 180],
      minHeight: height(94),
      align: 'flex-start',
      justify: 'flex-end',
      padBottom: Math.round(b.pad * 1.1),
      divider: edge,
      css,
    });
  }
  if (variant === 'slideshow') {
    // Centered text over a slideshow of photos (Elementor background slideshow: fade + slow Ken Burns zoom)
    return b.section([b.box(content, { maxWidth: 860, gap: 20, align: 'center', anim: 0 }), ...cue], {
      slideshow: true,
      overlay: [rgba(b.c.dark, 0.5), rgba(b.c.dark, 0.82), 180],
      minHeight: height(92),
      ...cuePad,
      align: 'center',
      divider: edge,
      css,
    });
  }
  return b.section([b.box(content, { maxWidth: variant === 'left' ? 680 : 860, gap: 20, align: variant === 'left' ? 'flex-start' : 'center', anim: 0 }), ...cue], {
    slot: 'hero',
    overlay: variant === 'left' ? [rgba(b.c.dark, 0.9), rgba(b.c.dark, 0.3), 90] : [rgba(b.c.dark, 0.55), rgba(b.c.dark, 0.8), 180],
    minHeight: height(88),
    ...cuePad,
    align: variant === 'left' ? 'flex-start' : 'center',
    divider: edge,
    css,
  });
}

/** "Chi siamo" teaser of the Home page. */
function aboutTeaser(b, site) {
  const { copy, layout } = b.spec;
  const bar = b.st.titles === 'bar';
  // "triptych": the text centered between the photos
  const align = layout.about === 'triptych' && !bar ? 'center' : 'left';
  const head = [
    ...(b.st.signature === 'numbers' ? [sectionNumber(b)] : []),
    b.kicker(copy.aboutKicker, { align, hint: 'small label of the "about us" section', max: 30 }),
    b.heading(copy.aboutTitle, { align, bar, hl: true, hint: '"About us" section title', max: 70 }),
    ...(b.st.titles === 'line' ? [b.line(align)] : []),
  ];
  const body = [
    b.text(copy.aboutText, { align, dropcap: align === 'left', hint: 'short presentation of the business (2–4 sentences)', max: 600 }),
    b.button(copy.aboutButton, site.pages.about.url, { align, hint: 'button "Scopri di più" leading to the About page', max: 30 }),
  ];
  const bg = surfaceBg(b, 'about', 'bg');
  // "sandwich": title and text | a tall photo | key points and button
  if (layout.about === 'sandwich') {
    const points = b.iconList(
      copy.aboutPoints.map((x, i) => ({ text: x, icon: 'fas fa-check-circle', hint: `key point ${i + 1} of 3 of the business in the "about us" section (3–7 words), different from the others`, max: 60 })),
      { size: 17, weight: '600', color: b.ink.heading }
    );
    points.settings.space_between = px(18);
    return b.section(
      [
        b.box([...head, body[0]], { width: 32, tablet: 100, gap: 16 }),
        b.box([b.picture('photo', { height: 540, mobileHeight: 300, frame: true })], { width: 30, tablet: 100, anim: 0 }),
        b.box([points, body[1]], { width: 30, tablet: 100, gap: 28, anim: 150 }),
      ],
      { row: true, bg }
    );
  }
  // "stacked": the title on the left, the text and button on the right, a wide photo below
  if (layout.about === 'stacked') {
    return b.section(
      [
        b.box([b.box(head, { width: 44, tablet: 100, gap: 12 }), b.box(body, { width: 50, tablet: 100, gap: 16, anim: 120 })], { row: true, gap: 32, align: 'flex-start', justify: 'space-between' }),
        b.box([b.picture('photo', { height: 520, mobileHeight: 260, frame: true, wide: true })], { anim: 0 }),
      ],
      { bg, gap: 56 }
    );
  }
  return mediaRow(b, [...head, ...body], { bg });
}

/** Featured services (max 3) + "all services". */
function featuredServices(b, site) {
  const { copy, layout } = b.spec;
  if (!site.services.length) return null;
  const shown = site.services.slice(0, 3);
  const natural = layout.services === 'boxed' ? 'alt' : 'bg';
  const left = b.st.align === 'left' || b.st.titles === 'bar';
  return b.section(
    [
      intro(b, {
        kicker: { value: copy.servicesKicker, hint: 'small label of the services section', max: 30 },
        title: { value: copy.servicesTitle, hint: 'title of the featured services section', max: 60 },
        text: { value: copy.servicesText, hint: 'intro of the services section (1 sentence)', max: 200 },
      }),
      b.box(
        shown.map((s, i) => b.serviceCard(s, i, copy.serviceText, { width: b.columns(shown.length), on: surfaceOn(b, 'services', natural), anim: i * 120 })),
        { row: true, gap: 28, align: 'stretch', justify: shown.length < 3 ? 'center' : 'space-between' }
      ),
      b.button(copy.servicesButton, site.pages.services.url, { align: left ? 'left' : 'center', hint: 'button "Tutti i servizi" leading to the Services page', max: 30 }),
    ],
    { bg: surfaceBg(b, 'services', natural), align: 'center', gap: 44 }
  );
}

/** Photo carousel (Elementor image carousel, free): all the photos, cropped to the same size, with lightbox. */
function homeGallery(b, site) {
  const { copy, layout } = b.spec;
  const left = b.st.align === 'left' || b.st.titles === 'bar';
  const url = site.pages.gallery.url;
  // Title and button built when used: the carousel comes first (element ids, hence field ids, follow the creation order)
  const head = () => intro(b, {
    kicker: { value: copy.galleryKicker, hint: 'small label of the photo gallery section of the Home page', max: 30 },
    title: { value: copy.galleryTitle, hint: 'title of the photo gallery of the Home page (e.g. our works)', max: 60 },
  });
  const more = () => b.button(copy.galleryButton, url, { variant: 'outline', outlineColor: b.ink.heading, align: left ? 'left' : 'center', hint: 'button leading to the Gallery page', max: 30 });
  const bg = surfaceBg(b, 'gallery', 'bg');
  /** One photo of the archive, cropped to `height`, zooming on hover and leading to the Gallery page. */
  const tile = (height, o = {}) =>
    b.box([b.picture('photo', { height, mobileHeight: o.mobileHeight || 200, url, size: 'medium_large', wide: true, round: o.round })], {
      overflow: true,
      zoom: true,
      radius: o.round === false ? 0 : b.imgRadius,
      anim: o.anim,
      ...o.box,
    });
  // "mosaic": one large photo, four small ones in a 2 × 2 grid beside it
  if (layout.homeGallery === 'mosaic') {
    const big = tile(560, { mobileHeight: 280, box: { width: 49, tablet: 100 }, anim: 0 });
    const small = [0, 1, 2, 3].map((i) => tile(271, { mobileHeight: 160, box: { width: 48, tablet: 48, mobile: 48 }, anim: (i + 1) * 100 }));
    const grid = b.box([big, b.box(small, { width: 49, tablet: 100, row: true, gap: 18, align: 'stretch', justify: 'space-between' })], { row: true, gap: 18, align: 'stretch', justify: 'space-between' });
    return b.section([head(), grid, more()], { bg, align: 'center', gap: 40 });
  }
  // "masonry": three columns of two photos of staggered heights (two columns on phones)
  if (layout.homeGallery === 'masonry') {
    const cols = [[340, 240], [240, 340], [340, 240]].map((heights, c) =>
      b.box(heights.map((h, r) => tile(h, { mobileHeight: r === c % 2 ? 240 : 170, anim: (c * 2 + r) * 90 })), { width: 32, tablet: 32, mobile: 48, gap: 18 })
    );
    cols[2].settings.hide_mobile = 'hidden-mobile';
    return b.section([head(), b.box(cols, { row: true, gap: 18, align: 'flex-start', justify: 'space-between' }), more()], { bg, align: 'center', gap: 40 });
  }
  // "strip": four photos edge to edge across the whole width of the screen, square corners
  if (layout.homeGallery === 'strip') {
    const photos = [0, 1, 2, 3].map((i) => tile(400, { mobileHeight: 200, round: false, box: { width: 24.6, tablet: 49.5, mobile: 49.5 }, anim: i * 100 }));
    return b.section([head(), b.box(photos, { row: true, gap: 6, justify: 'space-between' }), more()], { bg, align: 'center', gap: 40, width: 2560 });
  }
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
  return b.section([head(), b.box([carousel], { anim: 0 }), more()], { bg, align: 'center', gap: 40 });
}

/** AI hints of key figure i (shared: the same figure on the Home and About pages and in the photo badge). */
const statHints = (i) => ({
  value: { hint: `key figure ${i + 1} of 4 of the business (e.g. "20+" years, "24h" response time): short, realistic for this business — the client will check it`, max: 12, share: `stat${i + 1}.value` },
  label: { hint: `label of key figure ${i + 1} (2–4 words)`, max: 40, share: `stat${i + 1}.label` },
});

/**
 * Key numbers, per the stats layout: 4 figures on a colored band ("band"), large figures in a row
 * each under a thin line, on the page color ("inline"), or in cards on a tinted section ("cards").
 */
function stats(b) {
  const variant = b.spec.layout.stats;
  const row = (items) => b.box(items, { row: true, gap: 24, align: 'flex-start', justify: 'space-between' });
  if (variant === 'inline') {
    const items = b.spec.copy.stats.map((x, i) =>
      b.box(
        [
          b.heading(x.value, { tag: 'p', size: 58, weight: b.st.headingWeight, ...statHints(i).value }),
          b.text(x.label, { size: 15, ...statHints(i).label }),
        ],
        { width: b.columns(4), tablet: 48, gap: 4, padding: [22, 0, 0, 0], border: [1, 0, 0, 0, b.ink.border], anim: i * 100 }
      )
    );
    return b.section([row(items)], { bg: surfaceBg(b, 'stats', 'bg'), padY: Math.round(b.pad * 0.75) });
  }
  if (variant === 'cards') {
    const items = b.spec.copy.stats.map((x, i) =>
      b.box(
        [
          b.heading(x.value, { tag: 'p', size: 46, align: 'center', color: b.ink.kicker, ...statHints(i).value }),
          b.text(x.label, { align: 'center', size: 15, ...statHints(i).label }),
        ],
        { width: b.columns(4), tablet: 48, card: true, on: surfaceOn(b, 'stats', 'alt'), pad: 30, gap: 4, anim: i * 100, lift: true }
      )
    );
    return b.section([row(items)], { bg: surfaceBg(b, 'stats', 'alt'), padY: Math.round(b.pad * 0.75) });
  }
  const items = b.spec.copy.stats.map((x, i) =>
    b.box(
      [
        b.heading(x.value, { tag: 'p', size: 46, align: 'center', color: b.c.secondary, ...statHints(i).value }),
        b.text(x.label, { align: 'center', color: 'rgba(255,255,255,0.85)', size: 15, ...statHints(i).label }),
      ],
      { width: b.columns(4), tablet: 48, gap: 4, anim: i * 100 }
    )
  );
  return b.section([row(items)], { ...b.fill(), padY: Math.round(b.pad * 0.75), band: true });
}

/**
 * Number of a timeline step: a 56px disc in the secondary color (square with square buttons),
 * pulled by `margin` onto the line of the timeline.
 */
function stepDisc(b, i, margin) {
  const el = b.heading(String(i + 1).padStart(2, '0'), { tag: 'p', size: 18, weight: '700', align: 'center', color: b.c.onSecondary, fixed: true });
  Object.assign(el.settings, {
    typography_line_height: { unit: 'px', size: 28 },
    _background_background: 'classic',
    _background_color: b.c.secondary,
    _border_radius: corners(b.st.buttons === 'square' ? 0 : 50),
    _padding: sides(14, 0, 14, 0),
    _element_width: 'initial',
    _element_custom_width: px(56),
    _flex_align_self: 'flex-start',
    _margin: sides(...margin),
    _z_index: 1,
  });
  return el;
}

/**
 * How we work: 4 numbered steps, per the process layout: cards ("cards"), a horizontal timeline
 * with the numbers on a line above each step ("timeline"), or a vertical timeline beside the title
 * ("vertical").
 */
function processSteps(b) {
  const { copy } = b.spec;
  const variant = b.spec.layout.process;
  const stepTitle = (x, i) => b.heading(x.title, { tag: 'h3', size: 20, hint: `step ${i + 1} of 4 of the way the business works with its customers (short title)`, max: 50 });
  const stepText = (x, i) => b.text(x.text, { size: 15, hint: `explanation of step ${i + 1} (1–2 sentences)`, max: 160 });
  const parts = {
    kicker: { value: copy.processKicker, hint: 'small label of the "how we work" section', max: 30 },
    title: { value: copy.processTitle, hint: 'title of the "how we work" section', max: 60 },
    text: { value: copy.processText, hint: 'intro of the "how we work" section (1 sentence)', max: 200 },
  };
  if (variant === 'timeline') {
    // Each step under a 2px line; its disc (56px) is pulled up to sit on the line
    const steps = copy.steps.map((x, i) =>
      b.box([stepDisc(b, i, [-29, 0, 6, 0]), stepTitle(x, i), stepText(x, i)], { width: b.columns(4), gap: 8, border: [2, 0, 0, 0, b.ink.border], anim: i * 120 })
    );
    return b.section([intro(b, parts), b.box(steps, { row: true, gap: 40, align: 'stretch', justify: 'space-between' })], { bg: surfaceBg(b, 'process', 'bg'), align: 'center', gap: 64 });
  }
  if (variant === 'vertical') {
    // Steps along a 2px line on their left; the disc sits on the line, the title beside it
    const steps = copy.steps.map((x, i) =>
      b.box([stepDisc(b, i, [0, 0, -50, -69]), stepTitle(x, i), stepText(x, i)], {
        gap: 8,
        padding: [0, 0, i === copy.steps.length - 1 ? 0 : 40, 40],
        border: [0, 0, 0, 2, b.ink.border],
        anim: i * 120,
      })
    );
    return b.section([b.box([intro(b, parts, { align: 'left' })], { width: 36 }), b.box(steps, { width: 56, tablet: 100, padding: [0, 0, 0, 28] })], {
      row: true,
      bg: surfaceBg(b, 'process', 'bg'),
      align: 'flex-start',
    });
  }
  const steps = copy.steps.map((x, i) =>
    b.box(
      [
        b.heading(String(i + 1).padStart(2, '0'), { tag: 'p', size: 44, color: b.c.secondary, fixed: true }),
        b.heading(x.title, { tag: 'h3', size: 20, hint: `step ${i + 1} of 4 of the way the business works with its customers (short title)`, max: 50 }),
        b.text(x.text, { size: 15, hint: `explanation of step ${i + 1} (1–2 sentences)`, max: 160 }),
      ],
      { width: b.columns(4), card: true, on: surfaceOn(b, 'process', 'bg'), pad: 28, gap: 8, anim: i * 120, lift: true }
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
    { bg: surfaceBg(b, 'process', 'bg'), align: 'center', gap: 44 }
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
  const bg = surfaceBg(b, 'faq', 'alt');
  if (left) return b.section([b.box([intro(b, parts, { align: 'left' })], { width: 34 }), b.box([accordion], { width: 60, anim: 0 })], { row: true, bg, align: 'flex-start' });
  return b.section([intro(b, parts), b.box([accordion], { maxWidth: 860, anim: 0 })], { bg, align: 'center', gap: 40 });
}

/**
 * Strip of 4 short guarantees: centered on one line ("strip"), or larger and scrolling endlessly
 * across the whole width ("marquee": the items are repeated MARQUEE_COPIES times, the copies showing
 * the texts of the first ones, and the CSS moves the list by half its width, so the loop never shows).
 */
function highlights(b) {
  const items = b.spec.copy.highlights.map((x, i) => ({ text: x, icon: 'fas fa-check-circle', hint: `short guarantee ${i + 1} of 4 of the business (2–4 words, e.g. free estimate)`, max: 40, share: `highlight${i + 1}` }));
  if (b.spec.layout.highlights === 'marquee') {
    const copies = Array.from({ length: MARQUEE_COPIES }, () => items).flat();
    const list = b.iconList(copies, { inline: true, align: 'center', color: '#FFFFFF', iconColor: b.c.secondary, hover: '#FFFFFF', size: 19, weight: '700', css: 'esg-marquee' });
    list.settings.space_between = px(56);
    return b.section([list], { ...b.fill(90), padY: 30, width: 2560, align: 'stretch' });
  }
  return b.section([b.iconList(items, { inline: true, align: 'center', color: '#FFFFFF', iconColor: b.c.secondary, hover: '#FFFFFF', size: 16, weight: '600' })], {
    ...b.fill(90),
    padY: 26,
    align: 'center',
  });
}

/** Sets of guarantees in a marquee strip: an even number (two equal halves), each half wider than a wide screen. */
const MARQUEE_COPIES = 6;

const HOME_SECTIONS = { about: aboutTeaser, features, cta, services: featuredServices, gallery: homeGallery, reviews, stats, process: processSteps, faq, highlights };

function home(b, site) {
  const layout = b.spec.layout;
  // Sections shown (no featured services without services), their backgrounds per the rhythm
  const ids = (b.spec.sections || DEFAULT_SECTIONS).filter((id) => HOME_SECTIONS[id] && (id !== 'services' || site.services.length));
  planSurfaces(b, ids.map((id) => ({ id, natural: NATURAL_SURFACE[id](layout) })), ['split', 'editorial'].includes(layout.hero) ? 'alt' : 'band');
  const out = [hero(b, site), ...ids.map((id) => HOME_SECTIONS[id](b, site))];
  // The shaped bottom edge of the hero takes the color of the next section
  const next = out[1]?.settings;
  if (next && out[0].settings.shape_divider_bottom) out[0].settings.shape_divider_bottom_color = next.background_color || b.ink.bg;
  // Target of the arrow of a full-screen hero
  if (next && hasScrollCue(layout)) next._element_id = NEXT_ID;
  sectionLines(b, out, ['hero', ...ids]);
  bandEdges(b, out);
  return out;
}

function about(b, site) {
  const { copy, layout } = b.spec;
  const sections = b.spec.sections || DEFAULT_SECTIONS;
  // The two "Chi siamo" rows ("story", "values"), then the sections shared with the Home page
  const ids = ['story', 'values', ...(sections.includes('stats') ? ['stats'] : []), 'features', ...(sections.includes('cta') ? ['cta'] : []), 'reviews'];
  const natural = { story: () => 'bg', values: () => 'alt', ...NATURAL_SURFACE };
  planSurfaces(b, ids.map((id) => ({ id, natural: natural[id](layout) })), layout.subheader === 'photo' ? 'band' : 'alt');
  // "Chi siamo" in two rows: text | image, then image | text (no "Our story" / "Our mission" titles)
  const out = [
    subheader(b, site, 'about'),
    mediaRow(
      b,
      [
        b.heading(b.L.about, { bar: b.st.titles === 'bar', fixed: true }),
        ...titleLine(b),
        b.text(copy.aboutPageText, {
          dropcap: true,
          hint: 'first part of the presentation of the business on the About page: who we are, history and experience (2 paragraphs), WITHOUT sub-titles',
          max: 1200,
          min: 300,
        }),
      ],
      { imageFirst: false, height: 500, bg: surfaceBg(b, 'story', 'bg') }
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
      { imageFirst: true, height: 500, bg: surfaceBg(b, 'values', 'alt') }
    ),
  ];
  if (sections.includes('stats')) out.push(stats(b));
  out.push(features(b));
  if (sections.includes('cta')) out.push(cta(b, site));
  out.push(reviews(b));
  sectionLines(b, out, ['subheader', ...ids]);
  bandEdges(b, out);
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

// The second phone number (optional) follows the first one
function contactItems(site) {
  const phone2 = site.phone2 && telHref(site.phone2) !== telHref(site.phone) ? site.phone2 : '';
  return [
    { text: site.phone, url: `tel:${telHref(site.phone)}`, icon: 'fas fa-phone-alt', label: 'phone' },
    { text: phone2, url: `tel:${telHref(phone2)}`, icon: 'fas fa-phone-alt', label: 'phone', key: 'phone2' },
    { text: site.email, url: `mailto:${site.email}`, icon: 'fas fa-envelope', label: 'email' },
    { text: site.address, icon: 'fas fa-map-marker-alt', label: 'address' },
  ].filter((i) => i.text);
}

/** Contact Form 7 has no design of its own: fields, consent and button in the colors and corners of the template. */
function formCss(b) {
  const { c } = b;
  const radius = b.st.buttons === 'pill' ? 50 : b.st.buttons === 'square' ? 0 : b.radius;
  const field = Math.min(radius, 12);
  return `<style>
.esg-form .wpcf7-form{display:flex;flex-direction:column;gap:16px;margin:0}
.esg-form .wpcf7-form>p{margin:0}
.esg-form .wpcf7-form label{display:block;font-size:14px;font-weight:600;color:${c.heading}}
.esg-form .wpcf7-form-control-wrap{display:block;margin-top:6px}
.esg-form input[type=text],.esg-form input[type=email],.esg-form input[type=tel],.esg-form textarea{width:100%;box-sizing:border-box;padding:14px 16px;border:1px solid #D9DEE5;border-radius:${field}px;background:#F7F8FA;color:${c.heading};font-size:15px;transition:border-color .2s,box-shadow .2s,background .2s}
.esg-form textarea{height:150px;resize:vertical}
.esg-form input:focus,.esg-form textarea:focus{outline:none;border-color:${c.primary};background:#FFFFFF;box-shadow:0 0 0 3px ${rgba(c.primary, 0.18)}}
.esg-form .wpcf7-acceptance label{display:flex;gap:10px;align-items:flex-start;font-weight:400;color:${c.text}}
.esg-form .wpcf7-list-item{margin:0}
.esg-form input[type=submit]{width:100%;padding:16px 32px;border:0;border-radius:${radius}px;background:${c.primary};color:${c.onPrimary};font-size:16px;font-weight:600;cursor:pointer;transition:background .2s}
.esg-form input[type=submit]:hover{background:${c.dark};color:#FFFFFF}
.esg-form input[type=submit]:disabled{opacity:.6;cursor:not-allowed}
.esg-form .wpcf7-not-valid-tip{margin-top:4px;font-size:13px}
.esg-form .wpcf7-response-output{margin:4px 0 0!important;padding:12px 16px!important;border-radius:${field}px}
.esg-form .wpcf7-spinner{display:block;margin:10px auto 0}
.esg-contact-info{min-width:0;overflow-wrap:break-word;word-break:break-word}
.esg-contact-info .e-con,.esg-contact-info .elementor-widget{max-width:100%!important;min-width:0}
@media (min-width:1025px){.e-con.esg-contact-info{max-width:calc(50% - 14px)!important}}
</style>`;
}

function contact(b, site) {
  const { copy, layout } = b.spec;
  const stacked = layout.contact === 'stacked';
  const items = contactItems(site);
  const parts = {
    title: { value: copy.contactTitle, hint: 'title of the contact details section', max: 60 },
    text: { value: copy.contactText, hint: 'invitation to contact the business (1–2 short sentences)', max: 220 },
  };
  const infoBox = (it, o) => b.iconBox(it.icon, b.L[it.label], it.text, { fixed: true, url: it.url, titleSize: 17, ...o });
  // The form card is always light: the Contact Form 7 fields are styled for light backgrounds
  const form = b.box([b.heading(copy.formTitle, { size: 26, color: b.c.heading, hint: 'title above the contact form', max: 60 }), b.line(), b.shortcode(site.contactShortcode), b.html(formCss(b))], {
    card: true,
    bg: '#FFFFFF',
    pad: 40,
    gap: 16,
    css: 'esg-form',
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
            items.map((it, i) => b.box([infoBox(it)], { width: b.columns(items.length), card: true, on: 'alt', pad: 28, anim: i * 120, lift: true })),
            { row: true, gap: 24, align: 'stretch', justify: 'center' }
          ),
          form,
        ],
        { bg: b.ink.alt, align: 'center', gap: 40 }
      )
    );
  } else {
    out.push(
      // The details never take more than half of the row: long texts wrap instead of running over the form
      b.section([b.box([intro(b, parts, { align: 'left' }), ...items.map((it) => infoBox(it, { position: 'left' }))], { width: 42, gap: 22, css: 'esg-contact-info' }), form], {
        row: true,
        bg: b.ink.alt,
        align: 'flex-start',
      })
    );
  }
  // The map: the listing of the Google Business Profile of the site, else its address (lib/maps.js)
  const map = site.map || siteMap({ address: site.address });
  if (site.mapEmbed && map.src) out.push(b.section([b.html(mapIframe(map.src))], { full: true, gap: 0 }));
  return out;
}

function singlePost(b, site) {
  const { copy } = b.spec;
  const center = b.st.align === 'center' && b.st.titles !== 'bar';
  const align = center ? 'center' : 'left';
  const hero = b.section(
    [
      b.kicker(b.L.services, { align, color: b.c.secondary, onDark: true, fixed: true }),
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
      css: underHeader(b),
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
        { card: true, ...b.fill(), pad: 40, gap: 14 }
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
        // Dynamic featured image (background, or an image of a Template Kit single post) -> the article image
        for (const key of Object.keys(st.__dynamic__ || {}).filter((k) => /image/.test(k))) {
          delete st.__dynamic__[key];
          if (post.imageUrl) st[key] = { url: post.imageUrl, id: '', alt: post.title, source: 'library' };
          else delete st[key];
        }
        if (st.__dynamic__ && !Object.keys(st.__dynamic__).length) delete st.__dynamic__;
        if (el.widgetType === 'theme-post-featured-image') {
          el.widgetType = 'image';
          st.image = post.imageUrl ? { url: post.imageUrl, id: '', alt: post.title, source: 'library' } : { url: '', id: '' };
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

const MENU_ROLES = ['home', 'about', 'services', 'gallery', 'contact'];
const menuItems = (site) => MENU_ROLES.map((r) => ({ text: site.pages[r].title, url: site.pages[r].url }));

/**
 * The site menu of WordPress (Appearance → Menus) in the "Navigation Menu" widget of Ultimate Addons
 * for Elementor (free), so its pages are managed in WordPress, not written in the header. The widget
 * finds the menu by its slug; it has its own hamburger and dropdown panel below 1025px
 * (dropdown 'none': never, for the left side of the "split" header, shown on desktop only).
 * o: { align, color, hover, dropdown }
 */
function uaeMenu(b, site, o) {
  const { st, c, ink, fonts } = b;
  const upper = st.titleCase === 'upper';
  const panel = ink.dark ? ink.card : '#FFFFFF';
  const panelHover = ink.dark ? rgba(c.secondary, 0.14) : tint(c.primary, 0.92);
  return b.widget('navigation-menu', {
    menu: site.menuSlug || '',
    layout: 'horizontal',
    navmenu_align: o.align,
    dropdown: o.dropdown || 'tablet',
    resp_align: 'right',
    full_width_dropdown: 'yes',
    submenu_icon: 'arrow',
    pointer: 'underline',
    animation_line: 'fade',
    padding_horizontal_menu_item: px(0),
    padding_horizontal_menu_item_tablet: px(20),
    padding_vertical_menu_item: px(8),
    padding_vertical_menu_item_tablet: px(14),
    menu_space_between: px(upper ? 26 : 30),
    ...b.typo('menu_', fonts.body, upper ? 13 : 15, '600', upper ? { menu_typography_text_transform: 'uppercase', menu_typography_letter_spacing: px(1) } : {}),
    color_menu_item: o.color,
    color_menu_item_hover: o.hover,
    pointer_color_menu_item_hover: o.hover,
    color_menu_item_active: o.hover,
    pointer_color_menu_item_active: o.hover,
    color_dropdown_item: ink.heading,
    background_color_dropdown_item: panel,
    color_dropdown_item_hover: ink.heading,
    background_color_dropdown_item_hover: panelHover,
    color_dropdown_item_active: ink.heading,
    background_color_dropdown_item_active: panelHover,
    ...b.typo('dropdown_', fonts.body, 15, '600'),
    dropdown_box_shadow_box_shadow_type: 'yes',
    dropdown_box_shadow_box_shadow: boxShadow(18, 44, 0.2),
    distance_from_menu: px(16),
    toggle_color: o.color,
    toggle_hover_color: o.hover,
    toggle_size: px(22),
  });
}

/** Logo image, or the site name when the project has no logo. */
function brand(b, site, o = {}) {
  if (site.hasLogo) return b.picture('logo', { width: o.width || 180, mobileWidth: o.mobileWidth, align: o.align || 'left', size: 'medium', round: false });
  return b.heading(site.siteName, { tag: 'p', size: 24, align: o.align || 'left', color: o.color || b.ink.kicker, fixed: true });
}

const escapeAttr = (s) => escapeHtml(s).replace(/"/g, '&quot;');

/**
 * Finishing touches of the whole site, in the site CSS (Additional CSS of WordPress, on every page): smooth
 * text, selection color, cards rising on hover, photos zooming in their card, buttons, the thin
 * line of the "dash" labels, the service rows and the photo badge. Only classes set by this builder.
 */
function finishCss(b) {
  const { c, ink } = b;
  const ease = 'cubic-bezier(.2,.7,.3,1)';
  /**
   * Hover of the cards and buttons, per the hover style of the template: cards rising ("lift"), a
   * ring of the secondary color ("glow"), a bar of the secondary color along the bottom
   * ("underline"), or still cards ("still"). The rules replace the hover shadow set in Elementor.
   */
  const hover = {
    glow: `.elementor-button:hover{box-shadow:0 8px 24px ${rgba(c.secondary, 0.35)}}
.esg-card{transition:box-shadow .4s ${ease}}
.esg-card:hover{box-shadow:0 0 0 2px ${c.secondary},0 18px 44px ${rgba(c.secondary, 0.2)}!important}`,
    underline: `.esg-card{transition:box-shadow .3s ${ease}}
.esg-card:hover{box-shadow:inset 0 -4px 0 ${c.secondary}!important}`,
    still: `.esg-card{transition:box-shadow .4s ${ease}}`,
  }[b.st.hover] || `.elementor-button:hover{transform:translateY(-2px)}
.esg-card{transition:transform .4s ${ease},box-shadow .4s ${ease}}
.esg-card:hover{transform:translateY(-6px)}`;
  return `html{scroll-behavior:smooth}
body{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility}
::selection{background:${c.primary};color:${c.onPrimary}}
.elementor-button{transition:background-color .3s,color .3s,border-color .3s,transform .3s ${ease},box-shadow .3s}
${hover}
.esg-zoom{overflow:hidden}
.esg-zoom img{transition:transform .9s ${ease}}
.esg-zoom:hover img{transform:scale(1.06)}
.esg-kicker-dash .elementor-heading-title{display:inline-flex;align-items:center;gap:14px}
.esg-kicker-dash .elementor-heading-title::before,.esg-kicker-c .elementor-heading-title::after{content:"";flex:0 0 36px;height:1px;background:currentColor;opacity:.75}
.esg-svc-row{padding-bottom:40px;border-bottom:1px solid ${ink.border}}
.esg-svc-row:last-child{border-bottom:0;padding-bottom:0}
.esg-quote-more{padding-top:36px;border-top:1px solid ${ink.border}}
.esg-badge{box-shadow:0 24px 50px rgba(15,27,45,.25)}
.e-con .e-con{max-width:100%}
.elementor-heading-title,.elementor-widget-text-editor,.elementor-icon-box-content,.elementor-image-box-content,.elementor-testimonial-content,.elementor-icon-list-text,.elementor-button-text{overflow-wrap:break-word;min-width:0}
@media (max-width:767px){.elementor-heading-title{-webkit-hyphens:auto;hyphens:auto}}
.elementor-widget-image-carousel .swiper-slide{overflow:hidden;border-radius:${b.imgRadius}px}
.elementor-widget-image-carousel .swiper-slide img{transition:transform .9s ${ease}}
.elementor-widget-image-carousel .swiper-slide:hover img{transform:scale(1.04)}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}.esg-card,.esg-zoom img,.elementor-button{transition:none}.esg-card:hover,.esg-zoom:hover img,.elementor-button:hover{transform:none}}${signatureCss(b)}`;
}

/** Highlighted last word of the titles, per the highlight style (accent color on the page, secondary color on photos and bands). */
function highlightCss(b) {
  const { c, ink } = b;
  const marker = rgba(c.secondary, 0.42);
  return {
    italic: `.esg-hl .esg-hl-w{font-style:italic;font-weight:400;color:${ink.kicker}}
.esg-hl-light .esg-hl-w{color:${c.secondary}}`,
    color: `.esg-hl .esg-hl-w{color:${ink.kicker}}
.esg-hl-light .esg-hl-w{color:${c.secondary}}`,
    marker: `.esg-hl .esg-hl-w{background:linear-gradient(transparent 58%,${marker} 58%,${marker} 92%,transparent 92%);padding:0 .06em;-webkit-box-decoration-break:clone;box-decoration-break:clone}`,
    outline: `.esg-hl .esg-hl-w{color:transparent;-webkit-text-stroke:.035em ${ink.heading}}
.esg-hl-light .esg-hl-w{-webkit-text-stroke-color:#FFFFFF}`,
  }[b.st.highlight] || '';
}

/**
 * Signature details of the template (highlight, decor, marquee strip), added after the finishing
 * touches only when the template uses them.
 */
function signatureCss(b) {
  const { c, ink, fonts } = b;
  const decor = {
    grid: `.esg-grid{background-image:linear-gradient(${ink.dark ? 'rgba(255,255,255,.05)' : rgba(c.heading, 0.06)} 1px,transparent 1px),linear-gradient(90deg,${ink.dark ? 'rgba(255,255,255,.05)' : rgba(c.heading, 0.06)} 1px,transparent 1px);background-size:32px 32px}
.esg-brackets{position:relative}
.esg-brackets::before,.esg-brackets::after{content:"";position:absolute;z-index:2;width:46px;height:46px;border:3px solid ${c.secondary};pointer-events:none}
.esg-brackets::before{top:-10px;left:-10px;border-right:0;border-bottom:0}
.esg-brackets::after{right:-10px;bottom:-10px;border-left:0;border-top:0}`,
    frame: `.esg-frame img{outline:1px solid rgba(255,255,255,.72);outline-offset:-16px}`,
    blob: `.esg-blob{position:relative;z-index:0}
.esg-blob::before{content:"";position:absolute;z-index:-1;top:-7%;right:-5%;width:72%;height:80%;background:${ink.dark ? rgba(c.secondary, 0.18) : tint(c.secondary, 0.7)};border-radius:62% 38% 54% 46%/49% 58% 42% 51%}
@media (max-width:767px){.esg-blob::before{top:-4%;right:0}}`,
    dropcap: `.esg-dropcap p:first-of-type::first-letter{float:left;margin:.06em .12em 0 0;font-family:"${fonts.heading}",serif;font-size:4.2em;line-height:.82;color:${ink.kicker}}`,
    wordmark: `.esg-wordmark .elementor-heading-title{font-size:clamp(56px,14vw,240px)!important;line-height:.82!important;letter-spacing:-.04em!important;white-space:nowrap;text-transform:none!important}`,
    dots: `.esg-texture{background-image:radial-gradient(${ink.dark ? 'rgba(255,255,255,.08)' : rgba(c.heading, 0.1)} 1.2px,transparent 1.7px);background-size:22px 22px}`,
    lines: `.esg-texture{background-image:repeating-linear-gradient(135deg,${ink.dark ? 'rgba(255,255,255,.05)' : rgba(c.heading, 0.06)} 0 1px,transparent 1px 16px)}`,
  }[b.st.decor];
  const marquee = b.spec.layout.highlights === 'marquee' && (b.spec.sections || []).includes('highlights')
    ? `.esg-marquee{overflow:hidden}
.esg-marquee .elementor-icon-list-items{flex-wrap:nowrap!important;width:max-content;animation:esg-marquee ${MARQUEE_COPIES * 9}s linear infinite}
.esg-marquee .elementor-icon-list-item{flex-shrink:0}
.esg-marquee:hover .elementor-icon-list-items{animation-play-state:paused}
.esg-marquee .elementor-icon-list-text{text-transform:uppercase;letter-spacing:.06em}
@keyframes esg-marquee{to{transform:translateX(-50%)}}
@media (prefers-reduced-motion:reduce){.esg-marquee .elementor-icon-list-items{animation:none;flex-wrap:wrap!important;width:auto;justify-content:center}.esg-marquee .elementor-icon-list-item:nth-child(n+${b.spec.copy.highlights.length + 1}){display:none}}`
    : '';
  // "transparent" header: on the pages that open with a photo (marked "esg-under"), the header lies over it,
  // with white links, hamburger and logo (pure CSS, so nothing moves once the page is shown); the menu panel keeps its colors
  const over = b.spec.layout.header === 'transparent'
    ? `body:has(.esg-under) .esg-header{position:absolute!important;top:0;left:0;right:0;width:100%;background:transparent!important;box-shadow:none!important;border:0!important}
body:has(.esg-under) .esg-header nav:not(.hfe-dropdown) .hfe-nav-menu>li>a.hfe-menu-item{color:#FFFFFF!important}
body:has(.esg-under) .esg-header nav:not(.hfe-dropdown) .hfe-nav-menu>li>a.hfe-menu-item:hover{color:${c.secondary}!important}
body:has(.esg-under) .esg-header .hfe-nav-menu-icon{color:#FFFFFF!important}
body:has(.esg-under) .esg-header .hfe-nav-menu-icon svg{fill:#FFFFFF!important}
body:has(.esg-under) .esg-hd-brand .elementor-heading-title{color:#FFFFFF!important}
body:has(.esg-under) .esg-hd-brand img{filter:brightness(0) invert(1)}`
    : '';
  // Arrow of a full-screen hero: centered at the bottom, above the shaped edge, gently bobbing
  const layout = b.spec.layout;
  const edge = heroEdge(layout);
  const scroll = hasScrollCue(layout)
    ? `.elementor-widget.esg-scroll{position:absolute!important;left:50%;bottom:${edge + 24}px;transform:translateX(-50%);width:auto!important;margin:0!important;z-index:3}
.esg-scroll .elementor-icon{animation:esg-bob 2.4s ease-in-out infinite}
@keyframes esg-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(8px)}}
@media (max-width:767px){.elementor-widget.esg-scroll{bottom:${edge ? 40 : 20}px}}
@media (prefers-reduced-motion:reduce){.esg-scroll .elementor-icon{animation:none}}`
    : '';
  // Rotating phrases of the hero: stacked in one grid cell, each shown for 3s (rising in, rising out)
  const rotate = layout.heroPhrases === 'rotating'
    ? `.e-con.esg-rotate{display:grid!important}
.esg-rotate>.elementor-widget{grid-area:1/1;width:100%;opacity:0;animation:esg-rotate 9s infinite}
.esg-rotate>.elementor-widget:nth-child(2){animation-delay:3s}
.esg-rotate>.elementor-widget:nth-child(3){animation-delay:6s}
@keyframes esg-rotate{0%{opacity:0;transform:translateY(14px)}4%,30%{opacity:1;transform:none}34%,100%{opacity:0;transform:translateY(-14px)}}
@media (prefers-reduced-motion:reduce){.esg-rotate>.elementor-widget{animation:none}.esg-rotate>.elementor-widget:first-child{opacity:1}}`
    : '';
  return [highlightCss(b), decor, marquee, over, scroll, rotate, photoToneCss(b), signatureDetailCss(b)].filter(Boolean).map((css) => `\n${css}`).join('');
}

/**
 * The signature detail of the template, on every page: section numbers (a CSS counter of the page,
 * outlined in the accent color), tilted main photos (alternating from one section to the next,
 * straight under the mouse), vertical labels beside the left-aligned titles (desktop), or the round
 * stamp of the hero (turning slowly; still with reduced motion; hidden below 1200px, where it would cover the text).
 */
function signatureDetailCss(b) {
  const { c, fonts } = b;
  return {
    numbers: `body{counter-reset:esg-sec}
.esg-num{counter-increment:esg-sec;line-height:1}
.esg-num::before{content:counter(esg-sec,decimal-leading-zero);font-family:"${fonts.heading}",serif;font-size:64px;font-weight:700;line-height:.9;letter-spacing:-.02em;color:transparent;-webkit-text-stroke:1.5px ${c.secondary}}
@media (max-width:767px){.esg-num::before{font-size:44px}}`,
    tilted: `.esg-tilt img{transform:rotate(-2.2deg);transition:transform .6s cubic-bezier(.2,.7,.3,1)}
.elementor > .e-con:nth-child(even) .esg-tilt img{transform:rotate(2.2deg)}
.esg-tilt:hover img,.elementor > .e-con .esg-tilt:hover img{transform:none}
@media (max-width:767px){.esg-tilt img,.elementor > .e-con:nth-child(even) .esg-tilt img{transform:rotate(-1.2deg)}}
@media (prefers-reduced-motion:reduce){.esg-tilt img{transition:none}}`,
    vertical: `@media (min-width:1025px){
.e-con:has(> .esg-vlabel){position:relative;padding-left:56px!important}
.elementor-widget.esg-vlabel{position:absolute!important;left:0;top:4px;width:auto!important;max-width:none!important;max-height:calc(100% - 4px);overflow:hidden;white-space:nowrap;margin:0!important;writing-mode:vertical-rl;transform:rotate(180deg)}
}`,
    stamp: `.elementor-widget.esg-stamp-w{position:absolute!important;right:7%;bottom:16%;width:132px!important;max-width:none!important;margin:0!important;z-index:2;pointer-events:none}
.esg-stamp svg{display:block;animation:esg-spin 26s linear infinite}
@keyframes esg-spin{to{transform:rotate(360deg)}}
@media (max-width:1199px){.elementor-widget.esg-stamp-w{display:none}}
@media (prefers-reduced-motion:reduce){.esg-stamp svg{animation:none}}`,
  }[b.st.signature] || '';
}

/** Photos of the pages (image widgets, Home carousel, Gallery page), filtered per the photo treatment. */
const TONED = ['.esg-photo img', '.elementor-widget-image-carousel .swiper-slide img', '.elementor-widget-image-gallery .gallery-item img'];
const PHOTO_FILTERS = { mono: () => 'grayscale(1) contrast(1.06)', duotone: duotoneFilter, faded: () => 'saturate(.68) contrast(.9) brightness(1.05)' };

/**
 * "Duotone" photos with a CSS filter only (no SVG on the page): black and white, then tinted with
 * the hue of the primary color (sepia turned to that hue); plain black and white for a grey primary.
 */
function duotoneFilter(b) {
  const { hue, sat } = hueSat(b.c.primary);
  if (sat < 0.15) return 'grayscale(1) contrast(1.06)';
  return `grayscale(1) sepia(1) hue-rotate(${Math.round((hue - 38 + 360) % 360)}deg) saturate(1.6) brightness(.94) contrast(1.06)`;
}

/**
 * Photo treatment of the template: black and white, duotone (tinted with the primary color) or
 * faded. Black and white and duotone photos show their real colors under the mouse. The photos
 * behind texts (hero, bands) keep their colors under the overlays of the template.
 */
function photoToneCss(b) {
  const filter = PHOTO_FILTERS[b.st.photoTone]?.(b);
  if (!filter) return '';
  const hover = ['.esg-zoom:hover .esg-photo img', '.esg-photo:hover img', '.elementor-widget-image-carousel .swiper-slide:hover img', '.elementor-widget-image-gallery .gallery-item:hover img'];
  const reveal = b.st.photoTone === 'faded' ? '' : `\n${hover.join(',')}{filter:none}`;
  return `${TONED.join(',')}{filter:${filter};transition:filter .6s ease}${reveal}`;
}

/**
 * Style of the header, part of the site CSS: logo and button take their width, the menu the rest, on one
 * line; below 1025px the menu (its hamburger) moves to the end, on phones the header button is hidden
 * (the contact page is in the menu). "split" header (skip: the number of pages on the left of the logo):
 * the same WordPress menu on both sides, the left one shows the first pages, the right one the others.
 * The last rules style the "WordPress Menu" widget the WordPress plugin puts in place of the UAE menu
 * when UAE could not be installed.
 */
function headerCss(b) {
  const layout = b.spec.layout;
  const skip = layout.header === 'split' ? splitCut() : 0;
  const color = layout.header === 'bold' ? b.c.onPrimary : b.ink.heading;
  return `.esg-header{position:relative;z-index:100}
.esg-header .esg-hd-brand,.esg-header .esg-hd-cta{flex:0 0 auto!important;width:auto!important;max-width:none}
.esg-header .esg-hd-nav{flex:1 1 auto!important;width:auto!important;min-width:0}
.esg-nav .hfe-nav-menu__layout-horizontal .hfe-nav-menu{flex-wrap:nowrap}
.esg-nav a.hfe-menu-item{white-space:nowrap}
@media (max-width:1024px){
.esg-header .esg-hd-nav{flex:0 0 auto!important;order:3}
.esg-header .esg-hd-cta{margin-left:auto}
.esg-nav a.hfe-menu-item{white-space:normal}
}
@media (max-width:767px){
.esg-header .esg-hd-cta{display:none!important}
.esg-header .esg-hd-nav{margin-left:auto}
}${
    skip
      ? `
.esg-header .esg-hd-side{flex:1 1 0!important;width:auto!important;min-width:0;flex-wrap:nowrap!important}
@media (min-width:1025px){.esg-nav-left .hfe-nav-menu>li:nth-child(n+${skip + 1}),.esg-nav-skip .hfe-nav-menu>li:nth-child(-n+${skip}){display:none}}`
      : ''
  }
.esg-nav .menu{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px 24px;font-family:"${b.fonts.body}",sans-serif}
.esg-nav .menu a{color:${color};font-weight:600;text-decoration:none}`;
}

/** Pages on the left of the logo in the "split" header. */
const splitCut = () => Math.ceil(MENU_ROLES.length / 2);

/**
 * Menu of the header: the site menu of WordPress (Appearance → Menus) in the free "Navigation Menu"
 * widget of Ultimate Addons for Elementor, with its own hamburger below 1025px, styled in its settings.
 * o: { align ('left' | 'center' | 'right'), color, hover, box (width options of its container),
 *      skip: on desktop, the first pages are left out (shown on the left of the logo: "split" header) }
 */
function navMenu(b, site, o) {
  return b.box([uaeMenu(b, site, { align: o.align, color: o.color, hover: o.hover })], { ...o.box, css: `esg-hd-nav esg-nav${o.skip ? ' esg-nav-skip' : ''}` });
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
      b.section([b.iconList(contactItems(site).filter((i) => i.key !== 'phone2').slice(0, 2), { inline: true, color: '#FFFFFF', iconColor: b.c.secondary, hover: b.c.secondary, size: 14 })], {
        row: true,
        bg: b.ink.dark ? '#000000' : b.c.dark,
        padY: 9,
        justify: 'flex-end',
      })
    );
  }
  // Logo, menu and button on one line (never wrapping); "centered": the menu in the middle, otherwise next to the button
  const button = { text: copy.headerButton, url: site.pages.contact.url };
  // "split": the logo in the middle of two equal sides, the first pages on the left, the others and the button on the
  // right; below 1025px the left side is hidden and the logo, the button and the whole menu are as in the other headers
  if (layout.header === 'split') {
    // The same WordPress menu on both sides: the left one shows its first items, the right one the others (headerCss)
    const left = b.box([uaeMenu(b, site, { align: 'right', color: menuColor, hover, dropdown: 'none' })], { css: 'esg-nav esg-nav-left' });
    out.push(
      b.section(
        [
          b.box([left], { css: 'esg-hd-side', desktopOnly: true }),
          b.box([brand(b, site, { align: 'center', mobileWidth: 140 })], { css: 'esg-hd-brand' }),
          b.box(
            [
              navMenu(b, site, { align: 'left', color: menuColor, hover, skip: splitCut() }),
              b.box([b.button(button.text, button.url, { variant: 'main', align: 'right', hint: 'header button leading to the contact page', max: 25 })], { align: 'flex-end', css: 'esg-hd-cta' }),
            ],
            { row: true, gap: 20, css: 'esg-hd-side' }
          ),
        ],
        { row: true, wrap: false, bg, padY: 16, gap: 36, ...frame, css: 'esg-header' }
      )
    );
    return out;
  }
  out.push(
    b.section(
      [
        b.box([brand(b, site, { color: bold ? b.c.onPrimary : undefined, mobileWidth: 140 })], { width: 20, tablet: 30, mobile: 60, css: 'esg-hd-brand' }),
        navMenu(b, site, { align: layout.header === 'centered' ? 'center' : 'right', color: menuColor, hover, box: { width: 56, tablet: 15, mobile: 30 } }),
        b.box([b.button(button.text, button.url, { variant: bold ? 'secondary' : 'main', align: 'right', hint: 'header button leading to the contact page', max: 25 })], { width: 20, tablet: 40, align: 'flex-end', css: 'esg-hd-cta' }),
      ],
      { row: true, wrap: false, bg, padY: 16, gap: 20, ...frame, css: 'esg-header' }
    )
  );
  return out;
}

/**
 * Legal links after the copyright. The Cookie Policy and Privacy Policy pages are created by the
 * site owner afterwards with these slugs, so the links work as soon as the pages exist. They stay
 * relative ("/cookie-policy", never "https://domain/cookie-policy/"): the WordPress plugin leaves them as they are.
 */
export const LEGAL_PAGES = [
  { text: 'Cookie Policy', url: '/cookie-policy' },
  { text: 'Privacy Policy', url: '/informativa-sul-trattamento-dei-dati-personali' },
];
const LEGAL_LINKS = LEGAL_PAGES.map((p) => ` | <a href="${p.url}" style="color:inherit">${p.text}</a>`).join('');

/**
 * Social icons of the site (free Elementor widget): only the networks the project has, round /
 * rounded / square like the buttons of the template. o: { bg (icon background), color, align }
 */
function socialIcons(b, socials, o = {}) {
  const el = b.widget('social-icons', {
    social_icon_list: socials.map((s) => ({
      _id: b.id(),
      social_icon: { value: s.icon, library: 'fa-brands' },
      link: { url: s.url, is_external: 'on', nofollow: '', custom_attributes: '' },
    })),
    shape: b.st.buttons === 'square' ? 'square' : b.st.buttons === 'pill' ? 'circle' : 'rounded',
    align: o.align || 'left',
    icon_color: 'custom',
    icon_primary_color: o.bg,
    icon_secondary_color: o.color,
    hover_primary_color: b.c.secondary,
    hover_secondary_color: b.c.onSecondary,
    icon_size: px(15),
    icon_padding: px(0.7, 'em'),
    icon_spacing: px(10),
  });
  socials.forEach((_, i) => b.mark(el, `social_icon_list.${i}.link.url`, { fixed: true }));
  return el;
}

function footer(b, site) {
  const variant = b.spec.layout.footer;
  const light = variant === 'light';
  const deep = b.ink.dark ? mix(b.c.dark, '#000000', 0.4) : b.c.dark;
  const style = light ? { bg: b.ink.alt } : variant === 'brand' ? b.fill() : { bg: deep };
  const color = light ? b.ink.text : 'rgba(255,255,255,0.78)';
  const titleColor = light ? b.ink.heading : '#FFFFFF';
  const hover = light ? b.ink.kicker : b.c.secondary;
  const colTitle = (t) => [b.heading(t, { tag: 'h4', size: 18, color: titleColor, fixed: true }), b.line('left')];
  const list = (items) => b.iconList(items, { color, hover, iconColor: b.c.secondary });
  // Social networks of the site (optional) below the logo
  const social = site.socials?.length ? [socialIcons(b, site.socials, { bg: light ? rgba(b.c.primary, 0.1) : 'rgba(255,255,255,0.1)', color: light ? b.c.primaryText : '#FFFFFF' })] : [];
  const cols = [
    b.box([brand(b, site, { color: titleColor }), ...social], { width: 22, gap: 20 }),
    b.box([...colTitle(b.L.links), list(menuItems(site))], { width: 22, gap: 12 }),
  ];
  if (site.services.length) cols.push(b.box([...colTitle(b.L.services), list(site.services.map((s) => ({ text: s.name, url: s.url })))], { width: 22, gap: 12 }));
  cols.push(b.box([...colTitle(b.L.contacts), list(contactItems(site))], { width: 22, gap: 12 }));
  // "wordmark" decor: the business name huge and faint across the bottom of the footer, cropped at the edges
  const wordmark = [];
  if (b.st.decor === 'wordmark') {
    const name = b.heading(site.siteName, { tag: 'p', size: 40, color: light ? rgba(b.c.heading, 0.08) : 'rgba(255,255,255,0.08)', fixed: true });
    name.settings._css_classes = 'esg-wordmark';
    const el = b.section([name], { ...style, padY: 0, padBottom: 12, gap: 0, width: 2560 });
    el.settings.overflow = 'hidden';
    wordmark.push(el);
  }
  // "large": the footer opens with a large invitation to get in touch, the phone number and a button, above a thin line
  const invite = [];
  if (b.spec.layout.footerCta === 'large') {
    const { copy } = b.spec;
    const contact = [];
    if (site.phone) contact.push(b.heading(site.phone, { tag: 'p', size: 26, color: titleColor, url: `tel:${telHref(site.phone)}`, fixed: true }));
    contact.push(b.button(copy.footerButton, site.pages.contact.url, { variant: 'secondary', hint: 'button of the invitation at the top of the footer (leads to the contact page)', max: 30 }));
    invite.push(
      b.section(
        [
          b.box([b.heading(copy.footerTitle, { size: 50, color: titleColor, hl: true, hint: 'large invitation to get in touch at the top of the footer, shown on every page (one short sentence, at most 7 words)', max: 60 })], { width: 62 }),
          b.box(contact, { width: 32, gap: 16, align: 'flex-start' }),
        ],
        { row: true, ...style, padY: Math.round(b.pad * 0.8), borderBottom: light ? b.ink.border : 'rgba(255,255,255,0.12)' }
      )
    );
  }
  return [
    ...invite,
    b.section(cols, { row: true, ...style, align: 'flex-start', padY: Math.round(b.pad * 0.8) }),
    ...wordmark,
    b.section([b.text(`<p>${escapeHtml(site.copyright)}${LEGAL_LINKS}</p>`, { align: 'center', size: 14, color, fixed: true })], {
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
 * @param {object} site  { lang, siteName, phone, phone2, email, address, map, copyright, hasLogo, mapEmbed, contactShortcode,
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
  return { docs, globalStyles: globalStyles(spec), siteCss: siteCss(spec, site) };
}

/**
 * CSS of the whole site (Appearance → Customize → Additional CSS, written by the WordPress plugin):
 * the header layout, then the finishing touches and signature details of the template.
 */
export function siteCss(spec, site) {
  const b = createDoc('site', spec, site);
  b.spec = spec;
  return `${headerCss(b)}\n${finishCss(b)}\n`;
}

/**
 * Highlight style of the titles ("esg-hl"): their last word (the last two when it is a short one)
 * wrapped in <span class="esg-hl-w">, once the texts are written. Titles of fewer than 3 words or
 * already holding HTML stay as they are.
 */
export function highlightTitles(doc) {
  const visit = (el) => {
    if (!el || typeof el !== 'object') return;
    if (Array.isArray(el)) return el.forEach(visit);
    const s = el.settings;
    if (el.widgetType === 'heading' && s && /(^|\s)esg-hl(\s|$)/.test(s._css_classes || '') && typeof s.title === 'string' && !/[<>]/.test(s.title)) {
      const w = s.title.trim().split(/\s+/);
      if (w.length >= 3) {
        const k = w.length > 3 && w[w.length - 1].length < 4 ? 2 : 1;
        s.title = `${w.slice(0, -k).join(' ')} <span class="esg-hl-w">${w.slice(-k).join(' ')}</span>`;
      }
    }
    visit(el.elements);
  };
  visit(doc.content);
  return doc;
}
