/**
 * Built-in clean layout: the generator builds the Elementor documents itself instead of
 * rewriting a Template Kit, so every page has exactly the planned sections and nothing else.
 *
 *   Home      hero banner · about (+ button to the About page) · services cards · photo carousel · reviews
 *   About     banner · two text + photo blocks
 *   Services  banner · one card per service (photo, name, text, button to the article)
 *   Gallery   banner · image gallery with every photo (lightbox)
 *   Contact   banner · contact details + styled Contact Form 7 form · Google map
 *   Header / Footer, and one document per service article (colored banner + text)
 *
 * Only free Elementor widgets are used (the header nav-menu is converted by the WordPress plugin
 * to the free Ultimate Addons menu when Elementor Pro is missing). Legacy sections/columns are used
 * because they render on every Elementor install, with or without the Flexbox Container feature.
 *
 * Each builder returns { doc, meta, fixed, hints, limits, slotRoles }:
 *   - meta:      WeakMap read by analyzeDocument (card index of service cards)
 *   - fixed:     element ids whose texts are set by the generator (no AI field)
 *   - hints:     element id -> hint for the AI
 *   - limits:    element id -> max length of its text
 *   - slotRoles: element id -> image slot role (hero, subheader, gallery, service_list, logo)
 * The structure only depends on the project data (services, photos, logo, reviews), so the
 * analysis and the export see the same field and slot ids; colors may differ (design).
 */
import crypto from 'node:crypto';
import { copyrightText, oneLine, pageSlug, pageTitle } from '../generation/plan.js';
import { telHref } from '../lib/util.js';

export const BUILTIN_PREFIX = 'builtin:';
export const BUILTIN_ROLES = ['home', 'about', 'services', 'gallery', 'contact', 'header', 'footer'];
export const isBuiltinTemplate = (templateId) => typeof templateId === 'string' && templateId.startsWith(BUILTIN_PREFIX);

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const PLACEHOLDER_IMAGE = 'https://placeholder.invalid/photo.jpg';
const HEADING_FONT = 'Poppins';
const BODY_FONT = 'Inter';

// ---------------------------------------------------------------------------- colors

export const DEFAULT_PRIMARY = '#1f4e79';

