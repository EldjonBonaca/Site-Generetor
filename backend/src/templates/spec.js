/**
 * Template design spec: what the AI designs for a category (colors, fonts, layout variants,
 * icons, tone, sample texts). The spec is small and fully validated: builder.js turns any
 * sanitized spec into valid Elementor documents, so a template can never break a site.
 */

/** Google Fonts the templates may use (Elementor loads them by name). */
export const FONTS = [
  'Poppins', 'Montserrat', 'Inter', 'Roboto', 'Open Sans', 'Lato', 'Raleway', 'Nunito', 'Work Sans', 'DM Sans',
  'Rubik', 'Manrope', 'Barlow', 'Josefin Sans', 'Oswald', 'Source Sans 3', 'Playfair Display', 'Merriweather',
  'Libre Baskerville', 'Cormorant Garamond', 'Lora', 'Bebas Neue', 'Archivo', 'Roboto Slab', 'Bitter', 'Quicksand', 'Barlow Condensed',
  'DM Serif Display', 'Space Grotesk', 'Plus Jakarta Sans', 'Fraunces', 'Jost', 'Marcellus', 'Cinzel', 'Prata', 'Tenor Sans',
  'EB Garamond', 'Outfit', 'Syne',
];

/** Font Awesome 5 free solid icons (Elementor "fa-solid" library) for the "why choose us" boxes. */
export const ICONS = [
  'fas fa-check', 'fas fa-star', 'fas fa-bolt', 'fas fa-clock', 'fas fa-shield-alt', 'fas fa-award', 'fas fa-thumbs-up',
  'fas fa-tools', 'fas fa-wrench', 'fas fa-hammer', 'fas fa-paint-roller', 'fas fa-hard-hat', 'fas fa-leaf', 'fas fa-seedling',
  'fas fa-heart', 'fas fa-users', 'fas fa-handshake', 'fas fa-euro-sign', 'fas fa-tags', 'fas fa-truck', 'fas fa-home',
  'fas fa-building', 'fas fa-utensils', 'fas fa-car', 'fas fa-cut', 'fas fa-tooth', 'fas fa-stethoscope', 'fas fa-graduation-cap',
  'fas fa-laptop-code', 'fas fa-camera', 'fas fa-gem', 'fas fa-medal', 'fas fa-smile', 'fas fa-lightbulb', 'fas fa-cogs',
  'fas fa-dumbbell', 'fas fa-paw', 'fas fa-broom', 'fas fa-recycle', 'fas fa-solar-panel', 'fas fa-fire', 'fas fa-snowflake',
  'fas fa-water', 'fas fa-phone-alt', 'fas fa-map-marker-alt',
];

/** Layout variants of each section (the first value is the default). */
export const LAYOUTS = {
  // "transparent": over the hero / banner photos, with white links (a normal header on the pages without a photo on top)
  header: ['classic', 'centered', 'topbar', 'bold', 'transparent'],
  // "slideshow": centered text over a slideshow of the hero image and other photos
  hero: ['center', 'left', 'split', 'card', 'bottom', 'editorial', 'slideshow'],
  // "collage": a large photo with a smaller one overlapping its corner
  about: ['image-left', 'image-right', 'wide', 'badge', 'collage'],
  // "bento": the first strength large over a photo, the other three as compact cards beside it
  features: ['icons', 'cards', 'list', 'bento'],
  cta: ['banner', 'split'],
  services: ['cards', 'boxed', 'overlay', 'list'],
  testimonials: ['cards', 'minimal', 'band', 'quote'],
  contact: ['split', 'stacked'],
  footer: ['dark', 'light', 'brand'],
  gallery: ['3', '4'],
  // Bottom edge of the hero and the banners (Elementor shape dividers; "none": straight)
  divider: ['curve', 'tilt', 'waves', 'none', 'curve-asymmetrical', 'opacity-tilt', 'wave-brush', 'mountains', 'triangle', 'arrow', 'zigzag'],
  // Banner of the inner pages: title over a photo, title on a tinted band (no photo), or title beside a photo
  subheader: ['photo', 'plain', 'split'],
  // Key numbers: on a colored band, in a row under thin lines, or in cards
  stats: ['band', 'inline', 'cards'],
  // How we work: numbered cards, a horizontal timeline, or a vertical timeline beside the title
  process: ['cards', 'timeline', 'vertical'],
  // Strip of guarantees: centered on one line, or scrolling endlessly (marquee)
  highlights: ['strip', 'marquee'],
};

