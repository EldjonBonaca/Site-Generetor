/**
 * Template Kit sections: what each top-level section is (hero, about, services, FAQ, team…) and
 * which ones are removed automatically, so a kit page keeps only the planned sections:
 *
 *   Home      hero · about · services · gallery · reviews (only with real reviews)
 *   About     hero · about / text + photo blocks
 *   Services  hero · services
 *   Gallery   hero · gallery
 *   Contact   hero · contact (form, details, map)
 *
 * FAQ, team, pricing, counters, blog, client logos, newsletter, CTA bands and other extras are
 * removed. The user can still change every choice in the Layout step (Sections).
 */
import { getRoot } from './analyze.js';
import { findCardGroups } from './prepare.js';
import { slugify } from '../lib/util.js';

/** Kinds detected from the widgets used in the section (strongest signal). */
const WIDGET_KINDS = [
  ['faq', /accordion|toggle|faq/],
  ['pricing', /price|pricing/],
  ['team', /team|person|member/],
  ['testimonials', /testimonial|review/],
  ['blog', /(^|-)posts|blog|archive|loop-grid|post-grid|post-list/],
  ['newsletter', /mailchimp|newsletter|subscribe/],
  ['counters', /counter|funfact|progress/],
];

/** Kinds detected from the section headings (it, en, es, fr, de, pt). */
const TEXT_KINDS = [
  ['faq', /\bfaq\b|domande frequenti|frequently asked|preguntas frecuentes|questions fréquentes|häufige fragen|perguntas frequentes/i],
  ['team', /\bteam\b|our team|il nostro team|nostro staff|our staff|nuestro equipo|notre équipe|unser team|meet (the|our)/i],
  ['pricing', /pricing|prezzi|listino|tariff|our plans|i nostri piani|precios|tarifs|preise|preços/i],
  ['testimonials', /testimonial|recensioni|dicono di noi|reviews|what (our )?(clients|customers) say|opinioni|feedback|opiniones|témoignages|bewertungen|depoimentos/i],
  ['blog', /\bblog\b|\bnews\b|ultimi articoli|latest (posts|articles|news)|noticias|actualités|neuigkeiten/i],
  ['clients', /partner|our clients|i nostri clienti|brands?\b|sponsor|trusted by|clientes|nos clients|kunden/i],
  ['newsletter', /newsletter|iscriviti|subscribe|suscríbete|abonnez/i],
  ['gallery', /galler|portfolio|i nostri lavori|our (work|projects)|progetti realizzati|galería|galerie/i],
  ['services', /servizi|services|what we (do|offer)|cosa facciamo|our solutions|le nostre soluzioni|servicios|leistungen|serviços/i],
  ['about', /chi siamo|about|who we are|la nostra storia|our story|benvenut|welcome|quiénes somos|à propos|über uns|sobre nós/i],
  ['contact', /contatt|contact|get in touch|scrivici|write to us|dove siamo|contacto|kontakt|contato/i],
];

const ALLOWED = {
  home: new Set(['hero', 'about', 'services', 'gallery', 'testimonials']),
  about: new Set(['hero', 'about', 'generic']),
  services: new Set(['hero', 'services']),
  gallery: new Set(['hero', 'gallery']),
  contact: new Set(['hero', 'contact']),
};

function inspect(el) {
  const widgets = [];
  const headings = [];
  const walk = (e) => {
    if (!e || typeof e !== 'object') return;
    if (e.elType === 'widget') {
      widgets.push(e.widgetType || '');
      const s = e.settings || {};
      const t = s.title || s.title_text || s.heading || s.ekit_heading_title || s.sub_title || '';
      if (typeof t === 'string' && t.trim()) headings.push(t.replace(/<[^>]+>/g, ' ').trim());
    }
    (e.elements || []).forEach(walk);
  };
  walk(el);
  return { widgets, headings };
}

/** Kind of a top-level section: hero | about | services | gallery | testimonials | contact | faq | team | … | generic */
export function sectionKind(el, index) {
  if (index === 0) return 'hero';
  const { widgets, headings } = inspect(el);
  for (const [kind, re] of WIDGET_KINDS) {
    const n = widgets.filter((w) => re.test(w)).length;
    // Counters often decorate an about section: only a counters band counts as "counters"
    if (n && (kind !== 'counters' || n >= 2)) return kind;
  }
  // The section title (eyebrow + heading): later headings are items (e.g. an "Our team" box in a values section)
  const text = headings.slice(0, 2).join(' · ');
  for (const [kind, re] of TEXT_KINDS) if (re.test(text)) return kind;
  if (findCardGroups([el]).length) return 'services';
  if (widgets.some((w) => /gallery|carousel|portfolio/.test(w))) return 'gallery';
  if (widgets.some((w) => /form|google_maps|contact/.test(w))) return 'contact';
  if (widgets.length && widgets.every((w) => /image|spacer|divider/.test(w)) && widgets.filter((w) => w === 'image').length >= 4) return 'clients';
  return 'generic';
}

/**
 * Sections of a kit template with their kind and the automatic choice.
 * @returns {[{ id, kind, autoRemove }]} in document order (id as used by removedSections)
 */
export function classifySections(doc, role, { hasReviews = false } = {}) {
  const allowed = ALLOWED[role];
  const list = getRoot(doc).elements.map((el, i) => ({ id: el.id || String(i), kind: sectionKind(el, i) }));
  if (!allowed) return list.map((s) => ({ ...s, autoRemove: false }));
  // Home: an untitled text section is kept as the "about" section when there is none
  const useGenericAsAbout = role === 'home' && !list.some((s) => s.kind === 'about');
  let genericKept = false;
  return list.map((s) => {
    let keep = allowed.has(s.kind);
    if (s.kind === 'testimonials') keep = keep && hasReviews; // reviews are never invented
    if (s.kind === 'generic' && useGenericAsAbout && !genericKept) keep = genericKept = true;
    return { ...s, autoRemove: !keep };
  });
}

/** Ids of the sections removed automatically. */
export const autoRemovedSections = (doc, role, opts) => classifySections(doc, role, opts).filter((s) => s.autoRemove).map((s) => s.id);

/**
 * Plugins required by a kit (Template Kit "required_plugins" / Website Kit "plugins"), except Elementor.
 * @returns {[{ name, slug, file }]}
 */
export function kitPlugins(manifest) {
  const list = manifest?.required_plugins || manifest?.plugins || [];
  const out = [];
  for (const p of Array.isArray(list) ? list : Object.values(list)) {
    const name = typeof p === 'string' ? p : p?.name || p?.title || '';
    const file = typeof p === 'object' ? String(p.file || p.plugin || '') : '';
    const slug = file.split('/')[0] || slugify(name);
    if (!slug || slug === 'elementor' || out.some((x) => x.slug === slug)) continue;
    out.push({ name: name || slug, slug, file: /^[a-z0-9._-]+\/[a-z0-9._-]+\.php$/i.test(file) ? file : '' });
  }
  return out;
}
