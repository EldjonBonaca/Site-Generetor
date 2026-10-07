/**
 * Offline demo provider: returns placeholder copy without calling any API.
 * Useful to test the whole flow (kit -> generation -> export) without keys or costs.
 */
import { AIProvider } from '../AIProvider.js';

export default class MockProvider extends AIProvider {
  static type = 'mock';
  static label = 'Demo (offline mock)';
  static description = 'No API call: fills every field with placeholder text. For testing the workflow only.';
  static defaultModels = ['mock-1'];
  static requiresKey = false;

  async generate(prompt, options = {}) {
    await new Promise((r) => setTimeout(r, 250));
    if (!options.json) return { text: 'OK', usage: { inputTokens: 5, outputTokens: 1 } };

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
      // Placeholder text (never echoes the demo text, which may contain demo contacts)
      let base = `${subject} · ${f.label || f.id}`.slice(0, Math.max(20, f.maxLength || 120));
      while (f.minLength && base.length < f.minLength) base += ` ${subject} – placeholder text written by the demo provider.`;
      out[f.id] = f.format === 'html' ? `<p>${base}</p>` : base;
    }
    const text = JSON.stringify(out);
    return { text, usage: { inputTokens: Math.round(prompt.length / 4), outputTokens: Math.round(text.length / 4) } };
  }
}