/**
 * Sections of the Home page after the hero, in the order chosen by the template.
 * The required ones are the core structure of the prompt and are always present; the optional ones
 * are added when they suit the category (from the industry analysis of the category):
 *   cta         call to action band
 *   stats       key numbers (years of experience, completed works…)
 *   process     how we work, in 4 steps
 *   faq         frequently asked questions (accordion)
 *   highlights  strip of 4 short guarantees (free estimate, certified staff…)
 * The About page reuses "stats" and "cta" when the template has them.
 */
export const REQUIRED_SECTIONS = ['about', 'features', 'services', 'gallery', 'reviews'];
export const OPTIONAL_SECTIONS = ['cta', 'stats', 'process', 'faq', 'highlights'];
export const DEFAULT_SECTIONS = ['about', 'features', 'cta', 'services', 'gallery', 'reviews'];

/** Order of the Home sections: known ids once each, the required ones always present. */
export function sanitizeSections(value, fallback = DEFAULT_SECTIONS) {
  const known = new Set([...REQUIRED_SECTIONS, ...OPTIONAL_SECTIONS]);
  const out = Array.isArray(value) ? [...new Set(value.map(String).filter((v) => known.has(v)))] : [...fallback];
  for (const req of REQUIRED_SECTIONS) {
    if (out.includes(req)) continue;
    // Missing required section: back to its place in the default order
    const after = DEFAULT_SECTIONS.slice(0, DEFAULT_SECTIONS.indexOf(req)).reverse().find((v) => out.includes(v));
    out.splice(after ? out.indexOf(after) + 1 : 0, 0, req);
  }
  return out;
}

/**
 * Look of the whole site (the first value is the default). Together with the layouts they make
 * templates of the same category look really different:
 *   theme      light pages, or dark pages with light text
 *   buttons    corners of the buttons
 *   cards      cards with shadow, outlined, on a tinted background, or with a colored top border
 *   titles     section titles with an accent line below, with a colored bar on the left, or plain
 *   align      alignment of the section titles
 *   scale      size of the titles
 *   images     rounded, square, framed (offset colored block behind the photo), or arch (rounded top)
 *   titleCase  normal or uppercase titles
 *   kicker     small label above the titles: plain text, a tinted pill, or with a thin line beside it
 *   fill       colored bands (key numbers, guarantees, review band, call to action, badge, footer):
 *              primary -> dark gradient, flat primary, deep dark, or a radial glow
 *   motion     entrance animation of cards and blocks: rising, slow fade, sliding from the side, zoom, or none
 *   hover      cards under the mouse: rising, a colored ring, a colored bar along the bottom, or still
 *   edges      shaped edges (the divider of the hero) only on the hero and banners, or also on the colored bands
 *   rhythm     backgrounds of the plain sections of Home and About: the one of each section layout ("fixed"),
 *              light and tinted alternating so that two neighbours never share one ("alternate"), or all
 *              on the page color with a thin line between neighbours ("lines")
 *   highlight  last word of the hero and section titles: plain, italic, in the accent color, under a
 *              marker stroke, or outlined (wrapped at runtime by a script of the header)
 *   decor      signature details of the direction: a fine grid on the tinted sections + corner brackets
 *              on the photos, a thin inset frame on the photos, a soft blob behind the photos, a drop
 *              cap on the About text, or the business name huge at the bottom of the footer
 */
