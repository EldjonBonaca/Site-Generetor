/**
 * Design directions: distinct visual identities a template of any category can take
 * (industrial, corporate, minimal, editorial, friendly, bold, premium, natural, technical,
 * luxury, boutique, architectural).
 *
 * When a template is generated, the system (not the AI) picks the direction and the concrete
 * design decisions, always preferring what the other templates of the same category use least,
 * and then what the templates of the other categories use least (so the first template of every
 * category does not get the same look):
 *   - the direction: one not used yet in the category (then the least used), the least used in the
 *     whole library among those;
 *   - fonts: the pair of the direction whose title font is the least used in the category, then in
 *     the library;
 *   - look (theme, buttons, cards, titles, alignment, scale, images, labels) and the layout of each
 *     section: among many random combinations allowed by the direction, the one farthest from
 *     the most similar template of the category (then the one using the rarest values).
 *   - the optional Home sections: among the ones recommended by the industry analysis of the
 *     category (industry.js), the combination the other templates use least.
 * When the category has been analyzed, only the directions that suit its industry are used.
 * The AI then designs the palette (avoiding the colors of the other templates), icons, tone of
 * voice and sample texts for the category inside that direction. Five templates of the same
 * category therefore get five different directions, font pairs, layouts and palettes.
 */
import { DEFAULT_SECTIONS, FONTS, LAYOUTS, OPTIONAL_SECTIONS, SPACINGS, STYLE_OPTIONS, WEIGHTS } from './spec.js';

/**
 * style: allowed values of STYLE_OPTIONS keys + radius [min, max], spacing, headingWeight, uppercase.
 * layout: allowed values of LAYOUTS keys (keys left out allow every value).
 */