const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
};
const rgbToHex = (rgb) => `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
export const isHexColor = (v) => /^#[0-9a-f]{6}$/i.test(String(v || ''));

/** Mix two colors: t = 0 -> a, t = 1 -> b. */
export const mix = (a, b, t) => {
  const [x, y] = [hexToRgb(a), hexToRgb(b)];
  return rgbToHex(x.map((v, i) => v + (y[i] - v) * t));
};

const luminance = (hex) => {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Palette derived from the brand color (the logo color, or the one chosen in the Layout step). */
export function makeDesign(primary = DEFAULT_PRIMARY) {
  const p = isHexColor(primary) ? primary.toLowerCase() : DEFAULT_PRIMARY;
  // A very light brand color (e.g. yellow) is unreadable as button background on white: darken it.
  const strong = luminance(p) > 0.55 ? mix(p, '#000000', 0.35) : p;
  return {
    primary: strong,
    onPrimary: luminance(strong) > 0.45 ? '#111111' : '#ffffff',
    dark: mix(strong, '#0b0f14', 0.82),
    tint: mix(strong, '#ffffff', 0.94),
    text: '#4a4f57',
    heading: '#15181d',
  };
}

// ---------------------------------------------------------------------------- element helpers

/** Builder with deterministic element ids (same project data -> same ids). */
function createBuilder(seed) {
  let n = 0;
  const meta = new WeakMap();
  const fixed = new Set();
  const hints = {};
  const limits = {};
  const slotRoles = {};
  const newId = () => crypto.createHash('md5').update(`${seed}:${n++}`).digest('hex').slice(0, 7);
  const clean = (o) => JSON.parse(JSON.stringify(o)); // drop undefined values

  const el = (elType, settings, elements = [], extra = {}) => ({ id: newId(), elType, settings: clean(settings), elements, isInner: false, ...extra });
  const widget = (widgetType, settings, opts = {}) => {
    const w = { id: newId(), elType: 'widget', widgetType, settings: clean(settings), elements: [] };
    if (opts.fixed) fixed.add(w.id);
    if (opts.hint) hints[w.id] = opts.hint;
    if (opts.max) limits[w.id] = opts.max;
    if (opts.slot) slotRoles[w.id] = opts.slot;
    return w;
  };
  return { el, widget, meta, fixed, hints, limits, slotRoles, newId };
}

const px = (size) => ({ unit: 'px', size });
const box = (top, right = top, bottom = top, left = right, unit = 'px') => ({ unit, top: String(top), right: String(right), bottom: String(bottom), left: String(left), isLinked: false });

const typo = (size, weight, { family = BODY_FONT, mobile, lineHeight, spacing, transform } = {}) => ({
  typography_typography: 'custom',
  typography_font_family: family,
  typography_font_size: px(size),
  typography_font_size_mobile: mobile ? px(mobile) : undefined,
  typography_font_weight: String(weight),
  typography_line_height: lineHeight ? { unit: 'em', size: lineHeight } : undefined,
  typography_letter_spacing: spacing ? px(spacing) : undefined,
  typography_text_transform: transform,
});

function makeKit(b, design) {
  const { el, widget } = b;

  const section = (settings, columns) =>
    el('section', { gap: 'wide', content_width: px(1180), layout: 'boxed', content_position: 'middle', ...settings }, columns);
  const innerSection = (columns, settings = {}) => ({ ...el('section', { gap: 'wide', ...settings }, columns), isInner: true });
  // _inline_size sets the real width: Elementor only has CSS classes for some sizes (20, 25, 33, 50…),
  // so a 24% or 58% column without it would shrink to its content.
  const column = (size, widgets, settings = {}) => el('column', { _column_size: size, _inline_size: size < 100 ? size : null, ...settings }, widgets);

  const heading = (title, { tag = 'h2', size = 40, mobile = 28, color = design.heading, align, weight = 700, link, max = 70, ...opts } = {}) =>
    widget('heading', { title, header_size: tag, align, title_color: color, link, ...typo(size, weight, { family: HEADING_FONT, mobile, lineHeight: 1.2 }) }, { max, ...opts });
  const eyebrow = (title, { color = design.primary, align, ...opts } = {}) =>
    widget('heading', { title, header_size: 'h6', align, title_color: color, ...typo(13, 600, { spacing: 2, transform: 'uppercase' }) }, { max: 40, ...opts });
  const text = (html, { color = design.text, align, size = 16, max = 220, ...opts } = {}) =>
    widget('text-editor', { editor: html, align, text_color: color, ...typo(size, 400, { lineHeight: 1.7 }) }, { max, ...opts });
  const button = (label, url, { align, outline = false, small = false, ...opts } = {}) =>
    widget(
      'button',
      {
        text: label,
        link: { url, is_external: '', nofollow: '' },
        align,
        background_background: 'classic',
        background_color: outline ? 'rgba(0,0,0,0)' : design.primary,
        button_text_color: outline ? design.primary : design.onPrimary,
        hover_color: design.onPrimary,
        button_background_hover_color: mix(design.primary, '#000000', 0.18),
        border_border: outline ? 'solid' : undefined,
        border_width: outline ? box(2) : undefined,
        border_color: outline ? design.primary : undefined,
        border_radius: box(6),
        text_padding: small ? box(10, 20) : box(12, 26),
        ...typo(small ? 14 : 15, 600),
      },
      { max: 28, ...opts }
    );
  const image = ({ height, radius = 10, width, ...opts } = {}) =>
    widget(
      'image',
      {
        image: { url: PLACEHOLDER_IMAGE, id: '' },
        image_size: 'large',
        width: width ? px(width) : { unit: '%', size: 100 },
        height: height ? px(height) : undefined,
        height_mobile: height ? px(Math.min(height, 260)) : undefined,
        'object-fit': height ? 'cover' : undefined,
        image_border_radius: radius ? box(radius) : undefined,
      },
      opts
    );
  const spacer = (size) => widget('spacer', { space: px(size) }, { fixed: true });
  const html = (code) => widget('html', { html: code }, { fixed: true });
  const iconList = (items, { color = design.text, iconColor = design.primary, ...opts } = {}) =>
    widget(
      'icon-list',
      {
        icon_list: items.map((it) => ({
          _id: b.newId(),
          text: it.text,
          selected_icon: { value: it.icon || 'fas fa-check', library: 'fa-solid' },
          link: it.url ? { url: it.url, is_external: '', nofollow: '' } : undefined,
        })),
        space_between: px(12),
        icon_color: iconColor,
        text_color: color,
        icon_size: px(15),
        icon_typography_typography: 'custom',
        icon_typography_font_family: BODY_FONT,
        icon_typography_font_size: px(15),
        icon_typography_line_height: { unit: 'em', size: 1.5 },
      },
      { fixed: true, ...opts }
    );

  /** Banner of the inner pages: subheader photo with a brand-color overlay, page title + subtitle. */
  const banner = (subtitleHint) => {
    const sec = section(
      {
        layout: 'boxed',
        height: 'min-height',
        custom_height: { unit: 'px', size: 380 },
        custom_height_mobile: { unit: 'px', size: 280 },
        background_background: 'classic',
        background_color: design.primary,
        background_image: { url: PLACEHOLDER_IMAGE, id: '' },
        background_position: 'center center',
        background_size: 'cover',
        background_overlay_background: 'classic',
        background_overlay_color: design.primary,
        background_overlay_opacity: { unit: 'px', size: 0.82 },
        padding: box(110, 20, 80),
      },
      [
        column(100, [
          heading('Page title', { tag: 'h1', size: 52, mobile: 34, color: design.onPrimary, align: 'center' }),
          text('<p>Short subtitle of the page.</p>', { color: design.onPrimary, align: 'center', size: 18, max: 160, hint: subtitleHint }),
        ]),
      ]
    );
    b.slotRoles[sec.id] = 'subheader';
    return sec;
  };

  return { section, innerSection, column, heading, eyebrow, text, button, image, spacer, html, iconList, banner };
}

/** Rows of cards (inner sections): 3 per row, 2 when that avoids a lonely last card (2 or 4 cards). */
function rows(k, cards) {
  const n = cards.length;
  const perRow = n === 1 ? 1 : n === 2 || n === 4 ? 2 : 3;
  const size = Math.round(100 / perRow);
  const out = [];
  for (let i = 0; i < n; i += perRow) {
    const slice = cards.slice(i, i + perRow);
    const cols = slice.map((c) => k.column(size, c.widgets, c.settings));
    out.push(k.innerSection(cols, { content_position: 'top', structure: String(slice.length * 10), gap: 'extended', content_width: perRow === 1 ? px(520) : undefined }));
  }
  return out;
}

const cardColumn = (design, extra = {}) => ({
  background_background: 'classic',
  background_color: '#ffffff',
  border_radius: box(12),
  box_shadow_box_shadow_type: 'yes',
  box_shadow_box_shadow: { horizontal: 0, vertical: 12, blur: 32, spread: 0, color: 'rgba(16,24,40,0.08)' },
  padding: box(28),
  margin: box(10),
  ...extra,
});

// ---------------------------------------------------------------------------- site data helpers

function siteData(ctx) {
  const lang = ctx.project.language;
  const url = (role) => (pageSlug(lang, role) ? `/${pageSlug(lang, role)}/` : '/');
  const reviews = (ctx.settings.reviews || []).filter((r) => r && String(r.text || '').trim()).slice(0, 9);
  return {
    lang,
    url,
    title: (role) => pageTitle(lang, role),
    hasLogo: ctx.images.some((i) => i.role === 'logo'),
    reviews,
    phone: ctx.project.phone,
    email: ctx.project.email,
    address: oneLine(ctx.project.address),
  };
}

const mapIframe = (address) =>
  `<iframe src="https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed" width="100%" height="450" style="border:0;display:block" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;