export const STYLE_OPTIONS = {
  theme: ['light', 'dark'],
  buttons: ['rounded', 'pill', 'square'],
  cards: ['shadow', 'outline', 'tinted', 'accent'],
  titles: ['line', 'bar', 'plain'],
  align: ['center', 'left'],
  scale: ['normal', 'large', 'xl'],
  images: ['rounded', 'square', 'framed', 'arch'],
  titleCase: ['normal', 'upper'],
  kicker: ['plain', 'pill', 'dash'],
  fill: ['gradient', 'flat', 'deep', 'radial'],
  motion: ['rise', 'fade', 'slide', 'zoom', 'none'],
  hover: ['lift', 'glow', 'underline', 'still'],
  edges: ['hero', 'all'],
  rhythm: ['fixed', 'alternate', 'lines'],
  highlight: ['none', 'italic', 'color', 'marker', 'outline'],
  decor: ['none', 'grid', 'frame', 'blob', 'dropcap', 'wordmark'],
};

export const SPACINGS = ['normal', 'compact', 'airy'];
export const WEIGHTS = ['700', '600', '800', '500'];

export const COLOR_KEYS = ['primary', 'secondary', 'accent', 'heading', 'text', 'background', 'dark'];

/** Sample texts of the template (Italian by default). They are only a guide of tone and length: every project rewrites them. */
export const COPY_KEYS = {
  heroKicker: 60, heroTitle: 90, heroText: 220, heroButton: 30, heroButton2: 30,
  aboutKicker: 40, aboutTitle: 80, aboutText: 600, aboutButton: 30,
  featuresKicker: 40, featuresTitle: 70, featuresText: 220,
  ctaTitle: 90, ctaText: 220, ctaButton: 30,
  servicesKicker: 40, servicesTitle: 70, servicesText: 220, serviceText: 160, servicesButton: 30,
  reviewsKicker: 40, reviewsTitle: 70,
  aboutPageText: 1200, aboutPageText2: 1200,
  galleryKicker: 40, galleryTitle: 70, galleryButton: 30,
  processKicker: 40, processTitle: 70, processText: 220,
  faqKicker: 40, faqTitle: 70,
  subheaderText: 160,
  contactTitle: 70, contactText: 300, formTitle: 70,
  postCtaTitle: 80, postCtaText: 200, postCtaButton: 30,
  headerButton: 30,
};