export const DIRECTIONS = [
  {
    id: 'industrial',
    name: 'Robust industrial',
    summary: 'Dark pages, big uppercase titles, square shapes and one vivid contrast color.',
    brief: 'Strong and robust industrial look: dark pages, big uppercase condensed titles, square shapes, high contrast with one vivid accent.',
    palette: 'near-black / charcoal "dark", a strong steel or deep primary, one vivid high-visibility accent (e.g. yellow, orange, signal red) as "secondary"',
    fonts: [['Oswald', 'Roboto'], ['Bebas Neue', 'Barlow'], ['Barlow Condensed', 'Inter'], ['Archivo', 'Roboto']],
    style: { theme: ['dark'], buttons: ['square'], cards: ['accent', 'outline'], titles: ['bar'], align: ['left'], scale: ['xl', 'large'], images: ['square'], titleCase: ['upper'], kicker: ['plain', 'dash'], radius: [0, 2], spacing: ['normal', 'compact'], headingWeight: ['700', '800'], uppercase: [true] },
    layout: { header: ['topbar', 'bold'], hero: ['bottom', 'left'], about: ['image-left', 'image-right', 'badge'], features: ['cards', 'list'], cta: ['banner', 'split'], services: ['overlay', 'boxed'], testimonials: ['band', 'cards'], footer: ['dark'], divider: ['tilt', 'none'] },
  },
  {
    id: 'corporate',
    name: 'Trustworthy corporate',
    summary: 'Clean and reassuring: light pages, soft shadows, clear titles and a confident brand color.',
    brief: 'Clean, trustworthy corporate look: light pages, clear titles, soft shadows, balanced spacing, confident and modern.',
    palette: 'a confident blue, navy, teal or deep brand color as primary, a warm complementary "secondary" for buttons, a very light cool "background"',
    fonts: [['Montserrat', 'Open Sans'], ['Plus Jakarta Sans', 'Inter'], ['Poppins', 'Lato'], ['Outfit', 'Inter'], ['Source Sans 3', 'Source Sans 3']],
    style: { theme: ['light'], buttons: ['rounded', 'pill'], cards: ['shadow', 'accent', 'outline'], titles: ['line', 'plain'], align: ['center', 'left'], scale: ['normal', 'large'], images: ['rounded', 'square'], titleCase: ['normal'], kicker: ['pill', 'plain'], radius: [6, 12], spacing: ['normal'], headingWeight: ['700', '600'], uppercase: [false, true] },
    layout: { header: ['classic', 'topbar'], hero: ['center', 'left', 'split'], about: ['image-left', 'image-right', 'badge'], features: ['icons', 'cards'], cta: ['banner', 'split'], services: ['boxed', 'cards', 'list'], testimonials: ['cards', 'quote'], footer: ['dark', 'brand'], divider: ['curve', 'none'] },
  },
  {
    id: 'minimal',
    name: 'Essential minimal',
    summary: 'Lots of white space, plain left-aligned titles, thin outlines and sharp corners.',
    brief: 'Minimal Swiss-style look: lots of white space, left-aligned plain titles, thin outlines, square corners, almost monochrome with a single accent.',
    palette: 'almost monochrome: near-black "heading", a single restrained accent as primary (one hue only), "secondary" close to the primary or neutral, white-ish "background"',
    fonts: [['Manrope', 'Inter'], ['Space Grotesk', 'Inter'], ['Work Sans', 'Work Sans'], ['DM Sans', 'DM Sans'], ['Jost', 'Inter']],
    style: { theme: ['light'], buttons: ['square'], cards: ['outline'], titles: ['plain'], align: ['left'], scale: ['large'], images: ['square'], titleCase: ['normal'], kicker: ['dash', 'plain'], radius: [0, 4], spacing: ['airy'], headingWeight: ['500', '600'], uppercase: [false] },
    layout: { header: ['classic', 'centered'], hero: ['split', 'card', 'editorial'], about: ['wide', 'image-right'], features: ['list'], cta: ['split'], services: ['cards', 'list'], testimonials: ['minimal', 'quote'], contact: ['stacked', 'split'], footer: ['light'], divider: ['none'] },
  },
  {
    id: 'editorial',
    name: 'Elegant editorial',
    summary: 'Serif titles, photos with an offset frame, magazine rhythm and understated colors.',
    brief: 'Elegant editorial look: serif titles, framed photos with an offset color block, magazine rhythm, refined and calm.',
    palette: 'muted, sophisticated tones (e.g. deep green, burgundy, ink blue, warm taupe) as primary, a soft metallic or sand "secondary", warm off-white "background"',
    fonts: [['Playfair Display', 'Lato'], ['Cormorant Garamond', 'Raleway'], ['Libre Baskerville', 'Source Sans 3'], ['DM Serif Display', 'DM Sans'], ['Fraunces', 'Work Sans'], ['EB Garamond', 'Jost']],
    style: { theme: ['light'], buttons: ['square', 'rounded'], cards: ['outline', 'tinted'], titles: ['plain', 'line'], align: ['center'], scale: ['large'], images: ['framed', 'arch'], titleCase: ['normal'], kicker: ['dash'], radius: [0, 4], spacing: ['airy'], headingWeight: ['500', '600'], uppercase: [true] },
    layout: { header: ['centered'], hero: ['center', 'card', 'editorial'], about: ['image-right', 'wide', 'badge'], features: ['icons', 'list'], cta: ['banner'], services: ['cards', 'list'], testimonials: ['minimal', 'quote'], footer: ['light', 'dark'], divider: ['none'] },
  },
  {
    id: 'friendly',
    name: 'Warm and welcoming',
    summary: 'Soft shapes, pill buttons, tinted cards and wavy edges: friendly and close to people.',
    brief: 'Warm and friendly look: soft rounded shapes, pill buttons, tinted cards, wavy edges, approachable and human.',
    palette: 'warm and cheerful: a friendly primary (e.g. terracotta, coral, warm green, sunny blue) with a soft complementary "secondary" and a warm light "background"',
    fonts: [['Quicksand', 'Nunito'], ['Rubik', 'Nunito'], ['Poppins', 'Nunito'], ['Fraunces', 'Nunito']],
    style: { theme: ['light'], buttons: ['pill'], cards: ['tinted'], titles: ['line'], align: ['center'], scale: ['normal', 'large'], images: ['rounded', 'arch'], titleCase: ['normal'], kicker: ['pill'], radius: [16, 24], spacing: ['normal'], headingWeight: ['700', '800'], uppercase: [false] },
    layout: { header: ['classic', 'centered'], hero: ['split', 'center'], about: ['image-left', 'image-right', 'badge'], features: ['icons'], cta: ['split'], services: ['boxed'], testimonials: ['cards'], footer: ['brand', 'light'], divider: ['waves', 'curve'] },
  },
  {
    id: 'bold',
    name: 'Bold modern',
    summary: 'Saturated colors, huge titles, a colored header and cards over photos: energetic and contemporary.',
    brief: 'Bold contemporary look: saturated colors, huge left-aligned titles, colored header, photo cards, energetic.',
    palette: 'vivid and saturated: an intense primary (e.g. electric blue, magenta, vivid orange, emerald) and a contrasting bright "secondary"',
    fonts: [['Montserrat', 'Inter'], ['Poppins', 'DM Sans'], ['Plus Jakarta Sans', 'Inter'], ['Archivo', 'Inter'], ['Syne', 'DM Sans']],
    style: { theme: ['light'], buttons: ['pill'], cards: ['shadow'], titles: ['plain'], align: ['left'], scale: ['xl'], images: ['rounded'], titleCase: ['normal'], kicker: ['pill', 'plain'], radius: [10, 16], spacing: ['normal'], headingWeight: ['800'], uppercase: [false] },
    layout: { header: ['bold', 'classic'], hero: ['left', 'bottom', 'card'], about: ['image-left', 'wide'], features: ['cards', 'icons'], cta: ['banner'], services: ['overlay', 'boxed'], testimonials: ['band'], footer: ['brand'], divider: ['tilt', 'waves'] },
  },
  {
    id: 'premium',
    name: 'Dark premium',
    summary: 'Dark pages with golden details, refined titles, thin outlines and generous spacing.',
    brief: 'Dark premium look: dark pages with gold / champagne details, refined titles, thin outlines, generous spacing, luxurious.',
    palette: 'deep dark "dark" (black, midnight blue or dark green), a gold, champagne or copper "secondary", a rich deep primary',
    fonts: [['Cormorant Garamond', 'Montserrat'], ['Playfair Display', 'Raleway'], ['DM Serif Display', 'Inter'], ['Josefin Sans', 'Lato'], ['Cinzel', 'Jost']],
    style: { theme: ['dark'], buttons: ['square'], cards: ['outline'], titles: ['plain', 'line'], align: ['center'], scale: ['large'], images: ['framed', 'square', 'arch'], titleCase: ['normal', 'upper'], kicker: ['dash', 'plain'], radius: [0, 2], spacing: ['airy'], headingWeight: ['500', '600'], uppercase: [true] },
    layout: { header: ['centered', 'classic'], hero: ['center', 'bottom'], about: ['image-right', 'wide', 'badge'], features: ['list', 'icons'], cta: ['banner'], services: ['overlay', 'cards'], testimonials: ['minimal', 'quote'], footer: ['dark'], divider: ['none'] },
  },
  {
    id: 'natural',
    name: 'Natural and fresh',
    summary: 'Nature tones, soft serif titles, tinted cards and curved edges.',
    brief: 'Natural and fresh look: earthy, organic colors, soft serif titles, tinted cards, curved edges, calm and genuine.',
    palette: 'organic, earthy tones (e.g. sage or forest green, olive, clay, sand, sky blue) with a natural warm "secondary"',
    fonts: [['Lora', 'Open Sans'], ['Merriweather', 'Lato'], ['Bitter', 'Source Sans 3'], ['Fraunces', 'DM Sans']],
    style: { theme: ['light'], buttons: ['rounded'], cards: ['tinted'], titles: ['line'], align: ['center', 'left'], scale: ['normal'], images: ['rounded', 'arch'], titleCase: ['normal'], kicker: ['pill', 'dash'], radius: [8, 16], spacing: ['normal', 'airy'], headingWeight: ['600', '700'], uppercase: [false] },
    layout: { header: ['classic', 'topbar'], hero: ['left', 'split'], about: ['image-left', 'image-right', 'badge'], features: ['icons', 'list'], cta: ['banner', 'split'], services: ['boxed', 'cards'], testimonials: ['cards', 'quote'], footer: ['dark', 'light'], divider: ['curve', 'waves'] },
  },
  {
    id: 'technical',
    name: 'Technical geometric',
    summary: 'Sharp lines, colored bars on the titles, cards with a top border and slanted edges: precise and professional.',
    brief: 'Technical and geometric look: sharp lines, colored bars on the titles, accent-topped cards, slanted edges, precise and professional.',
    palette: 'cool technical tones (e.g. steel blue, cyan, graphite) as primary, a sharp signal "secondary" (orange, lime, yellow)',
    fonts: [['Barlow', 'Inter'], ['Space Grotesk', 'Inter'], ['Roboto Slab', 'Roboto'], ['Rubik', 'Roboto']],
    style: { theme: ['light'], buttons: ['square', 'rounded'], cards: ['accent'], titles: ['bar'], align: ['left'], scale: ['large'], images: ['square'], titleCase: ['normal', 'upper'], kicker: ['plain', 'dash'], radius: [2, 6], spacing: ['normal', 'compact'], headingWeight: ['600', '700'], uppercase: [true] },
    layout: { header: ['topbar', 'classic'], hero: ['left', 'split'], about: ['image-right', 'image-left'], features: ['cards', 'list'], cta: ['split'], services: ['boxed', 'list'], testimonials: ['cards'], footer: ['dark'], divider: ['tilt'] },
  },
  {
    id: 'luxury',
    name: 'Refined luxury',
    summary: 'Ivory pages, classic serif titles, arched photos, thin gold lines and a calm, exclusive rhythm.',
    brief: 'Refined light luxury look: ivory pages, classic high-contrast serif titles, arched or framed photos, thin gold / bronze lines, lots of air, exclusive and calm.',
    palette: 'warm ivory or cream "background", a deep elegant primary (e.g. espresso, ink, bottle green, burgundy), a gold, bronze or champagne "secondary"',
    fonts: [['Cormorant Garamond', 'Jost'], ['Marcellus', 'Jost'], ['Cinzel', 'Lato'], ['Prata', 'Tenor Sans'], ['EB Garamond', 'Jost']],
    style: { theme: ['light'], buttons: ['square'], cards: ['outline'], titles: ['plain'], align: ['center'], scale: ['large', 'xl'], images: ['arch', 'framed'], titleCase: ['normal', 'upper'], kicker: ['dash'], radius: [0, 2], spacing: ['airy'], headingWeight: ['500'], uppercase: [true] },
    layout: { header: ['centered', 'classic'], hero: ['editorial', 'center', 'split'], about: ['badge', 'image-right'], features: ['list', 'icons'], cta: ['banner'], services: ['cards', 'list'], testimonials: ['quote', 'minimal'], contact: ['split'], footer: ['dark', 'light'], divider: ['none'] },
  },
  {
    id: 'boutique',
    name: 'Soft boutique',
    summary: 'Delicate pastel tones, serif titles, arched photos, pill buttons and soft cards.',
    brief: 'Soft boutique look: delicate pastel and nude tones, gentle serif titles, arched photos, pill buttons, soft tinted cards, feminine and welcoming.',
    palette: 'soft and delicate: a dusty rose, sage, lavender, peach or nude primary (deep enough for white text), a warm soft "secondary", a very light blush or cream "background"',
    fonts: [['Fraunces', 'DM Sans'], ['Cormorant Garamond', 'Outfit'], ['Prata', 'Outfit'], ['Playfair Display', 'Jost']],
    style: { theme: ['light'], buttons: ['pill'], cards: ['tinted', 'shadow'], titles: ['plain', 'line'], align: ['center'], scale: ['large'], images: ['arch', 'rounded'], titleCase: ['normal'], kicker: ['pill'], radius: [18, 28], spacing: ['airy', 'normal'], headingWeight: ['500', '600'], uppercase: [false] },
    layout: { header: ['centered', 'classic'], hero: ['split', 'editorial'], about: ['badge', 'image-left'], features: ['icons'], cta: ['split'], services: ['cards', 'boxed'], testimonials: ['quote', 'cards'], footer: ['light', 'brand'], divider: ['waves', 'curve', 'none'] },
  },
  {
    id: 'architectural',
    name: 'Architectural',
    summary: 'Photo-led and monochrome: huge thin titles, square shapes, numbered service rows and wide photos.',
    brief: 'Architectural, photo-led look: almost monochrome, huge light titles, square shapes, wide photos, numbered service rows, precise and sophisticated.',
    palette: 'almost monochrome: graphite, stone, concrete or warm grey tones, a single refined accent (e.g. brass, terracotta, olive) as "secondary"',
    fonts: [['Syne', 'Inter'], ['Outfit', 'Inter'], ['Tenor Sans', 'Work Sans'], ['Jost', 'Jost']],
    style: { theme: ['light', 'dark'], buttons: ['square'], cards: ['outline'], titles: ['plain'], align: ['left'], scale: ['xl'], images: ['square'], titleCase: ['upper', 'normal'], kicker: ['dash'], radius: [0, 0], spacing: ['airy'], headingWeight: ['500', '600'], uppercase: [true] },
    layout: { header: ['classic', 'centered'], hero: ['bottom', 'editorial'], about: ['wide', 'badge'], features: ['list'], cta: ['split', 'banner'], services: ['list', 'overlay'], testimonials: ['quote', 'minimal'], footer: ['dark', 'light'], divider: ['none'] },
  },
];