function formCss(design) {
  const p = design.primary;
  return `<style>
.esg-form .wpcf7-form p{margin:0 0 18px}
.esg-form .wpcf7-form label{display:block;font-weight:600;font-size:14px;color:${design.heading};margin-bottom:6px}
.esg-form input[type=text],.esg-form input[type=email],.esg-form input[type=tel],.esg-form input[type=url],.esg-form textarea,.esg-form select{width:100%;box-sizing:border-box;margin-top:6px;padding:14px 16px;border:1px solid #dde1e7;border-radius:8px;background:#f7f8fa;font-size:15px;color:${design.heading};transition:border-color .2s,box-shadow .2s,background .2s}
.esg-form textarea{min-height:150px;resize:vertical}
.esg-form input:focus,.esg-form textarea:focus,.esg-form select:focus{outline:none;border-color:${p};background:#fff;box-shadow:0 0 0 3px ${p}33}
.esg-form input[type=submit]{width:100%;background:${p};color:${design.onPrimary};border:0;border-radius:8px;padding:15px 34px;font-size:16px;font-weight:600;cursor:pointer;transition:filter .2s}
.esg-form input[type=submit]:hover{filter:brightness(.9)}
.esg-form .wpcf7-not-valid-tip{font-size:13px;margin-top:4px}
.esg-form .wpcf7-response-output{border-radius:8px;margin:16px 0 0!important;padding:12px 16px!important}
.esg-form .wpcf7-spinner{display:block;margin:10px auto 0}
</style>`;
}

