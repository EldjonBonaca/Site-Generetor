/**
 * CSS of a static site (static/render.js): what Elementor would generate from the settings of each
 * element (the "post-<id>.css" of a WordPress site), plus the base stylesheet those rules rely on.
 *
 * The markup keeps the class names of Elementor, so the CSS written for the WordPress sites (the site
 * CSS of the templates, the CSS copied with a website) applies to the static pages unchanged.
 */

export const TABLET = '(max-width:1024px)';
export const MOBILE = '(max-width:767px)';

/** Collects rules per device and prints them (desktop, then tablet, then phones). */
export class Sheet {
  constructor() {
    this.rules = { desktop: [], tablet: [], mobile: [] };
  }
  add(selector, decls, device = 'desktop') {
    const body = (Array.isArray(decls) ? decls : Object.entries(decls).map(([k, v]) => (v === undefined || v === null || v === '' ? null : `${k}:${v}`))).filter(Boolean);
    if (body.length) this.rules[device].push(`${selector}{${body.join(';')}}`);
  }
  toString() {
    const { desktop, tablet, mobile } = this.rules;
    return [desktop.join('\n'), tablet.length ? `@media${TABLET}{\n${tablet.join('\n')}\n}` : '', mobile.length ? `@media${MOBILE}{\n${mobile.join('\n')}\n}` : ''].filter(Boolean).join('\n');
  }
}

const DEVICES = [['', 'desktop'], ['_tablet', 'tablet'], ['_mobile', 'mobile']];

/** { unit, size } -> "12px" (null when empty). */
export const unit = (v) => (v && typeof v === 'object' && v.size !== '' && v.size !== undefined && v.size !== null ? `${v.size}${v.unit === 'custom' ? '' : v.unit || 'px'}` : null);
/** { unit, top, right, bottom, left } -> "1px 2px 3px 4px" (null when empty). */
export const box = (v) => {
  if (!v || typeof v !== 'object' || [v.top, v.right, v.bottom, v.left].every((x) => x === '' || x === undefined || x === null)) return null;
  const u = v.unit || 'px';
  return [v.top, v.right, v.bottom, v.left].map((x) => `${x === '' || x === undefined || x === null ? 0 : x}${u}`).join(' ');
};

/** A color setting: linked to a global color of the site when it is (with its own value as fallback). */
export function color(settings, key) {
  const value = settings[key];
  const id = /globals\/colors\?id=([a-z0-9]+)/i.exec(settings.__globals__?.[key] || '')?.[1];
  if (id) return `var(--e-global-color-${id}${typeof value === 'string' && value ? `,${value}` : ''})`;
  return typeof value === 'string' && value ? value : null;
}

/** Typography group of Elementor (prefix + "typography_…") as rules on a selector. */
export function typography(sheet, selector, s, prefix = '') {
  const p = `${prefix}typography_`;
  const global = /globals\/typography\?id=([a-z0-9]+)/i.exec(s.__globals__?.[`${p}typography`] || '')?.[1];
  if (global) {
    sheet.add(selector, { 'font-family': `var(--e-global-typography-${global}-font-family),sans-serif`, 'font-weight': `var(--e-global-typography-${global}-font-weight)` });
    return;
  }
  if (s[`${p}typography`] !== 'custom') return;
  sheet.add(selector, {
    'font-family': s[`${p}font_family`] ? `"${s[`${p}font_family`]}",sans-serif` : null,
    'font-weight': s[`${p}font_weight`],
    'font-style': s[`${p}font_style`],
    'text-transform': s[`${p}text_transform`],
    'line-height': unit(s[`${p}line_height`]),
    'letter-spacing': unit(s[`${p}letter_spacing`]),
  });
  for (const [suffix, device] of DEVICES) sheet.add(selector, { 'font-size': unit(s[`${p}font_size${suffix}`]) }, device);
}

const shadow = (v) => (v && typeof v === 'object' ? `${v.horizontal || 0}px ${v.vertical || 0}px ${v.blur || 0}px ${v.spread || 0}px ${v.color || 'rgba(0,0,0,.5)'}` : null);

function gradient(s, p) {
  const a = color(s, `${p}color`) || 'transparent';
  const b = color(s, `${p}color_b`) || 'transparent';
  if (s[`${p}gradient_type`] === 'radial') return `radial-gradient(at ${s[`${p}gradient_position`] || 'center center'},${a} 0%,${b} 100%)`;
  return `linear-gradient(${unit(s[`${p}gradient_angle`]) || '180deg'},${a} 0%,${b} 100%)`;
}

