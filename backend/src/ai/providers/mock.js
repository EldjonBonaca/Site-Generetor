/**
 * Offline demo provider: returns placeholder copy without calling any API.
 * Useful to test the whole flow (template -> generation -> export) without keys or costs.
 */
import { AIProvider } from '../AIProvider.js';

/** Palettes the demo provider picks from (fonts, look and layouts are decided by the generator). */
const PALETTES = [
  { primary: '#1F4E79', secondary: '#F2A541', accent: '#2E8B57', heading: '#14213D', text: '#4A5568', background: '#F3F6FA', dark: '#0F1B2D' },
  { primary: '#7A2E2E', secondary: '#D9A441', accent: '#5B7553', heading: '#2B1B17', text: '#5A4E4A', background: '#FBF6EF', dark: '#24140F' },
  { primary: '#0F766E', secondary: '#F59E0B', accent: '#0EA5E9', heading: '#0B2E2B', text: '#475569', background: '#F0FAF8', dark: '#062421' },
  { primary: '#4338CA', secondary: '#F472B6', accent: '#22C55E', heading: '#1E1B4B', text: '#4B5563', background: '#F5F5FF', dark: '#151338' },
  { primary: '#C2410C', secondary: '#1E293B', accent: '#FACC15', heading: '#1C1917', text: '#57534E', background: '#FFF7ED', dark: '#1C1917' },
  { primary: '#3F6212', secondary: '#D97706', accent: '#0F766E', heading: '#1A2E05', text: '#4D5544', background: '#F7FAF0', dark: '#14200A' },
  { primary: '#334155', secondary: '#FACC15', accent: '#F97316', heading: '#0F172A', text: '#475569', background: '#F1F5F9', dark: '#0B0F19' },
  { primary: '#9D174D', secondary: '#FBBF24', accent: '#7C3AED', heading: '#3B0A20', text: '#5B4B52', background: '#FDF2F8', dark: '#2A0716' },
  { primary: '#0369A1', secondary: '#84CC16', accent: '#F43F5E', heading: '#0C2537', text: '#46576A', background: '#F0F8FF', dark: '#06192A' },
  { primary: '#6D28D9', secondary: '#2DD4BF', accent: '#F59E0B', heading: '#22113F', text: '#544C66', background: '#F7F3FF', dark: '#170B2E' },
  { primary: '#8C6A3F', secondary: '#1F2937', accent: '#B45309', heading: '#2A2118', text: '#5C5247', background: '#FAF6F0', dark: '#1D1712' },
  { primary: '#B91C1C', secondary: '#111827', accent: '#F59E0B', heading: '#1F1111', text: '#544848', background: '#FEF5F5', dark: '#160A0A' },
];
const TONES = { it: ['professionale e rassicurante', 'diretto e concreto', 'caldo e familiare', 'elegante e misurato', 'energico e moderno'], en: ['professional and reassuring', 'direct and practical', 'warm and friendly', 'elegant and measured', 'energetic and modern'] };

/** Hue of a color, to avoid the palettes already used in the category. */
const hue = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (!d) return -1;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
const near = (a, b) => {
  const [x, y] = [hue(a), hue(b)];
  if (x < 0 || y < 0) return x === y;
  const diff = Math.abs(x - y);
  return Math.min(diff, 360 - diff) < 30;
};

function demoTemplate(context, prompt) {
  const category = context.category || 'demo';
  const avoid = context.avoidColors || [];
  const offset = Math.floor(Math.random() * PALETTES.length);
  const rotated = PALETTES.map((_, i) => PALETTES[(i + offset) % PALETTES.length]);
  const colors = rotated.find((p) => !avoid.some((c) => near(c, p.primary))) || rotated[0];
  const english = /Texts of "copy": in English/.test(prompt);
  const tones = english ? TONES.en : TONES.it;
  return {
    description: `Demo template for "${category}", direction "${context.direction || '-'}" (written by the offline demo provider).`,
    tone: tones[Math.floor(Math.random() * tones.length)],
    style: { colors },
    icons: ['fas fa-award', 'fas fa-clock', 'fas fa-euro-sign', 'fas fa-handshake'],
    copy: english
      ? { heroTitle: `The trusted ${category} near you`, heroText: 'Quality, punctuality and clear prices: tell us what you need.', aboutTitle: 'Who we are', featuresTitle: 'Why choose us', servicesTitle: 'Our services', reviewsTitle: 'What our customers say' }
      : { heroTitle: `${category}: qualità e affidabilità`, heroText: 'Qualità, puntualità e prezzi chiari: raccontaci di cosa hai bisogno.' },
  };
}