// ---------------------------------------------------------------------------- pages

function homeDoc(ctx, k, b, design) {
  const s = siteData(ctx);
  const sections = [];

  // Hero banner
  sections.push(
    k.section(
      {
        height: 'min-height',
        custom_height: { unit: 'vh', size: 86 },
        custom_height_mobile: { unit: 'vh', size: 70 },
        background_background: 'classic',
        background_color: design.dark,
        background_image: { url: PLACEHOLDER_IMAGE, id: '' },
        background_position: 'center center',
        background_size: 'cover',
        background_overlay_background: 'gradient',
        background_overlay_color: design.dark,
        background_overlay_color_b: design.primary,
        background_overlay_gradient_angle: { unit: 'deg', size: 120 },
        background_overlay_opacity: { unit: 'px', size: 0.72 },
        padding: box(140, 20, 120),
      },
      [
        k.column(100, [
          k.eyebrow('Short tagline', { color: '#ffffff', align: 'center', hint: 'short tagline above the main title (business type + city), max 6 words' }),
          k.heading('Main headline of the website', { tag: 'h1', size: 60, mobile: 36, color: '#ffffff', align: 'center', max: 80, hint: 'main H1 headline of the home page: what the business does and where' }),
          k.text('<p>Two sentences that present the business and invite the visitor to get in touch.</p>', { color: 'rgba(255,255,255,0.9)', align: 'center', size: 18, hint: 'intro under the headline, 1–2 sentences' }),
          k.spacer(10),
          k.button('Contact us', s.url('contact'), { align: 'center', hint: 'call to action button to the contact page, 2–3 words' }),
        ]),
      ]
    )
  );
  b.slotRoles[sections[0].id] = 'hero';

  // About
  const aboutImage = k.image({ height: 480, slot: 'gallery' });
  sections.push(
    k.section({ padding: box(100, 20) }, [
      k.column(50, [aboutImage]),
      k.column(50, [
        k.eyebrow(s.title('about'), { hint: 'small label of the about section (e.g. "Chi siamo"), 1–2 words' }),
        k.heading('Who we are', { hint: 'title of the about section' }),
        k.text('<p>Presentation of the business: history, experience, values. Two short paragraphs.</p>', { max: 650, hint: 'presentation of the business, 2 short paragraphs (HTML <p>)' }),
        k.spacer(6),
        k.button('Learn more', s.url('about'), { outline: true, hint: 'button to the about page, 2–3 words' }),
      ], { padding: box(0, 0, 0, 30) }),
    ])
  );

  // Services cards (name, description, button)
  if (ctx.services.length) {
    const cards = ctx.services.map((svc) => {
      const widgets = [
        k.heading(svc.name, { tag: 'h3', size: 22, mobile: 20 }),
        k.text('<p>Short description of the service.</p>', { size: 15, max: 170, hint: 'short description of the service for its card, 1–2 sentences' }),
        k.button('Discover', `/${svc.slug}/`, { outline: true, hint: 'button to the service article, 1–3 words' }),
      ];
      return { widgets, settings: cardColumn(design) };
    });
    const rowEls = rows(k, cards);
    // Card index (one card per service) for analyzeDocument: the service name is set automatically
    let i = 0;
    for (const row of rowEls) for (const col of row.elements) b.meta.set(col, { card: i++ });
    sections.push(
      k.section({ background_background: 'classic', background_color: design.tint, padding: box(100, 20) }, [
        k.column(100, [
          k.eyebrow(s.title('services'), { align: 'center', hint: 'small label of the services section, 1–2 words' }),
          k.heading('Our services', { align: 'center', hint: 'title of the services section' }),
          k.text('<p>One sentence introducing the services.</p>', { align: 'center', hint: 'one sentence introducing the services' }),
          k.spacer(20),
          ...rowEls,
          k.spacer(10),
          k.button('All services', s.url('services'), { align: 'center', hint: 'button to the services page, 2–3 words' }),
        ]),
      ])
    );
  }

  // Photo carousel
  if (ctx.images.some((img) => img.role !== 'logo')) {
    sections.push(
      k.section({ padding: box(100, 20) }, [
        k.column(100, [
          k.eyebrow(s.title('gallery'), { align: 'center', hint: 'small label of the gallery section, 1–2 words' }),
          k.heading('Our work', { align: 'center', hint: 'title of the photo gallery section' }),
          k.spacer(20),
          b.widget(
            'image-carousel',
            {
              carousel: [{ id: '', url: PLACEHOLDER_IMAGE }],
              thumbnail_size: 'medium_large',
              slides_to_show: '3',
              slides_to_show_tablet: '2',
              slides_to_show_mobile: '1',
              slides_to_scroll: '1',
              image_stretch: 'yes',
              navigation: 'both',
              autoplay: 'yes',
              autoplay_speed: 4000,
              infinite: 'yes',
              link_to: 'file',
              open_lightbox: 'yes',
              image_spacing: 'custom',
              image_spacing_custom: px(16),
              image_border_radius: box(10),
              arrows_color: '#ffffff',
              dots_color: design.primary,
            },
            { slot: 'gallery' }
          ),
          k.spacer(30),
          k.button('View the gallery', s.url('gallery'), { align: 'center', outline: true, hint: 'button to the gallery page, 2–4 words' }),
        ]),
      ])
    );
  }

  // Reviews (entered by the user in Site data: never invented)
  if (s.reviews.length) {
    const cards = s.reviews.map((r) => ({
      widgets: [
        b.widget(
          'testimonial',
          {
            testimonial_content: String(r.text).trim(),
            testimonial_name: String(r.name || '').trim(),
            testimonial_job: String(r.role || '').trim(),
            testimonial_image: { url: '', id: '' },
            testimonial_alignment: 'center',
            content_content_color: design.text,
            name_text_color: design.heading,
            job_text_color: design.primary,
            content_typography_typography: 'custom',
            content_typography_font_size: px(16),
            content_typography_font_style: 'italic',
          },
          { fixed: true }
        ),
      ],
      settings: cardColumn(design, { padding: box(32) }),
    }));
    sections.push(
      k.section({ background_background: 'classic', background_color: design.tint, padding: box(100, 20) }, [
        k.column(100, [
          k.eyebrow('Reviews', { align: 'center', hint: 'small label of the reviews section, 1–2 words' }),
          k.heading('What our customers say', { align: 'center', hint: 'title of the customer reviews section' }),
          k.spacer(20),
          ...rows(k, cards),
        ]),
      ])
    );
  }
  return sections;
}