const BY_ID = new Map(DIRECTIONS.map((d) => [d.id, d]));
export const directionById = (id) => BY_ID.get(id) || null;

/** Direction list for the UI. */
export const directionList = () => DIRECTIONS.map(({ id, name, summary }) => ({ id, name, summary }));

const pickRandom = (list, rng) => list[Math.floor(rng() * list.length) % list.length];
const countOf = (list, v) => list.filter((u) => u === v).length;

/** Among `allowed`, the values least used by `used` (ties broken at random). */
function leastUsed(allowed, used, rng) {
  const min = Math.min(...allowed.map((v) => countOf(used, v)));
  return pickRandom(allowed.filter((v) => countOf(used, v) === min), rng);
}

/**
 * Choose the direction of a new template.
 * @param {object[]} existing  specs of the other templates of the category (+ drafts to avoid)
 * @param {{ requested?: string, exclude?: string[], suitable?: string[], library?: object[], rng?: () => number }} opts
 *   suitable: directions that fit the industry, best first (industry profile of the category)
 *   library:  specs of the templates of the other categories
 */
export function pickDirection(existing, { requested, exclude = [], suitable = null, library = [], rng = Math.random } = {}) {
  if (requested && BY_ID.has(requested)) return BY_ID.get(requested);
  const used = [...existing.map((s) => s.direction).filter(Boolean), ...exclude];
  const elsewhere = library.map((s) => s.direction).filter(Boolean);
  const fitting = (suitable || []).filter((id) => BY_ID.has(id));
  const base = fitting.length ? fitting : DIRECTIONS.map((d) => d.id);
  let pool = base.filter((id) => !exclude.includes(id));
  if (!pool.length) pool = base;
  // Least used in the category, then in the whole library; then the most suitable for the industry (or at random)
  const score = (id) => countOf(used, id) * 1000 + countOf(elsewhere, id) * 100 + (fitting.length ? fitting.indexOf(id) : rng());
  return BY_ID.get(pool.reduce((a, b) => (score(b) < score(a) ? b : a)));
}