/** Background group (prefix "background_" of containers, "_background_" of widgets). */
function background(sheet, selector, s, p) {
  const kind = s[`${p}background`];
  if (kind === 'gradient') sheet.add(selector, { 'background-image': gradient(s, p) });
  else if (kind === 'classic' || kind === 'slideshow') {
    const img = s[`${p}image`]?.url;
    sheet.add(selector, {
      'background-color': color(s, `${p}color`),
      'background-image': img && kind === 'classic' ? `url("${img}")` : null,
      'background-position': img ? s[`${p}position`] || 'center center' : null,
      'background-size': img ? s[`${p}size`] || 'cover' : null,
      'background-repeat': img ? s[`${p}repeat`] || 'no-repeat' : null,
    });
  }
}

/** Border, radius and shadow groups (prefix '' of containers, '_' of the widget wrapper). */
function frame(sheet, selector, s, p) {
  if (s[`${p}border_border`] && s[`${p}border_border`] !== 'none') {
    sheet.add(selector, { 'border-style': s[`${p}border_border`], 'border-width': box(s[`${p}border_width`]), 'border-color': color(s, `${p}border_color`) });
  }
  sheet.add(selector, { 'border-radius': box(s[`${p}border_radius`]) });
  if (s[`${p}box_shadow_box_shadow_type`] === 'yes') sheet.add(selector, { 'box-shadow': shadow(s[`${p}box_shadow_box_shadow`]) });
  if (s[`${p}box_shadow_hover_box_shadow_type`] === 'yes') sheet.add(`${selector}:hover`, { 'box-shadow': shadow(s[`${p}box_shadow_hover_box_shadow`]) });
}

/** A container: the variables the base stylesheet turns into its layout (as Elementor does). */
export function containerCss(sheet, el) {
  const s = el.settings || {};
  const sel = `.elementor-element-${el.id}`;
  for (const [suffix, device] of DEVICES) {
    const pad = s[`padding${suffix}`];
    const margin = s[`margin${suffix}`];
    const g = s[`flex_gap${suffix}`];
    const u = (v, side) => (v && v[side] !== '' && v[side] !== undefined ? `${v[side]}${v.unit || 'px'}` : null);
    sheet.add(
      sel,
      {
        '--flex-direction': s[`flex_direction${suffix}`],
        '--flex-wrap': s[`flex_wrap${suffix}`],
        '--justify-content': s[`flex_justify_content${suffix}`],
        '--align-items': s[`flex_align_items${suffix}`],
        '--row-gap': g && g.row !== undefined && g.row !== '' ? `${g.row}${g.unit || 'px'}` : unit(g),
        '--column-gap': g && g.column !== undefined && g.column !== '' ? `${g.column}${g.unit || 'px'}` : unit(g),
        '--width': unit(s[`width${suffix}`]),
        '--min-height': unit(s[`min_height${suffix}`]),
        '--padding-top': u(pad, 'top'),
        '--padding-right': u(pad, 'right'),
        '--padding-bottom': u(pad, 'bottom'),
        '--padding-left': u(pad, 'left'),
        '--margin-top': u(margin, 'top'),
        '--margin-right': u(margin, 'right'),
        '--margin-bottom': u(margin, 'bottom'),
        '--margin-left': u(margin, 'left'),
      },
      device
    );
  }
  sheet.add(sel, { '--content-width': unit(s.boxed_width), '--z-index': s.z_index, '--overflow': s.overflow, 'align-self': s._flex_align_self });
  background(sheet, sel, s, 'background_');
  if (s.background_overlay_background === 'gradient') sheet.add(`${sel}::before`, { '--background-overlay': "''", 'background-image': gradient(s, 'background_overlay_'), opacity: unit(s.background_overlay_opacity) });
  else if (s.background_overlay_background === 'classic' && s.background_overlay_color) sheet.add(`${sel}::before`, { '--background-overlay': "''", 'background-color': color(s, 'background_overlay_color'), opacity: unit(s.background_overlay_opacity) });
  frame(sheet, sel, s, '');
}