function aboutDoc(ctx, k) {
  const block = (imageFirst, n) => {
    const img = k.column(50, [k.image({ height: 460, slot: 'gallery' })]);
    const txt = k.column(
      50,
      [
        k.eyebrow(n === 1 ? 'Our story' : 'Our values', { hint: `small label of block ${n} (1–3 words)` }),
        k.heading(n === 1 ? 'Who we are' : 'How we work', { hint: n === 1 ? 'title: who we are / our story' : 'title: how we work, values, method' }),
        k.text(
          '<p>Two or three paragraphs of text.</p>',
          { max: 900, hint: n === 1 ? 'history and presentation of the business, 2–3 paragraphs (HTML <p>), 400–700 characters' : 'method, values and strengths, 2–3 paragraphs or a short list (HTML), 400–700 characters' }
        ),
      ],
      { padding: imageFirst ? box(0, 0, 0, 30) : box(0, 30, 0, 0) }
    );
    return k.section({ padding: box(90, 20), reverse_order_mobile: imageFirst ? undefined : 'reverse-mobile' }, imageFirst ? [img, txt] : [txt, img]);
  };
  return [k.banner('subtitle of the about page, one sentence'), block(true, 1), block(false, 2)];
}

function servicesDoc(ctx, k, b, design) {
  const sections = [k.banner('subtitle of the services page, one sentence')];
  if (!ctx.services.length) return sections;
  const cards = ctx.services.map((svc) => ({
    widgets: [
      k.image({ height: 240, slot: 'service_list' }),
      k.heading(svc.name, { tag: 'h3', size: 22, mobile: 20 }),
      k.text('<p>Description of the service.</p>', { size: 15, max: 280, hint: 'description of the service, 2–3 sentences' }),
      k.button('Learn more', `/${svc.slug}/`, { hint: 'button to the service article, 1–3 words' }),
    ],
    settings: cardColumn(design, { padding: box(18, 18, 28, 18) }),
  }));
  const rowEls = rows(k, cards);
  let i = 0;
  for (const row of rowEls) for (const col of row.elements) b.meta.set(col, { card: i++ });
  sections.push(k.section({ background_background: 'classic', background_color: design.tint, padding: box(90, 20) }, [k.column(100, rowEls)]));
  return sections;
}

