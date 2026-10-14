/**
 * Template design spec: what the AI designs for a category (colors, fonts, layout variants,
 * icons, tone, sample texts). The spec is small and fully validated: builder.js turns any
 * sanitized spec into valid Elementor documents, so a template can never break a site.
 */

/** Google Fonts the templates may use (Elementor loads them by name). */
export const FONTS = [
  'Poppins', 'Montserrat', 'Inter', 'Roboto', 'Open Sans', 'Lato', 'Raleway', 'Nunito', 'Work Sans', 'DM Sans',
  'Rubik', 'Manrope', 'Barlow', 'Josefin Sans', 'Oswald', 'Source Sans 3', 'Playfair Display', 'Merriweather',
  'Libre Baskerville', 'Cormorant Garamond', 'Lora',
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
  header: ['classic', 'centered', 'topbar'],
  hero: ['center', 'left', 'split'],
  about: ['image-left', 'image-right'],
  features: ['icons', 'cards'],
  cta: ['banner', 'split', 'none'],
  services: ['cards', 'boxed'],
  testimonials: ['cards', 'minimal'],
  contact: ['split', 'stacked'],
  footer: ['dark', 'light'],
  gallery: ['3', '4'],
};

export const SPACINGS = ['normal', 'compact', 'airy'];
export const WEIGHTS = ['700', '600', '800', '500'];

export const COLOR_KEYS = ['primary', 'secondary', 'accent', 'heading', 'text', 'background', 'dark'];

/** Sample texts of the template (Italian by default). They are only a guide of tone and length: every project rewrites them. */
export const COPY_KEYS = {
  heroKicker: 60, heroTitle: 90, heroText: 220, heroButton: 30, heroButton2: 30,
  aboutKicker: 40, aboutTitle: 80, aboutText: 600, aboutButton: 30,
  featuresTitle: 70, featuresText: 220,
  ctaTitle: 90, ctaText: 220, ctaButton: 30,
  servicesKicker: 40, servicesTitle: 70, servicesText: 220, serviceText: 160, servicesButton: 30,
  reviewsTitle: 70,
  storyTitle: 80, storyText: 900, missionTitle: 80, missionText: 700,
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
  reviewsTitle: 'Cosa dicono i nostri clienti',
  reviews: [
    { name: 'Marco Rossi', role: 'Cliente', text: 'Servizio impeccabile, personale cortese e lavoro consegnato nei tempi previsti.' },
    { name: 'Giulia Bianchi', role: 'Cliente', text: 'Professionali e disponibili: mi hanno seguita in ogni fase con grande attenzione.' },
    { name: 'Luca Verdi', role: 'Cliente', text: 'Ottimo rapporto qualità-prezzo e assistenza sempre presente anche dopo il lavoro.' },
  ],
  storyTitle: 'La nostra storia',
  storyText: '<p>Racconto della nascita dell’attività, dell’esperienza maturata e dei valori che guidano il lavoro di ogni giorno.</p>',
  missionTitle: 'Missione e valori',
  missionText: '<p>Qualità, trasparenza e attenzione al cliente: ecco cosa ci impegniamo a garantire in ogni progetto.</p>',
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
  description: '',
  tone: 'professionale, cordiale e rassicurante',
  style: {
    colors: { primary: '#1F4E79', secondary: '#F2A541', accent: '#2E8B57', heading: '#14213D', text: '#4A5568', background: '#F5F7FA', dark: '#0F1B2D' },
    fonts: { heading: 'Poppins', body: 'Open Sans' },
    headingWeight: '700',
    radius: 6,
    spacing: 'normal',
    uppercase: false,
  },
  layout: Object.fromEntries(Object.entries(LAYOUTS).map(([k, v]) => [k, v[0]])),
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

  const fonts = s.fonts || {};
  return {
    version: 1,
    description: str(r.description, 500, ''),
    tone: str(r.tone, 300, d.tone),
    style: {
      colors: Object.fromEntries(COLOR_KEYS.map((k) => [k, color(s.colors?.[k], d.style.colors[k])])),
      fonts: { heading: oneOf(fonts.heading, FONTS, d.style.fonts.heading), body: oneOf(fonts.body, FONTS, d.style.fonts.body) },
      headingWeight: oneOf(s.headingWeight, WEIGHTS),
      radius: Math.min(30, Math.max(0, Math.round(Number(s.radius)) || 0)),
      spacing: oneOf(s.spacing, SPACINGS),
      uppercase: s.uppercase === true || s.uppercase === 'true',
    },
    layout: Object.fromEntries(Object.entries(LAYOUTS).map(([k, v]) => [k, oneOf(r.layout?.[k], v)])),
    icons: list(r.icons, 4, (v, i) => icon(v, d.icons[i])),
    copy,
  };
}

/** Short description of the design, used in the site prompt ({{STILE_TEMPLATE}}). */
export function describeSpec(spec) {
  const { colors, fonts } = spec.style;
  const l = spec.layout;
  return [
    spec.description,
    `Colori: primario ${colors.primary}, secondario ${colors.secondary}, accento ${colors.accent}, titoli ${colors.heading}, testo ${colors.text}.`,
    `Font: ${fonts.heading} (titoli), ${fonts.body} (testi).`,
    `Layout: header ${l.header}, hero ${l.hero}, chi siamo ${l.about}, perché sceglierci ${l.features}, call to action ${l.cta}, servizi ${l.services}, recensioni ${l.testimonials}, contatti ${l.contact}, footer ${l.footer}.`,
    `Tono di voce: ${spec.tone}.`,
  ]
    .filter(Boolean)
    .join(' ');
}