/** Natural place of each Home section, used to insert the optional ones. */
const CANONICAL_ORDER = ['highlights', 'about', 'stats', 'features', 'cta', 'services', 'process', 'gallery', 'reviews', 'faq'];

/** Home sections: the recommended order with only `optional` among the optional sections. */
function orderSections(recommended, optional) {
  const out = recommended.filter((x) => !OPTIONAL_SECTIONS.includes(x) || optional.includes(x));
  for (const x of optional) {
    if (out.includes(x)) continue;
    const pos = CANONICAL_ORDER.indexOf(x);
    const after = CANONICAL_ORDER.slice(0, pos).reverse().find((v) => out.includes(v));
    out.splice(after ? out.indexOf(after) + 1 : 0, 0, x);
  }
  return out;
}

/**
 * Optional sections of a new template: 1–3 of the recommended ones (all of them when there is no
 * analysis), the combination farthest from the templates of the category.
 */
function planSections(existing, recommended, rng) {
  const pool = recommended ? recommended.filter((x) => OPTIONAL_SECTIONS.includes(x)) : OPTIONAL_SECTIONS;
  const base = recommended || DEFAULT_SECTIONS;
  if (!pool.length) return [...base];
  const subsets = [];
  for (let mask = 1; mask < 1 << pool.length; mask++) {
    const subset = pool.filter((_, i) => mask & (1 << i));
    if (subset.length <= 3) subsets.push(subset);
  }
  const others = existing.map((s) => (s.sections || []).filter((x) => OPTIONAL_SECTIONS.includes(x)));
  const score = (subset) => {
    const distances = others.map((o) => subset.filter((x) => !o.includes(x)).length + o.filter((x) => !subset.includes(x)).length);
    const nearest = distances.length ? Math.min(...distances) : 0;
    // Then the sections the industry recommends most (first in its list), then 2 sections rather than 1 or 3
    const rank = subset.reduce((sum, x) => sum - pool.indexOf(x), 0);
    return nearest * 1000 + rank * 10 - Math.abs(subset.length - 2) * 5 + rng();
  };
  const best = subsets.reduce((a, b) => (score(b) > score(a) ? b : a));
  return orderSections(base, best);
}