const DEFAULT_COPY = {
  heroKicker: 'Professionisti di fiducia',
  heroTitle: 'Qualità, esperienza e cura in ogni lavoro',
  heroText: 'Un servizio completo, puntuale e trasparente: ascoltiamo le tue esigenze e ti proponiamo la soluzione migliore.',
  heroButton: 'Richiedi un preventivo',
  heroButton2: 'Chiamaci ora',
  aboutKicker: 'Chi siamo',
  aboutTitle: 'Una realtà affidabile al tuo servizio',
  aboutText: '<p>Da anni seguiamo ogni cliente con professionalità e attenzione ai dettagli, offrendo soluzioni su misura e un rapporto diretto e trasparente.</p>',
  aboutButton: 'Scopri di più',
  featuresKicker: 'I nostri punti di forza',
  featuresTitle: 'Perché sceglierci',
  featuresText: 'I motivi per cui i nostri clienti tornano da noi e ci consigliano.',
  features: [
    { title: 'Esperienza', text: 'Anni di lavoro e centinaia di clienti soddisfatti.' },
    { title: 'Puntualità', text: 'Rispettiamo tempi e appuntamenti concordati.' },
    { title: 'Prezzi chiari', text: 'Preventivi trasparenti, senza sorprese.' },
    { title: 'Assistenza', text: 'Ti seguiamo prima, durante e dopo il lavoro.' },
  ],
  ctaTitle: 'Hai bisogno di un consiglio?',
  ctaText: 'Contattaci senza impegno: ti rispondiamo in giornata.',
  ctaButton: 'Contattaci',
  servicesKicker: 'Servizi',
  servicesTitle: 'I nostri servizi',
  servicesText: 'Soluzioni complete, realizzate con cura e materiali di qualità.',
  serviceText: 'Breve descrizione del servizio, dei suoi vantaggi e di a chi si rivolge.',
  servicesButton: 'Tutti i servizi',
  reviewsKicker: 'Recensioni',
  reviewsTitle: 'Cosa dicono i nostri clienti',
  reviews: [
    { name: 'Marco Rossi', role: 'Cliente', text: 'Servizio impeccabile, personale cortese e lavoro consegnato nei tempi previsti.' },
    { name: 'Giulia Bianchi', role: 'Cliente', text: 'Professionali e disponibili: mi hanno seguita in ogni fase con grande attenzione.' },
    { name: 'Luca Verdi', role: 'Cliente', text: 'Ottimo rapporto qualità-prezzo e assistenza sempre presente anche dopo il lavoro.' },
  ],
  aboutPageText:
    '<p>Siamo una realtà nata dalla passione per il nostro lavoro e cresciuta grazie alla fiducia dei clienti: ogni giorno mettiamo esperienza e competenza al servizio di chi si rivolge a noi.</p><p>Negli anni abbiamo affrontato lavori di ogni dimensione, aggiornando continuamente competenze, strumenti e metodi.</p>',
  aboutPageText2:
    '<p>Crediamo nella qualità, nella trasparenza e nel rapporto diretto con le persone: ascoltiamo ogni richiesta e proponiamo soluzioni chiare, realizzate con cura e nei tempi concordati.</p><p>Ogni progetto è seguito da un referente unico, dal primo sopralluogo alla consegna.</p>',
  galleryKicker: 'Galleria',
  galleryTitle: 'I nostri lavori',
  galleryButton: 'Vedi tutta la galleria',
  stats: [
    { value: '20+', label: 'Anni di esperienza' },
    { value: '500+', label: 'Clienti soddisfatti' },
    { value: '24h', label: 'Tempo di risposta' },
    { value: '100%', label: 'Lavori garantiti' },
  ],
  processKicker: 'Come lavoriamo',
  processTitle: 'Il nostro metodo in 4 passi',
  processText: 'Un percorso semplice e trasparente, dalla prima richiesta alla consegna.',
  steps: [
    { title: 'Contatto', text: 'Ci racconti di cosa hai bisogno, per telefono o tramite il modulo.' },
    { title: 'Sopralluogo', text: 'Valutiamo la situazione e ti proponiamo la soluzione più adatta.' },
    { title: 'Preventivo', text: 'Ricevi un preventivo chiaro e dettagliato, senza costi nascosti.' },
    { title: 'Realizzazione', text: 'Eseguiamo il lavoro nei tempi concordati e ti seguiamo anche dopo.' },
  ],
  faqKicker: 'Domande frequenti',
  faqTitle: 'Hai qualche dubbio?',
  faq: [
    { q: 'Il preventivo è gratuito?', a: 'Sì, il preventivo è gratuito e senza impegno.' },
    { q: 'In quali zone lavorate?', a: 'Operiamo in città e nei comuni limitrofi.' },
    { q: 'Quanto tempo serve per iniziare?', a: 'Di solito fissiamo il primo appuntamento entro pochi giorni dalla richiesta.' },
    { q: 'Offrite una garanzia sui lavori?', a: 'Sì, tutti i lavori sono coperti da garanzia.' },
  ],
  highlights: ['Preventivo gratuito', 'Personale qualificato', 'Tempi certi', 'Assistenza dedicata'],
  subheaderText: 'Breve frase introduttiva della pagina.',
  contactTitle: 'Contattaci',
  contactText: 'Scrivici o chiamaci: saremo felici di rispondere a ogni domanda e di preparare un preventivo gratuito.',
  formTitle: 'Inviaci un messaggio',
  postCtaTitle: 'Ti interessa questo servizio?',
  postCtaText: 'Contattaci per una consulenza o un preventivo gratuito.',
  postCtaButton: 'Richiedi informazioni',
  headerButton: 'Contattaci',
};