/** Advanced tab of a widget (its wrapper): spacing, background, border, width, self alignment. */
function widgetWrapper(sheet, el) {
  const s = el.settings || {};
  const sel = `.elementor-element-${el.id}`;
  for (const [suffix, device] of DEVICES) sheet.add(sel, { padding: box(s[`_padding${suffix}`]), margin: box(s[`_margin${suffix}`]) }, device);
  background(sheet, sel, s, '_background_');
  frame(sheet, sel, s, '_');
  sheet.add(sel, { width: s._element_width === 'auto' ? 'auto' : s._element_width === 'inherit' ? '100%' : null, 'max-width': s._element_width === 'auto' ? '100%' : null, 'align-self': s._flex_align_self, 'z-index': s._z_index });
}

const flexAlign = (a) => ({ left: 'flex-start', start: 'flex-start', center: 'center', right: 'flex-end', end: 'flex-end', justify: 'stretch' })[a] || null;

/** Style tab of each widget type, on the selectors Elementor uses. */
const WIDGET_CSS = {
  heading(sheet, sel, s) {
    for (const [suffix, device] of DEVICES) sheet.add(sel, { 'text-align': s[`align${suffix}`] }, device);
    sheet.add(`${sel} .elementor-heading-title`, { color: color(s, 'title_color') });
    typography(sheet, `${sel} .elementor-heading-title`, s);
  },
  'text-editor'(sheet, sel, s) {
    for (const [suffix, device] of DEVICES) sheet.add(sel, { 'text-align': s[`align${suffix}`] }, device);
    sheet.add(sel, { color: color(s, 'text_color') });
    typography(sheet, sel, s);
  },
  button(sheet, sel, s) {
    for (const [suffix, device] of DEVICES) sheet.add(sel, { 'text-align': s[`align${suffix}`] }, device);
    const b = `${sel} .elementor-button`;
    sheet.add(b, { 'background-color': color(s, 'background_color'), color: color(s, 'button_text_color'), 'border-radius': box(s.border_radius), padding: box(s.text_padding) });
    if (s.border_border && s.border_border !== 'none') sheet.add(b, { 'border-style': s.border_border, 'border-width': box(s.border_width), 'border-color': color(s, 'border_color') });
    sheet.add(`${b}:hover,${b}:focus`, { 'background-color': color(s, 'button_background_hover_color'), color: color(s, 'hover_color'), 'border-color': color(s, 'button_hover_border_color') });
    sheet.add(`${b} .elementor-button-icon`, { 'margin-right': unit(s.icon_indent) });
    typography(sheet, b, s);
  },
  image(sheet, sel, s) {
    for (const [suffix, device] of DEVICES) {
      sheet.add(sel, { 'text-align': s[`align${suffix}`] }, device);
      sheet.add(`${sel} img`, { width: unit(s[`width${suffix}`]), height: unit(s[`height${suffix}`]) }, device);
    }
    const img = `${sel} img`;
    sheet.add(img, { 'max-width': unit(s.space) || '100%', 'object-fit': s['object-fit'], 'border-radius': box(s.image_border_radius) });
    if (s.image_border_border && s.image_border_border !== 'none') sheet.add(img, { 'border-style': s.image_border_border, 'border-width': box(s.image_border_width), 'border-color': color(s, 'image_border_color') });
    if (s.image_box_shadow_box_shadow_type === 'yes') sheet.add(img, { 'box-shadow': shadow(s.image_box_shadow_box_shadow) });
  },
  icon(sheet, sel, s) {
    for (const [suffix, device] of DEVICES) sheet.add(`${sel} .elementor-icon-wrapper`, { 'text-align': s[`align${suffix}`] }, device);
    const stacked = s.view === 'stacked';
    const framed = s.view === 'framed';
    sheet.add(`${sel} .elementor-icon`, {
      'font-size': unit(s.size),
      padding: unit(s.icon_padding),
      'background-color': stacked ? color(s, 'primary_color') : null,
      color: stacked ? color(s, 'secondary_color') || '#fff' : color(s, 'primary_color'),
      border: framed ? `3px solid ${color(s, 'primary_color') || 'currentColor'}` : null,
      'border-radius': (stacked || framed) && s.shape !== 'square' ? '50%' : null,
    });
  },
  'icon-box'(sheet, sel, s) {
    const stacked = s.view === 'stacked';
    const side = s.position === 'left' || s.position === 'right';
    sheet.add(`${sel} .elementor-icon-box-wrapper`, { 'text-align': s.text_align, display: side ? 'flex' : null, 'flex-direction': s.position === 'right' ? 'row-reverse' : null, 'align-items': side ? 'flex-start' : null, gap: side ? unit(s.icon_space) : null });
    sheet.add(`${sel} .elementor-icon-box-icon`, { 'margin-bottom': side ? null : unit(s.icon_space), 'flex-shrink': side ? '0' : null });
    sheet.add(`${sel} .elementor-icon`, {
      'font-size': unit(s.icon_size),
      padding: unit(s.icon_padding),
      'background-color': stacked ? color(s, 'primary_color') : null,
      color: stacked ? color(s, 'secondary_color') : color(s, 'primary_color'),
      'border-radius': stacked && s.shape !== 'square' ? '50%' : null,
    });
    sheet.add(`${sel} .elementor-icon-box-title`, { color: color(s, 'title_color'), 'margin-bottom': unit(s.title_bottom_space) });
    sheet.add(`${sel} .elementor-icon-box-title a`, { color: 'inherit' });
    typography(sheet, `${sel} .elementor-icon-box-title`, s, 'title_');
    sheet.add(`${sel} .elementor-icon-box-description`, { color: color(s, 'description_color') });
    typography(sheet, `${sel} .elementor-icon-box-description`, s, 'description_');
    for (const device of ['tablet', 'mobile']) if (s[`text_align_${device}`]) sheet.add(`${sel} .elementor-icon-box-wrapper`, { 'text-align': s[`text_align_${device}`], 'flex-direction': s[`position_${device}`] === 'left' ? 'row' : null }, device);
  },
  'icon-list'(sheet, sel, s) {
    const inline = s.view === 'inline';
    const space = unit(s.space_between);
    sheet.add(`${sel} .elementor-icon-list-items`, { display: inline ? 'flex' : null, 'flex-wrap': inline ? 'wrap' : null, 'justify-content': inline ? flexAlign(s.icon_align) : null, gap: inline && space ? `8px ${space}` : null });
    if (!inline && space) sheet.add(`${sel} .elementor-icon-list-item:not(:last-child)`, { 'padding-bottom': `calc(${space}/2)`, 'margin-bottom': `calc(${space}/2)` });
    sheet.add(`${sel} .elementor-icon-list-item,${sel} .elementor-icon-list-item a`, { 'justify-content': flexAlign(s.icon_align) });
    sheet.add(`${sel} .elementor-icon-list-icon`, { color: color(s, 'icon_color'), 'font-size': unit(s.icon_size) });
    sheet.add(`${sel} .elementor-icon-list-text`, { color: color(s, 'text_color') });
    sheet.add(`${sel} .elementor-icon-list-item a:hover .elementor-icon-list-text`, { color: color(s, 'text_color_hover') });
    typography(sheet, `${sel} .elementor-icon-list-item`, s, 'icon_');
  },
  'star-rating'(sheet, sel, s) {
    sheet.add(`${sel} .elementor-star-rating__wrapper`, { 'text-align': s.align });
    sheet.add(`${sel} .elementor-star-rating`, { color: color(s, 'stars_color'), 'font-size': unit(s.icon_size) });
  },
  testimonial(sheet, sel, s) {
    sheet.add(`${sel} .elementor-testimonial-wrapper`, { 'text-align': s.testimonial_alignment });
    sheet.add(`${sel} .elementor-testimonial-content`, { color: color(s, 'content_content_color') });
    typography(sheet, `${sel} .elementor-testimonial-content`, s, 'content_');
    sheet.add(`${sel} .elementor-testimonial-name`, { color: color(s, 'name_text_color') });
    typography(sheet, `${sel} .elementor-testimonial-name`, s, 'name_');
    sheet.add(`${sel} .elementor-testimonial-job`, { color: color(s, 'job_text_color') });
    typography(sheet, `${sel} .elementor-testimonial-job`, s, 'job_');
  },
  accordion(sheet, sel, s) {
    const border = `${unit(s.border_width) || '1px'} solid ${color(s, 'border_color') || '#d5d8dc'}`;
    sheet.add(`${sel} .elementor-accordion-item`, { border });
    sheet.add(`${sel} .elementor-accordion-item+.elementor-accordion-item`, { 'border-top': '0' });
    sheet.add(`${sel} .elementor-tab-title`, { 'background-color': color(s, 'title_background'), color: color(s, 'title_color'), padding: box(s.title_padding) });
    sheet.add(`${sel} details[open] .elementor-tab-title`, { color: color(s, 'tab_active_color') });
    sheet.add(`${sel} .elementor-accordion-icon`, { color: color(s, 'icon_color') });
    typography(sheet, `${sel} .elementor-tab-title`, s, 'title_');
    sheet.add(`${sel} .elementor-tab-content`, { 'background-color': color(s, 'content_background_color'), color: color(s, 'content_color'), padding: box(s.content_padding) });
    typography(sheet, `${sel} .elementor-tab-content`, s, 'content_');
  },
  divider(sheet, sel, s) {
    sheet.add(`${sel} .elementor-divider`, { 'text-align': s.align, 'padding-block': unit(s.gap) });
    sheet.add(`${sel} .elementor-divider-separator`, { width: unit(s.width), 'border-top': `${unit(s.weight) || '1px'} ${s.style || 'solid'} ${color(s, 'color') || 'currentColor'}` });
  },
  'social-icons'(sheet, sel, s) {
    sheet.add(`${sel} .elementor-social-icons-wrapper`, { 'justify-content': flexAlign(s.align), gap: unit(s.icon_spacing) });
    sheet.add(`${sel} .elementor-social-icon`, { 'font-size': unit(s.icon_size), padding: unit(s.icon_padding), 'background-color': color(s, 'icon_primary_color'), color: color(s, 'icon_secondary_color'), 'border-radius': s.shape === 'circle' ? '50%' : s.shape === 'rounded' ? '10%' : '0' });
    sheet.add(`${sel} .elementor-social-icon:hover`, { 'background-color': color(s, 'hover_primary_color'), color: color(s, 'hover_secondary_color') });
  },
  'image-gallery'(sheet, sel, s) {
    const gapSize = s.image_spacing === 'custom' ? unit(s.image_spacing_custom) : '10px';
    sheet.add(`${sel} .gallery`, { 'grid-template-columns': `repeat(${Number(s.gallery_columns) || 3},1fr)`, gap: gapSize });
    sheet.add(`${sel} .gallery`, { 'grid-template-columns': `repeat(${Number(s.gallery_columns_tablet) || Math.min(3, Number(s.gallery_columns) || 3)},1fr)` }, 'tablet');
    sheet.add(`${sel} .gallery`, { 'grid-template-columns': `repeat(${Number(s.gallery_columns_mobile) || 2},1fr)` }, 'mobile');
    sheet.add(`${sel} .gallery img`, { 'border-radius': box(s.image_border_radius) });
  },
  'image-carousel'(sheet, sel, s) {
    const gapSize = s.image_spacing === 'custom' ? unit(s.image_spacing_custom) || '0px' : '20px';
    sheet.add(`${sel} .esg-carousel`, { '--per': Number(s.slides_to_show) || 3, '--gap': gapSize });
    sheet.add(`${sel} .esg-carousel`, { '--per': Number(s.slides_to_show_tablet) || 2 }, 'tablet');
    sheet.add(`${sel} .esg-carousel`, { '--per': Number(s.slides_to_show_mobile) || 1 }, 'mobile');
    sheet.add(`${sel} .esg-carousel img`, { 'border-radius': box(s.image_border_radius) });
    sheet.add(`${sel} .esg-carousel-arrow`, { color: color(s, 'arrows_color'), 'font-size': unit(s.arrows_size) });
  },
  'hfe-basic-posts'(sheet, sel, s) {
    for (const [suffix, device] of DEVICES) {
      const cols = Number(s[`columns${suffix}`]);
      sheet.add(`${sel} .hfe-posts-grid`, { 'grid-template-columns': cols ? `repeat(${cols},1fr)` : null, 'column-gap': unit(s[`column_gap${suffix}`]), 'row-gap': unit(s[`row_gap${suffix}`]) }, device);
      sheet.add(`${sel} .hfe-post-content`, { padding: box(s[`card_padding${suffix}`]) }, device);
    }
    const card = `${sel} .hfe-post-card`;
    background(sheet, card, s, 'card_background_');
    frame(sheet, card, s, 'card_');
    sheet.add(`${sel} .hfe-post-title`, { 'margin-bottom': unit(s.title_spacing) });
    sheet.add(`${sel} .hfe-post-title a`, { color: color(s, 'title_color') });
    sheet.add(`${sel} .hfe-post-title a:hover`, { color: color(s, 'title_hover_color') });
    typography(sheet, `${sel} .hfe-post-title`, s, 'title_');
    sheet.add(`${sel} .hfe-post-excerpt`, { color: color(s, 'excerpt_color'), 'margin-bottom': unit(s.excerpt_spacing) });
    typography(sheet, `${sel} .hfe-post-excerpt`, s, 'excerpt_');
    sheet.add(`${sel} .hfe-read-more`, { color: color(s, 'read_more_color') });
    sheet.add(`${sel} .hfe-read-more:hover`, { color: color(s, 'read_more_hover_color') });
    typography(sheet, `${sel} .hfe-read-more`, s, 'read_more_');
  },
  'navigation-menu'(sheet, sel, s) {
    const link = `${sel} .hfe-nav-menu a.hfe-menu-item`;
    // A menu shown as a list: one link per line, no panel on phones
    if (s.layout === 'vertical') {
      sheet.add(link, { color: color(s, 'color_menu_item'), padding: `${unit(s.padding_vertical_menu_item) || '6px'} ${unit(s.padding_horizontal_menu_item) || '0px'}` });
      sheet.add(`${link}:hover,${sel} .hfe-nav-menu .current-menu-item>a.hfe-menu-item`, { color: color(s, 'color_menu_item_hover') });
      typography(sheet, link, s, 'menu_');
      return;
    }
    sheet.add(`${sel} .hfe-nav-menu`, { 'justify-content': flexAlign(s.navmenu_align), gap: `4px ${unit(s.menu_space_between) || '24px'}` });
    sheet.add(link, { color: color(s, 'color_menu_item'), padding: `${unit(s.padding_vertical_menu_item) || '8px'} ${unit(s.padding_horizontal_menu_item) || '0px'}` });
    sheet.add(`${link}:hover,${sel} .hfe-nav-menu .current-menu-item>a.hfe-menu-item`, { color: color(s, 'color_menu_item_hover') });
    typography(sheet, link, s, 'menu_');
    sheet.add(`${sel} .hfe-nav-menu__toggle`, { color: color(s, 'toggle_color'), 'font-size': unit(s.toggle_size) });
    sheet.add(`${sel} .hfe-nav-menu__toggle:hover`, { color: color(s, 'toggle_hover_color') });
    // Phones and tablets: the menu opens as a panel under the header
    sheet.add(`${sel} .hfe-nav-menu`, { 'background-color': color(s, 'background_color_dropdown_item') || '#fff' }, 'tablet');
    sheet.add(link, { color: color(s, 'color_dropdown_item') || color(s, 'color_menu_item'), padding: `${unit(s.padding_vertical_menu_item_tablet) || '14px'} ${unit(s.padding_horizontal_menu_item_tablet) || '20px'}` }, 'tablet');
    sheet.add(`${link}:hover`, { 'background-color': color(s, 'background_color_dropdown_item_hover'), color: color(s, 'color_dropdown_item_hover') }, 'tablet');
  },
};