/** Industry analysis of a category (demo): generic but complete, with optional sections and suitable directions. */
function demoProfile(context) {
  const category = context.category || 'demo';
  const h = [...category].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
  const directions = ['industrial', 'corporate', 'minimal', 'editorial', 'friendly', 'bold', 'premium', 'natural', 'technical'];
  const start = h % directions.length;
  return {
    business: `Attività del settore "${category}" (analisi scritta dal provider demo offline).`,
    audience: 'Privati e aziende della zona che cercano professionisti affidabili, con prezzi chiari e tempi certi.',
    services: ['Consulenza', 'Preventivi', 'Interventi su misura', 'Assistenza'],
    conventions: [
      'Hero con una foto reale dei lavori e una call to action per il preventivo',
      'Galleria dei lavori realizzati in evidenza',
      'Elementi di fiducia ben visibili: anni di esperienza, garanzie, recensioni',
      'Numero di telefono sempre raggiungibile',
    ],
    trust: ['Anni di esperienza', 'Garanzia sui lavori', 'Preventivo gratuito', 'Recensioni dei clienti'],
    palette: 'Colori solidi e rassicuranti; evitare toni troppo vivaci.',
    imagery: 'Foto reali di lavori, persone al lavoro e dettagli dei materiali.',
    tone: 'professionale e diretto',
    sections: ['highlights', 'about', 'stats', 'features', 'cta', 'services', 'process', 'gallery', 'reviews', 'faq'],
    directions: Array.from({ length: 5 }, (_, i) => directions[(start + i) % directions.length]),
  };
}

export default class MockProvider extends AIProvider {
  static type = 'mock';
  static label = 'Demo (offline mock)';
  static description = 'No API call: fills every field with placeholder text. For testing the workflow only.';
  static defaultModels = ['mock-1'];
  static requiresKey = false;

  async generate(prompt, options = {}) {
    await new Promise((r) => setTimeout(r, 250));
    if (!options.json) return { text: 'OK', usage: { inputTokens: 5, outputTokens: 1 } };
    if (options.task === 'industry') {
      const text = JSON.stringify(demoProfile(options.context || {}));
      return { text, usage: { inputTokens: Math.round(prompt.length / 4), outputTokens: Math.round(text.length / 4) } };
    }
    if (options.task === 'kit-analysis') {
      // Template Kit analysis (demo): roles from the titles, the section types are left to the heuristics
      const c = options.context || {};
      const text = JSON.stringify({
        kit: { industry: 'demo', summary: `Demo analysis of "${c.kit}" written by the offline demo provider.`, style: 'Style described by the offline demo provider.', tone: 'neutral' },
        templates: (c.templates || []).map((t) => ({ ref: t.ref, role: t.role || 'ignore', purpose: `Demo: ${t.title}`, sections: [] })),
      });
      return { text, usage: { inputTokens: Math.round(prompt.length / 4), outputTokens: Math.round(text.length / 4) } };
    }
    if (options.task === 'template') {
      const text = JSON.stringify(demoTemplate(options.context || {}, prompt));
      return { text, usage: { inputTokens: Math.round(prompt.length / 4), outputTokens: Math.round(text.length / 4) } };
    }

    const ctx = options.context || {};
    const subject = ctx.service_name || ctx.site_name || 'Your business';
    const out = {};
    for (const f of options.fields || []) {
      if (f.id.startsWith('_seo.')) {
        out[f.id] = f.id === '_seo.title' ? `${subject} | ${ctx.site_name || ''}`.trim() : `Discover ${subject} by ${ctx.site_name} in ${ctx.city || 'your area'}.`;
        continue;
      }
      if (f.id.startsWith('_alt.')) {
        out[f.id] = `${subject} – ${f.hint || 'image'}`;
        continue;
      }
      if (f.format === 'link') {
        // Pick the site link whose label appears in the button text / demo URL, else the home page
        const text = `${f.hint || ''} ${f.original}`.toLowerCase();
        const links = options.links || [];
        const match = links.find((l) => !/^(tel|mailto):/.test(l.url) && l.url !== '/' && text.includes(l.label.toLowerCase().split(' ')[0]));
        out[f.id] = match?.url || links.find((l) => l.url === '/')?.url || '/';
        continue;
      }
      if (f.format === 'number') {
        out[f.id] = String(10 + (f.id.length % 90));
        continue;
      }
      // Placeholder text (never echoes the template sample text)
      let base = `${subject} · ${f.label || f.id}`.slice(0, Math.max(20, f.maxLength || 120));
      while (f.minLength && base.length < f.minLength) base += ` ${subject} – placeholder text written by the demo provider.`;
      out[f.id] = f.format === 'html' ? `<p>${base}</p>` : base;
    }
    const text = JSON.stringify(out);
    return { text, usage: { inputTokens: Math.round(prompt.length / 4), outputTokens: Math.round(text.length / 4) } };
  }
}