export const DEFAULT_SPEC = Object.freeze({
  version: 1,
  direction: '',
  description: '',
  tone: 'professionale, cordiale e rassicurante',
  style: {
    colors: { primary: '#1F4E79', secondary: '#F2A541', accent: '#2E8B57', heading: '#14213D', text: '#4A5568', background: '#F5F7FA', dark: '#0F1B2D' },
    fonts: { heading: 'Poppins', body: 'Open Sans' },
    headingWeight: '700',
    radius: 6,
    spacing: 'normal',
    uppercase: false,
    ...Object.fromEntries(Object.entries(STYLE_OPTIONS).map(([k, v]) => [k, v[0]])),
  },
  layout: Object.fromEntries(Object.entries(LAYOUTS).map(([k, v]) => [k, v[0]])),
  sections: DEFAULT_SECTIONS,
  icons: ['fas fa-award', 'fas fa-clock', 'fas fa-euro-sign', 'fas fa-handshake'],
  copy: DEFAULT_COPY,
});

const HEX = /^#[0-9a-f]{6}$/i;
const str = (v, max, fallback) => {
  const s = typeof v === 'string' ? v.replace(/<\s*\/?\s*(script|style|iframe)[^>]*>/gi, '').trim() : '';
  return s ? s.slice(0, max) : fallback;
};
const oneOf = (v, list, fallback = list[0]) => {
  const s = String(v ?? '').trim();
  return list.find((x) => x.toLowerCase() === s.toLowerCase()) || fallback;
};
const color = (v, fallback) => {
  let s = String(v ?? '').trim();
  if (/^#[0-9a-f]{3}$/i.test(s)) s = `#${[...s.slice(1)].map((c) => c + c).join('')}`;
  return HEX.test(s) ? s.toUpperCase() : fallback;
};
const icon = (v, fallback) => {
  const s = String(v ?? '').trim().replace(/^fa-/, 'fas fa-');
  return ICONS.includes(s) ? s : ICONS.includes(`fas ${s}`) ? `fas ${s}` : fallback;
};

/**
 * Make any AI answer (or user edit) a valid spec: unknown values fall back to the defaults,
 * colors must be hex, fonts / icons / layouts come from the allowed lists, texts are trimmed.
 */
export function sanitizeSpec(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const d = DEFAULT_SPEC;
  const s = r.style || {};
  const copyIn = r.copy || {};
  const copy = {};
  for (const [key, max] of Object.entries(COPY_KEYS)) copy[key] = str(copyIn[key], max, d.copy[key]);
  const list = (arr, n, map) => Array.from({ length: n }, (_, i) => map((Array.isArray(arr) ? arr : [])[i] || {}, i));
  copy.features = list(copyIn.features, 4, (f, i) => ({ title: str(f.title, 50, d.copy.features[i].title), text: str(f.text, 160, d.copy.features[i].text) }));
  copy.reviews = list(copyIn.reviews, 3, (rv, i) => ({ name: str(rv.name, 50, d.copy.reviews[i].name), role: str(rv.role, 50, d.copy.reviews[i].role), text: str(rv.text, 300, d.copy.reviews[i].text) }));
  copy.stats = list(copyIn.stats, 4, (x, i) => ({ value: str(x.value, 12, d.copy.stats[i].value), label: str(x.label, 40, d.copy.stats[i].label) }));
  copy.steps = list(copyIn.steps, 4, (x, i) => ({ title: str(x.title, 50, d.copy.steps[i].title), text: str(x.text, 160, d.copy.steps[i].text) }));
  copy.faq = list(copyIn.faq, 4, (x, i) => ({ q: str(x.q, 120, d.copy.faq[i].q), a: str(x.a, 400, d.copy.faq[i].a) }));
  copy.highlights = list(copyIn.highlights, 4, (x, i) => str(x, 40, d.copy.highlights[i]));
  // Templates saved before the sections existed: no call to action when its layout was "none"
  const legacy = !Array.isArray(r.sections) && r.layout?.cta === 'none' ? DEFAULT_SECTIONS.filter((x) => x !== 'cta') : DEFAULT_SECTIONS;

  const fonts = s.fonts || {};
  return {
    version: 1,
    direction: /^[a-z][a-z-]{0,30}$/.test(String(r.direction ?? '')) ? r.direction : '',
    description: str(r.description, 500, ''),
    tone: str(r.tone, 300, d.tone),
    style: {
      colors: Object.fromEntries(COLOR_KEYS.map((k) => [k, color(s.colors?.[k], d.style.colors[k])])),
      fonts: { heading: oneOf(fonts.heading, FONTS, d.style.fonts.heading), body: oneOf(fonts.body, FONTS, d.style.fonts.body) },
      headingWeight: oneOf(s.headingWeight, WEIGHTS),
      radius: s.radius === undefined || s.radius === null || s.radius === '' || !Number.isFinite(Number(s.radius)) ? d.style.radius : Math.min(30, Math.max(0, Math.round(Number(s.radius)))),
      spacing: oneOf(s.spacing, SPACINGS),
      uppercase: s.uppercase === true || s.uppercase === 'true',
      ...Object.fromEntries(Object.entries(STYLE_OPTIONS).map(([k, v]) => [k, oneOf(s[k], v)])),
    },
    layout: Object.fromEntries(Object.entries(LAYOUTS).map(([k, v]) => [k, oneOf(r.layout?.[k], v)])),
    sections: sanitizeSections(r.sections, legacy),
    icons: list(r.icons, 4, (v, i) => icon(v, d.icons[i])),
    copy,
  };
}

/** Short description of the design, used in the site prompt ({{STILE_TEMPLATE}}). */
export function describeSpec(spec) {
  const { colors, fonts } = spec.style;
  const st = spec.style;
  const l = spec.layout;
  const LOOK = {
    theme: { light: 'pagine chiare', dark: 'pagine scure con testi chiari' },
    buttons: { rounded: 'pulsanti arrotondati', pill: 'pulsanti a pillola', square: 'pulsanti squadrati' },
    cards: { shadow: 'card con ombra', outline: 'card con bordo sottile', tinted: 'card su fondo colorato', accent: 'card con bordo superiore colorato' },
    titles: { line: 'titoli con linea colorata sotto', bar: 'titoli con barra colorata a sinistra', plain: 'titoli semplici' },
    scale: { normal: 'titoli di dimensione normale', large: 'titoli grandi', xl: 'titoli molto grandi' },
    images: { rounded: 'immagini con angoli arrotondati', square: 'immagini squadrate', framed: 'immagini con cornice colorata sfalsata', arch: 'immagini ad arco (bordo superiore arrotondato)' },
    kicker: { plain: 'etichette semplici sopra i titoli', pill: 'etichette a pillola sopra i titoli', dash: 'etichette con una linea sottile sopra i titoli' },
    fill: { gradient: 'fasce colorate sfumate', flat: 'fasce colorate in tinta unita', deep: 'fasce scure', radial: 'fasce colorate con sfumatura radiale' },
  };
  const optional = [spec.sections.includes('stats') && `numeri chiave ${l.stats}`, spec.sections.includes('process') && `come lavoriamo ${l.process}`].filter(Boolean);
  return [
    spec.description,
    `Aspetto: ${['theme', 'buttons', 'cards', 'titles', 'scale', 'images', 'kicker', 'fill'].map((k) => LOOK[k][st[k]]).join(', ')}, titoli allineati ${st.align === 'left' ? 'a sinistra' : 'al centro'}${st.titleCase === 'upper' ? ' e in maiuscolo' : ''}.`,
    `Colori: primario ${colors.primary}, secondario ${colors.secondary}, accento ${colors.accent}, titoli ${colors.heading}, testo ${colors.text}.`,
    `Font: ${fonts.heading} (titoli), ${fonts.body} (testi).`,
    `Layout: header ${l.header}, hero ${l.hero} (bordo inferiore ${l.divider}), banner delle pagine ${l.subheader}, chi siamo ${l.about}, perché sceglierci ${l.features}, call to action ${l.cta}, servizi ${l.services}, recensioni ${l.testimonials} (senza foto dei clienti), ${optional.map((x) => `${x}, `).join('')}contatti ${l.contact}, footer ${l.footer}.`,
    `Sezioni della Home dopo l'hero: ${describeSections(spec.sections)}.`,
    `Tono di voce: ${spec.tone}.`,
  ]
    .filter(Boolean)
    .join(' ');
}

// ---------------------------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------------------------

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (parts) => `#${parts.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

/** a -> b by t (0..1). */
export const mix = (a, b, t) => toHex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t));
/** Light tint of a color (t = share of white). */
export const tint = (hex, t) => mix(hex, '#FFFFFF', t);
export const rgba = (hex, a) => `rgba(${rgb(hex).join(',')},${a})`;

const luminance = (hex) => {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** WCAG contrast ratio of two colors (1..21). */
export const contrast = (a, b) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};
/** Move `hex` towards `to` until its contrast with `against` reaches `min`. */
const ensure = (hex, against, min, to) => {
  let out = hex;
  for (let t = 0.1; contrast(out, against) < min && t <= 1; t += 0.1) out = mix(hex, to, t);
  return out;
};

/**
 * Colors actually used to build a site: the template colors, adjusted only where they would make
 * texts unreadable (titles / text too light on white, "background" too dark, "dark" too light),
 * plus the text color that reads best on each filled color (buttons, bands).
 */
export function siteColors(colors) {
  const c = {
    ...colors,
    heading: ensure(colors.heading, '#FFFFFF', 7, '#000000'),
    text: ensure(colors.text, '#FFFFFF', 4.5, '#000000'),
    background: ensure(colors.background, '#000000', 16, '#FFFFFF'),
    dark: ensure(colors.dark, '#FFFFFF', 11, '#000000'),
  };
  const on = (bg) => (contrast(bg, '#FFFFFF') >= 3 ? '#FFFFFF' : c.dark);
  return { ...c, onPrimary: on(c.primary), onSecondary: on(c.secondary), onAccent: on(c.accent), primaryText: ensure(c.primary, '#FFFFFF', 4.5, '#000000') };
}

/** Hue (0..360) and saturation (0..1) of a color, to compare the palettes of two templates. */
export function hueSat(hex) {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { hue: Math.round(((h * 60) + 360) % 360), sat };
}

/** Do two colors look alike (same hue family, or both nearly grey)? */
export function similarColor(a, b) {
  const x = hueSat(a);
  const y = hueSat(b);
  if (x.sat < 0.15 && y.sat < 0.15) return Math.abs(luminance(a) - luminance(b)) < 0.15;
  if (x.sat < 0.15 || y.sat < 0.15) return false;
  const diff = Math.abs(x.hue - y.hue);
  return Math.min(diff, 360 - diff) < 28;
}

/** Italian names of the Home sections (site prompt, template description). */
export const SECTION_NAMES_IT = {
  about: 'Chi siamo',
  features: 'Perché sceglierci',
  cta: 'Call to action',
  services: 'I nostri servizi',
  gallery: 'Galleria a carosello',
  reviews: 'Recensioni',
  stats: 'Numeri chiave',
  process: 'Come lavoriamo (4 passi)',
  faq: 'Domande frequenti',
  highlights: 'Fascia con i punti di garanzia',
};
export const describeSections = (sections) => sections.map((x) => SECTION_NAMES_IT[x] || x).join(' · ');