function galleryDoc(ctx, k, b) {
  return [
    k.banner('subtitle of the gallery page, one sentence'),
    k.section({ padding: box(80, 20) }, [
      k.column(100, [
        b.widget(
          'image-gallery',
          { wp_gallery: [{ id: '', url: PLACEHOLDER_IMAGE }], thumbnail_size: 'medium_large', gallery_columns: '3', gallery_columns_mobile: '1', gallery_link: 'file', open_lightbox: 'yes', image_spacing: 'custom', image_spacing_custom: px(14), image_border_radius: box(8) },
          { slot: 'gallery' }
        ),
      ]),
    ]),
  ];
}

function contactDoc(ctx, k, b, design) {
  const s = siteData(ctx);
  const details = k.iconList([
    { text: s.phone, icon: 'fas fa-phone-alt', url: `tel:${telHref(s.phone)}` },
    { text: s.email, icon: 'fas fa-envelope', url: `mailto:${s.email}` },
    { text: s.address, icon: 'fas fa-map-marker-alt' },
  ]);
  const sections = [
    k.banner('subtitle of the contact page, one sentence'),
    k.section({ padding: box(90, 20), content_position: 'top' }, [
      k.column(42, [
        k.eyebrow(s.title('contact'), { hint: 'small label, 1–2 words' }),
        k.heading('Get in touch', { hint: 'title inviting to contact the business' }),
        k.text('<p>Invitation to write or call, with the response time.</p>', { hint: 'invitation to contact the business, 1–2 sentences' }),
        k.spacer(6),
        details,
      ], { padding: box(0, 30, 0, 0) }),
      k.column(58, [
        k.heading('Write to us', { tag: 'h3', size: 26, mobile: 22, hint: 'title above the contact form, 2–4 words' }),
        k.spacer(4),
        b.widget('shortcode', { shortcode: ctx.settings.contactShortcode }, { fixed: true }),
        k.html(formCss(design)),
      ], cardColumn(design, { padding: box(40, 36), css_classes: 'esg-form' })),
    ]),
  ];
  if (ctx.settings.mapEmbed && s.address) sections.push(k.section({ layout: 'full_width', gap: 'no', padding: box(0) }, [k.column(100, [k.html(mapIframe(s.address))], { padding: box(0) })]));
  return sections;
}

