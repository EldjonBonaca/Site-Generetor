/**
 * Offline demo provider: returns placeholder copy without calling any API.
 * Useful to test the whole flow (template -> generation -> export) without keys or costs.
 */
import { AIProvider } from '../AIProvider.js';

/** Palettes, fonts and layouts the demo provider picks from (by a hash of the category name). */
const PALETTES = [
  { primary: '#1F4E79', secondary: '#F2A541', accent: '#2E8B57', heading: '#14213D', text: '#4A5568', background: '#F3F6FA', dark: '#0F1B2D' },
  { primary: '#7A2E2E', secondary: '#D9A441', accent: '#5B7553', heading: '#2B1B17', text: '#5A4E4A', background: '#FBF6EF', dark: '#24140F' },
  { primary: '#0F766E', secondary: '#F59E0B', accent: '#0EA5E9', heading: '#0B2E2B', text: '#475569', background: '#F0FAF8', dark: '#062421' },
  { primary: '#4338CA', secondary: '#F472B6', accent: '#22C55E', heading: '#1E1B4B', text: '#4B5563', background: '#F5F5FF', dark: '#151338' },
];
const FONT_PAIRS = [['Poppins', 'Open Sans'], ['Playfair Display', 'Lato'], ['Montserrat', 'Inter'], ['Oswald', 'Roboto']];

function demoTemplate(category, prompt) {
  const h = [...String(category || 'demo')].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
  const pick = (list, salt = 0) => list[(h + salt) % list.length];
  const [heading, body] = pick(FONT_PAIRS, 1);
  const english = /Texts of "copy": in English/.test(prompt);
  return {
    description: `Demo template for "${category}" (written by the offline demo provider).`,
    tone: english ? 'professional and reassuring' : 'professionale e rassicurante',
    style: { colors: pick(PALETTES), fonts: { heading, body }, headingWeight: '700', radius: pick([0, 6, 12], 2), spacing: pick(['normal', 'airy', 'compact'], 3), uppercase: h % 2 === 0 },
    layout: {
      header: pick(['classic', 'topbar', 'centered'], 4),
      hero: pick(['center', 'left', 'split'], 5),
      about: pick(['image-left', 'image-right'], 6),
      features: pick(['icons', 'cards'], 7),
      cta: pick(['banner', 'split'], 8),
      services: pick(['cards', 'boxed'], 9),
      testimonials: 'cards',
      contact: pick(['split', 'stacked'], 10),
      footer: 'dark',
      gallery: '3',
    },
    icons: ['fas fa-award', 'fas fa-clock', 'fas fa-euro-sign', 'fas fa-handshake'],
    copy: english
      ? { heroTitle: `The trusted ${category} near you`, heroText: 'Quality, punctuality and clear prices: tell us what you need.', aboutTitle: 'Who we are', featuresTitle: 'Why choose us', servicesTitle: 'Our services', reviewsTitle: 'What our customers say' }
      : { heroTitle: `${category}: qualità e affidabilità`, heroText: 'Qualità, puntualità e prezzi chiari: raccontaci di cosa hai bisogno.' },
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
    if (options.task === 'template') {
      const text = JSON.stringify(demoTemplate(options.context?.category, prompt));
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
      // Placeholder text (never echoes the template sample text)
      let base = `${subject} · ${f.label || f.id}`.slice(0, Math.max(20, f.maxLength || 120));
      while (f.minLength && base.length < f.minLength) base += ` ${subject} – placeholder text written by the demo provider.`;
      out[f.id] = f.format === 'html' ? `<p>${base}</p>` : base;
    }
    const text = JSON.stringify(out);
    return { text, usage: { inputTokens: Math.round(prompt.length / 4), outputTokens: Math.round(text.length / 4) } };
  }
}