/**
 * Concrete design decisions of a new template in `direction`, as different as possible from the
 * `existing` templates of the category (then from the `library` of the other categories):
 * { fonts, style: {look, radius, spacing, headingWeight, uppercase}, layout }.
 */
export function designPlan(direction, existing, rng = Math.random, profile = null, library = []) {
  const usedHeading = existing.map((s) => s.style?.fonts?.heading);
  const libHeading = library.map((s) => s.style?.fonts?.heading);
  const pairs = direction.fonts.filter(([h, b]) => FONTS.includes(h) && FONTS.includes(b));
  const fontCount = (p) => countOf(usedHeading, p[0]) * 100 + countOf(libHeading, p[0]);
  const minFonts = Math.min(...pairs.map(fontCount));
  const [heading, body] = pickRandom(pairs.filter((p) => fontCount(p) === minFonts), rng);

  // Look + layouts: best of many random combinations allowed by the direction
  const allowed = (all, own) => {
    const list = (own || all).filter((v) => all.includes(v));
    return list.length ? list : all;
  };
  const choices = [
    ...Object.entries(STYLE_OPTIONS).map(([key, values]) => ({ group: 'style', key, values: allowed(values, direction.style[key]) })),
    ...Object.entries(LAYOUTS).map(([key, values]) => ({ group: 'layout', key, values: allowed(values, direction.layout[key]) })),
  ];
  const usage = (list, ch, v) => list.filter((s) => s[ch.group]?.[ch.key] === v).length;
  // Values used by the other categories weigh less than the ones of the category (share of the library, 0..10)
  const rarityOf = (ch, v) => usage(existing, ch, v) * 10 + (library.length ? (usage(library, ch, v) / library.length) * 10 : 0);
  const score = (cand) => {
    const distances = existing.map((s) => choices.filter((ch) => s[ch.group]?.[ch.key] !== cand[ch.group][ch.key]).length);
    const nearest = distances.length ? Math.min(...distances) : choices.length;
    const rarity = choices.reduce((sum, ch) => sum - rarityOf(ch, cand[ch.group][ch.key]), 0);
    return nearest * 1000 + rarity;
  };
  let best = null;
  for (let i = 0; i < 120; i++) {
    const cand = { style: {}, layout: {} };
    for (const ch of choices) cand[ch.group][ch.key] = i === 0 ? leastUsed(ch.values, existing.map((s) => s[ch.group]?.[ch.key]), rng) : pickRandom(ch.values, rng);
    const sc = score(cand);
    if (!best || sc > best.score) best = { ...cand, score: sc };
  }
  const style = best.style;
  const [rMin, rMax] = direction.style.radius || [0, 12];
  style.radius = rMin + Math.floor(rng() * (rMax - rMin + 1));
  style.spacing = pickRandom((direction.style.spacing || SPACINGS).filter((v) => SPACINGS.includes(v)), rng);
  style.headingWeight = pickRandom((direction.style.headingWeight || WEIGHTS).filter((v) => WEIGHTS.includes(v)), rng);
  style.uppercase = pickRandom(direction.style.uppercase || [false, true], rng);

  return { fonts: { heading, body }, style, layout: best.layout, sections: planSections(existing, profile?.sections || null, rng) };
}

/** Apply the plan to the spec answered by the AI (the AI keeps palette, icons, tone and texts). */
export function applyPlan(spec, direction, plan) {
  return {
    ...spec,
    direction: direction.id,
    style: { ...spec.style, ...plan.style, fonts: plan.fonts },
    layout: { ...plan.layout },
    sections: [...plan.sections],
  };
}