function headerDoc(ctx, k, b, design) {
  const s = siteData(ctx);
  // Site logo widget: shows the WordPress logo (Appearance → Customize → Site Identity), which the
  // plugin sets from the uploaded logo and the owner can change at any time. Without Elementor Pro
  // the plugin converts it to the free Ultimate Addons "Site Logo".
  const brand = b.widget('theme-site-logo', { width: px(170), width_mobile: px(130), align: 'left' }, { fixed: true });
  return [
    k.section(
      {
        gap: 'no',
        layout: 'full_width',
        background_background: 'classic',
        background_color: '#ffffff',
        padding: box(12, 40),
        padding_mobile: box(10, 16),
        box_shadow_box_shadow_type: 'yes',
        box_shadow_box_shadow: { horizontal: 0, vertical: 2, blur: 16, spread: 0, color: 'rgba(16,24,40,0.07)' },
        z_index: 20,
      },
      [
        k.column(22, [brand], { _inline_size_mobile: 60, _inline_size_tablet: 40 }),
        k.column(58, [
          b.widget(
            'nav-menu',
            {
              menu: ctx.menu.slug,
              layout: 'horizontal',
              align_items: 'center',
              pointer: 'underline',
              color_menu_item: design.heading,
              color_menu_item_hover: design.primary,
              pointer_color_menu_item_hover: design.primary,
              color_menu_item_active: design.primary,
              menu_typography_typography: 'custom',
              menu_typography_font_family: BODY_FONT,
              menu_typography_font_size: px(15),
              menu_typography_font_weight: '500',
              menu_typography_line_height: { unit: 'em', size: 1.4 },
              dropdown: 'tablet',
              toggle_align: 'right',
              toggle_color: design.heading,
            },
            { fixed: true }
          ),
        ], { _inline_size_mobile: 40, _inline_size_tablet: 60 }),
        k.column(20, [k.button(s.phone, `tel:${telHref(s.phone)}`, { align: 'right', small: true, fixed: true })], { hide_mobile: 'hidden-mobile', hide_tablet: 'hidden-tablet' }),
      ]
    ),
  ];
}

function footerDoc(ctx, k, b, design) {
  const s = siteData(ctx);
  const light = 'rgba(255,255,255,0.75)';
  const brand = s.hasLogo
    ? b.widget('image', { image: { url: PLACEHOLDER_IMAGE, id: '' }, image_size: 'medium', width: px(160), align: 'left' }, { slot: 'logo' })
    : k.heading(ctx.project.site_name, { tag: 'div', size: 24, color: '#ffffff', fixed: true });
  const colTitle = (title, hint) => k.heading(title, { tag: 'h4', size: 17, mobile: 17, color: '#ffffff', max: 30, hint });
  const pages = ['home', 'about', 'services', 'gallery', 'contact'].map((role) => ({ text: s.title(role), url: s.url(role), icon: 'fas fa-angle-right' }));
  return [
    k.section({ background_background: 'classic', background_color: design.dark, padding: box(80, 20, 40), content_position: 'top' }, [
      k.column(40, [brand, k.spacer(6), k.text('<p>Short description of the business.</p>', { color: light, size: 15, max: 200, hint: 'short description of the business for the footer, 1–2 sentences' })], { padding: box(0, 40, 0, 0) }),
      k.column(25, [colTitle('Quick links', 'title of the footer column with the page links, 1–2 words'), k.iconList(pages, { color: light, iconColor: mix(design.primary, '#ffffff', 0.35) })]),
      k.column(35, [
        colTitle('Contacts', 'title of the footer column with the contact details, 1–2 words'),
        k.iconList(
          [
            { text: s.phone, icon: 'fas fa-phone-alt', url: `tel:${telHref(s.phone)}` },
            { text: s.email, icon: 'fas fa-envelope', url: `mailto:${s.email}` },
            { text: s.address, icon: 'fas fa-map-marker-alt' },
          ],
          { color: light, iconColor: mix(design.primary, '#ffffff', 0.35) }
        ),
      ]),
    ]),
    k.section({ background_background: 'classic', background_color: design.dark, border_border: 'solid', border_width: box(1, 0, 0, 0), border_color: 'rgba(255,255,255,0.12)', padding: box(22, 20) }, [
      k.column(100, [k.text(`<p>${copyrightText(ctx.project)}</p>`, { color: 'rgba(255,255,255,0.6)', size: 14, align: 'center', fixed: true })]),
    ]),
  ];
}