/** CSS of one element (and of its children) added to the sheet. */
export function elementCss(sheet, el) {
  if (!el || typeof el !== 'object') return;
  if (el.elType === 'widget') {
    widgetWrapper(sheet, el);
    WIDGET_CSS[el.widgetType]?.(sheet, `.elementor-element-${el.id}`, el.settings || {});
  } else containerCss(sheet, el);
  (el.elements || []).forEach((child) => elementCss(sheet, child));
}

/** Global colors and fonts of the site (Elementor kit settings) as the variables the rules use. */
export function globalsCss(styles) {
  if (!styles) return '';
  const vars = [];
  for (const c of [...(styles.system_colors || []), ...(styles.custom_colors || [])]) if (c?._id && c.color) vars.push(`--e-global-color-${c._id}:${c.color}`);
  for (const f of [...(styles.system_typography || []), ...(styles.custom_typography || [])]) {
    if (!f?._id) continue;
    if (f.typography_font_family) vars.push(`--e-global-typography-${f._id}-font-family:"${f.typography_font_family}"`);
    if (f.typography_font_weight) vars.push(`--e-global-typography-${f._id}-font-weight:${f.typography_font_weight}`);
  }
  return vars.length ? `:root{${vars.join(';')}}` : '';
}

/**
 * Base stylesheet: the layout system of the containers (driven by the variables of containerCss, as in
 * Elementor), the widgets, the menu on phones, the gallery lightbox, carousels and entrance animations.
 */