const BUILDERS = { home: homeDoc, about: aboutDoc, services: servicesDoc, gallery: galleryDoc, contact: contactDoc, header: headerDoc, footer: footerDoc };

/**
 * Elementor document of a page of the built-in layout.
 * @param {object} ctx  project context (ctx.design = palette, set by the exporter)
 * @param {string} role home | about | services | gallery | contact | header | footer
 */
export function buildLayoutDoc(ctx, role) {
  const design = ctx.design || makeDesign(ctx.settings.design?.primaryColor);
  const b = createBuilder(`layout:${role}`);
  const k = makeKit(b, design);
  const content = BUILDERS[role](ctx, k, b, design);
  content.forEach((top, i) => b.meta.set(top, { ...(b.meta.get(top) || {}), origIndex: i }));
  const type = role === 'header' || role === 'footer' ? role : 'page';
  const doc = { version: '0.4', title: role, type, content, page_settings: role === 'header' || role === 'footer' ? {} : { hide_title: 'yes' } };
  return { doc, meta: b.meta, fixed: b.fixed, hints: b.hints, limits: b.limits, slotRoles: b.slotRoles };
}

/** Article of a service: colored banner with the service name and summary, then the text. No comments. */
export function buildPostDoc(ctx, { title, excerpt, content }) {
  const design = ctx.design || makeDesign(ctx.settings.design?.primaryColor);
  const b = createBuilder(`post:${title}`);
  const k = makeKit(b, design);
  const sections = [
    k.section(
      {
        height: 'min-height',
        custom_height: { unit: 'px', size: 340 },
        custom_height_mobile: { unit: 'px', size: 240 },
        background_background: 'gradient',
        background_color: design.primary,
        background_color_b: mix(design.primary, '#000000', 0.38),
        background_gradient_angle: { unit: 'deg', size: 135 },
        padding: box(100, 20, 70),
      },
      [
        k.column(100, [
          k.heading(title, { tag: 'h1', size: 48, mobile: 32, color: design.onPrimary, align: 'center' }),
          excerpt ? k.text(`<p>${escapeHtml(excerpt)}</p>`, { color: design.onPrimary, align: 'center', size: 18 }) : null,
        ].filter(Boolean)),
      ]
    ),
    k.section({ content_width: px(860), padding: box(80, 20) }, [k.column(100, [k.text(content, { size: 17 })])]),
  ];
  return { version: '0.4', title, type: 'wp-post', content: sections, page_settings: { hide_title: 'yes' } };
}

/** Elementor kit settings for the built-in layout: the brand palette as global colors. */
export function layoutGlobalStyles(design) {
  const font = (_id, title, family, weight) => ({ _id, title, typography_typography: 'custom', typography_font_family: family, typography_font_weight: weight });
  return {
    system_typography: [font('primary', 'Primary', HEADING_FONT, '700'), font('secondary', 'Secondary', HEADING_FONT, '500'), font('text', 'Text', BODY_FONT, '400'), font('accent', 'Accent', BODY_FONT, '600')],
    system_colors: [
      { _id: 'primary', title: 'Primary', color: design.primary },
      { _id: 'secondary', title: 'Secondary', color: design.dark },
      { _id: 'text', title: 'Text', color: design.text },
      { _id: 'accent', title: 'Accent', color: design.tint },
    ],
  };
}