export const BASE_CSS = `*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{margin:0;font-family:var(--e-global-typography-text-font-family,system-ui),sans-serif;font-size:16px;line-height:1.6;color:var(--e-global-color-text,#333);background:#fff;overflow-x:clip}
img{max-width:100%;height:auto;border:0;vertical-align:middle}
a{color:inherit;text-decoration:none}
h1,h2,h3,h4,h5,h6,p,figure,ul,ol{margin:0}
p+p{margin-top:.9em}
ul,ol{padding:0}
.elementor-text-editor ul,.elementor-widget-text-editor ul,.elementor-tab-content ul{padding-left:1.2em;margin:.6em 0}
.elementor-widget-text-editor ol{padding-left:1.4em;margin:.6em 0}
button{font:inherit;cursor:pointer}
.e-con{--display:flex;--flex-direction:column;--flex-wrap:nowrap;--justify-content:flex-start;--align-items:stretch;--row-gap:20px;--column-gap:20px;--width:100%;--min-height:0px;--padding-top:10px;--padding-right:10px;--padding-bottom:10px;--padding-left:10px;--margin-top:0px;--margin-right:0px;--margin-bottom:0px;--margin-left:0px;--z-index:auto;--overflow:visible;--content-width:1140px;--background-overlay:none;position:relative;width:var(--width);max-width:100%;min-width:0;min-height:var(--min-height);margin:var(--margin-top) var(--margin-right) var(--margin-bottom) var(--margin-left);padding:var(--padding-top) var(--padding-right) var(--padding-bottom) var(--padding-left);z-index:var(--z-index);overflow:var(--overflow);transition:box-shadow .3s,transform .3s}
.e-con::before{content:var(--background-overlay);position:absolute;inset:0;border-radius:inherit;pointer-events:none}
.e-con-full{display:var(--display);flex-direction:var(--flex-direction);flex-wrap:var(--flex-wrap);justify-content:var(--justify-content);align-items:var(--align-items);gap:var(--row-gap) var(--column-gap)}
.e-con-boxed{display:flex;flex-direction:column}
.e-con-boxed>.e-con-inner{position:relative;display:var(--display);flex-direction:var(--flex-direction);flex-wrap:var(--flex-wrap);justify-content:var(--justify-content);align-items:var(--align-items);gap:var(--row-gap) var(--column-gap);flex:1 1 auto;width:100%;max-width:var(--content-width);margin:0 auto}
.e-con>.elementor-element,.e-con-inner>.elementor-element{position:relative}
.elementor-widget{min-width:0;max-width:100%}
.elementor-heading-title{margin:0;padding:0;line-height:1.2}
.elementor-heading-title a{color:inherit}
.elementor-button{display:inline-block;line-height:1;text-align:center;transition:background-color .3s,color .3s,border-color .3s,transform .3s,box-shadow .3s}
.elementor-button-content-wrapper{display:inline-flex;align-items:center;justify-content:center}
.elementor-icon{display:inline-flex;align-items:center;justify-content:center;line-height:1;transition:all .3s}
.elementor-icon i{width:1em;height:1em;display:block;text-align:center}
.elementor-icon-list-items{list-style:none;margin:0;padding:0}
.elementor-icon-list-item,.elementor-icon-list-item a{display:flex;align-items:center}
.elementor-icon-list-icon{display:inline-flex;width:1.25em;margin-right:.55em;flex-shrink:0;justify-content:center}
.elementor-icon-list-text{transition:color .3s}
.elementor-star-rating{letter-spacing:.12em;line-height:1}
.elementor-testimonial-meta{margin-top:14px}
.elementor-testimonial-name,.elementor-testimonial-job{display:block}
.elementor-accordion-item summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:12px}
.elementor-accordion-item summary::-webkit-details-marker{display:none}
.elementor-accordion-icon{flex-shrink:0;width:1em;text-align:center}
.elementor-accordion-item .esg-minus,.elementor-accordion-item[open] .esg-plus{display:none}
.elementor-accordion-item[open] .esg-minus{display:inline}
.elementor-accordion-title{flex:1}
.elementor-divider{line-height:0}
.elementor-divider-separator{display:inline-block}
.elementor-social-icons-wrapper{display:flex;flex-wrap:wrap}
.elementor-social-icon{display:inline-flex;align-items:center;justify-content:center;width:auto;line-height:1;transition:all .3s}
.elementor-social-icon i{width:1em;height:1em;display:block;text-align:center}
.gallery{display:grid;margin:0}
.gallery a{display:block;overflow:hidden}
.gallery img{width:100%;aspect-ratio:4/3;object-fit:cover;display:block;transition:transform .5s}
.gallery a:hover img{transform:scale(1.04)}
.esg-carousel{position:relative}
.esg-carousel-track{display:flex;gap:var(--gap,0px);overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none}
.esg-carousel-track::-webkit-scrollbar{display:none}
.esg-carousel-track>*{flex:0 0 calc((100% - (var(--per,3) - 1)*var(--gap,0px))/var(--per,3));scroll-snap-align:start;overflow:hidden}
.esg-carousel-track img{width:100%;aspect-ratio:7/5;object-fit:cover;display:block}
.esg-carousel-arrow{position:absolute;top:50%;transform:translateY(-50%);z-index:2;background:none;border:0;padding:8px;line-height:1}
.esg-carousel-arrow.prev{left:4px}.esg-carousel-arrow.next{right:4px}
.esg-slideshow{position:absolute;inset:0;overflow:hidden;border-radius:inherit}
.esg-slideshow img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity 1.5s}
.esg-slideshow img.is-on{opacity:1;animation:esg-kenburns 8s ease-out both}
@keyframes esg-kenburns{from{transform:scale(1)}to{transform:scale(1.08)}}
.elementor-shape{position:absolute;left:0;width:100%;line-height:0;overflow:hidden;pointer-events:none}
.elementor-shape-bottom{bottom:-1px}.elementor-shape-top{top:-1px;transform:scaleY(-1)}
.elementor-shape svg{display:block;width:100%}
.hfe-nav-menu{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;align-items:center}
.hfe-nav-menu a.hfe-menu-item{display:block;transition:color .3s,background-color .3s}
.hfe-nav-menu__layout-vertical .hfe-nav-menu{display:block}
.hfe-posts-grid{display:grid}
.hfe-post-image img{width:100%;height:auto;display:block}
.hfe-post-title{margin-top:0;font-size:20px}
.hfe-post-title a,.hfe-read-more{text-decoration:none}
.hfe-nav-menu__layout-horizontal .hfe-nav-menu__toggle{display:none;background:none;border:0;padding:6px;line-height:1;margin-left:auto;color:inherit;box-shadow:none;min-width:0}
.esg-lightbox{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.9);padding:20px;cursor:zoom-out}
.esg-lightbox img{max-width:100%;max-height:100%;box-shadow:0 10px 60px rgba(0,0,0,.5)}
.esg-anim{opacity:0}
.esg-anim.is-in{animation:var(--anim,esg-fadeInUp) var(--dur,.9s) cubic-bezier(.2,.7,.3,1) both;animation-delay:var(--delay,0ms)}
@keyframes esg-fadeInUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:none}}
@keyframes esg-fadeIn{from{opacity:0}to{opacity:1}}
@keyframes esg-fadeInLeft{from{opacity:0;transform:translateX(-40px)}to{opacity:1;transform:none}}
@keyframes esg-zoomIn{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:none}}
.esg-form-status{margin:12px 0 0;padding:12px 16px;border-radius:6px;background:#e7f6ec;color:#12683a}
.esg-form-status.is-error{background:#fde8e8;color:#9b1c1c}
.esg-hp{position:absolute!important;left:-9999px!important;opacity:0}
@media${TABLET}{
.elementor-hidden-tablet{display:none!important}
.hfe-nav-menu__layout-horizontal .hfe-nav-menu__toggle{display:inline-flex}
.hfe-nav-menu__layout-horizontal .hfe-nav-menu{display:none;position:absolute;left:0;right:0;top:100%;z-index:1000;flex-direction:column;align-items:stretch;gap:0;box-shadow:0 18px 44px rgba(15,27,45,.2)}
.hfe-nav-menu__layout-horizontal.is-open .hfe-nav-menu{display:flex}
}
@media${MOBILE}{
.elementor-hidden-mobile{display:none!important}
}
@media(min-width:1025px){.elementor-hidden-desktop{display:none!important}}
@media(prefers-reduced-motion:reduce){.esg-anim{opacity:1}.esg-anim.is-in{animation:none}html{scroll-behavior:auto}}`;
