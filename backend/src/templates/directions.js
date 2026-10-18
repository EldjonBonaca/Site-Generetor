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
 *   - look (theme, buttons, cards, titles, alignment, scale, images, labels, colored bands,
 *     section backgrounds, animations, corner radius, spacing, title weight) and the layout of each
 *     section: among many random combinations allowed by the direction, the one farthest from
 *     the most similar template of the category, each decision weighted by how much it shows
 *     (DECISION_WEIGHTS: the hero counts more than the gallery columns), then the one farthest
 *     from all of them, then the one using the rarest values.
 *   - the optional Home sections: among the ones recommended by the industry analysis of the
 *     category (industry.js), the combination the other templates use least.
 * When the category has been analyzed, only the directions that suit its industry are used.
 * The AI then designs the palette (avoiding the colors of the other templates), icons, tone of
 * voice and sample texts for the category inside that direction. Five templates of the same
 * category therefore get five different directions, font pairs, layouts and palettes.
 */
import { DEFAULT_SECTIONS, FONTS, LAYOUTS, featureCount, OPTIONAL_SECTIONS, SPACINGS, STYLE_OPTIONS, WEIGHTS } from './spec.js';

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
    style: { theme: ['dark'], buttons: ['square'], cards: ['accent', 'outline'], titles: ['bar'], align: ['left'], scale: ['xl', 'large'], images: ['square'], titleCase: ['upper'], kicker: ['plain', 'dash'], radius: [0, 2], spacing: ['normal', 'compact'], headingWeight: ['700', '800'], uppercase: [true], fill: ['flat', 'deep'], motion: ['slide', 'rise'], hover: ['underline', 'lift'], edges: ['hero', 'all'], rhythm: ['alternate', 'fixed'], highlight: ['outline', 'none'], decor: ['none', 'grid'] },
    layout: { header: ['topbar', 'bold', 'transparent'], hero: ['bottom', 'left'], heroButtons: ['two', 'one'], heroHeight: ['full', 'auto'], heroPhrases: ['none', 'rotating'], about: ['image-left', 'image-right', 'badge', 'stacked'], features: ['cards', 'list', 'split'], cta: ['banner', 'split'], services: ['overlay', 'boxed'], testimonials: ['band', 'cards'], footer: ['dark'], divider: ['tilt', 'none', 'opacity-tilt', 'triangle'], subheader: ['photo', 'split'], stats: ['band', 'inline'], process: ['timeline', 'cards'], highlights: ['marquee', 'strip'] },
  },
  {
    id: 'corporate',
    name: 'Trustworthy corporate',
    summary: 'Clean and reassuring: light pages, soft shadows, clear titles and a confident brand color.',
    brief: 'Clean, trustworthy corporate look: light pages, clear titles, soft shadows, balanced spacing, confident and modern.',
    palette: 'a confident blue, navy, teal or deep brand color as primary, a warm complementary "secondary" for buttons, a very light cool "background"',
    fonts: [['Montserrat', 'Open Sans'], ['Plus Jakarta Sans', 'Inter'], ['Poppins', 'Lato'], ['Outfit', 'Inter'], ['Source Sans 3', 'Source Sans 3']],
    style: { theme: ['light'], buttons: ['rounded', 'pill'], cards: ['shadow', 'accent', 'outline'], titles: ['line', 'plain'], align: ['center', 'left'], scale: ['normal', 'large'], images: ['rounded', 'square'], titleCase: ['normal'], kicker: ['pill', 'plain'], radius: [6, 12], spacing: ['normal'], headingWeight: ['700', '600'], uppercase: [false, true], fill: ['gradient', 'radial', 'flat'], motion: ['rise', 'fade'], hover: ['lift', 'glow'], edges: ['hero'], rhythm: ['alternate', 'fixed'], highlight: ['color', 'none'], decor: ['none', 'grid'] },
    layout: { header: ['classic', 'topbar'], hero: ['center', 'left', 'split', 'slideshow'], heroButtons: ['two', 'link'], heroHeight: ['auto', 'compact', 'full'], heroPhrases: ['none', 'rotating'], about: ['image-left', 'image-right', 'badge', 'stacked', 'sandwich'], features: ['icons', 'cards', 'bento', 'split', 'center'], cta: ['banner', 'split'], services: ['boxed', 'cards', 'list'], testimonials: ['cards', 'quote'], footer: ['dark', 'brand'], divider: ['curve', 'none', 'curve-asymmetrical', 'opacity-tilt'], subheader: ['photo', 'split'], stats: ['band', 'cards'], process: ['cards', 'timeline'], highlights: ['strip'] },
  },
  {
    id: 'minimal',
    name: 'Essential minimal',
    summary: 'Lots of white space, plain left-aligned titles, thin outlines and sharp corners.',
    brief: 'Minimal Swiss-style look: lots of white space, left-aligned plain titles, thin outlines, square corners, almost monochrome with a single accent.',
    palette: 'almost monochrome: near-black "heading", a single restrained accent as primary (one hue only), "secondary" close to the primary or neutral, white-ish "background"',
    fonts: [['Manrope', 'Inter'], ['Space Grotesk', 'Inter'], ['Work Sans', 'Work Sans'], ['DM Sans', 'DM Sans'], ['Jost', 'Inter']],
    style: { theme: ['light'], buttons: ['square'], cards: ['outline'], titles: ['plain'], align: ['left'], scale: ['large'], images: ['square'], titleCase: ['normal'], kicker: ['dash', 'plain'], radius: [0, 4], spacing: ['airy'], headingWeight: ['500', '600'], uppercase: [false], fill: ['flat', 'deep'], motion: ['fade', 'none'], hover: ['still', 'underline'], edges: ['hero'], rhythm: ['lines'], highlight: ['none'], decor: ['wordmark', 'none'] },
    layout: { header: ['classic', 'centered'], hero: ['split', 'card', 'editorial'], heroButtons: ['one', 'link'], heroHeight: ['auto', 'compact'], heroPhrases: ['none'], about: ['wide', 'image-right', 'stacked'], features: ['list', 'split'], cta: ['split'], services: ['cards', 'list'], testimonials: ['minimal', 'quote'], contact: ['stacked', 'split'], footer: ['light'], divider: ['none'], subheader: ['plain', 'split'], stats: ['inline'], process: ['vertical', 'timeline'], highlights: ['strip'] },
  },
  {
    id: 'editorial',
    name: 'Elegant editorial',
    summary: 'Serif titles, photos with an offset frame, magazine rhythm and understated colors.',
    brief: 'Elegant editorial look: serif titles, framed photos with an offset color block, magazine rhythm, refined and calm.',
    palette: 'muted, sophisticated tones (e.g. deep green, burgundy, ink blue, warm taupe) as primary, a soft metallic or sand "secondary", warm off-white "background"',
    fonts: [['Playfair Display', 'Lato'], ['Cormorant Garamond', 'Raleway'], ['Libre Baskerville', 'Source Sans 3'], ['DM Serif Display', 'DM Sans'], ['Fraunces', 'Work Sans'], ['EB Garamond', 'Jost']],
    style: { theme: ['light'], buttons: ['square', 'rounded'], cards: ['outline', 'tinted'], titles: ['plain', 'line'], align: ['center'], scale: ['large'], images: ['framed', 'arch'], titleCase: ['normal'], kicker: ['dash'], radius: [0, 4], spacing: ['airy'], headingWeight: ['500', '600'], uppercase: [true], fill: ['deep', 'flat'], motion: ['fade', 'slide'], hover: ['still', 'underline'], edges: ['hero'], rhythm: ['lines', 'alternate'], highlight: ['italic'], decor: ['dropcap', 'frame'] },
    layout: { header: ['centered'], hero: ['center', 'card', 'editorial'], heroButtons: ['one', 'link'], heroHeight: ['auto', 'full'], heroPhrases: ['none'], about: ['image-right', 'wide', 'badge', 'collage', 'triptych', 'stacked', 'sandwich'], features: ['icons', 'list', 'center'], cta: ['banner'], services: ['cards', 'list'], testimonials: ['minimal', 'quote'], footer: ['light', 'dark'], divider: ['none'], subheader: ['plain', 'split', 'photo'], stats: ['inline'], process: ['vertical'], highlights: ['strip'] },
  },
  {
    id: 'friendly',
    name: 'Warm and welcoming',
    summary: 'Soft shapes, pill buttons, tinted cards and wavy edges: friendly and close to people.',
    brief: 'Warm and friendly look: soft rounded shapes, pill buttons, tinted cards, wavy edges, approachable and human.',
    palette: 'warm and cheerful: a friendly primary (e.g. terracotta, coral, warm green, sunny blue) with a soft complementary "secondary" and a warm light "background"',
    fonts: [['Quicksand', 'Nunito'], ['Rubik', 'Nunito'], ['Poppins', 'Nunito'], ['Fraunces', 'Nunito']],
    style: { theme: ['light'], buttons: ['pill'], cards: ['tinted'], titles: ['line'], align: ['center'], scale: ['normal', 'large'], images: ['rounded', 'arch'], titleCase: ['normal'], kicker: ['pill'], radius: [16, 24], spacing: ['normal'], headingWeight: ['700', '800'], uppercase: [false], fill: ['flat', 'radial', 'gradient'], motion: ['zoom', 'rise'], hover: ['lift', 'glow'], edges: ['all', 'hero'], rhythm: ['alternate', 'fixed'], highlight: ['marker', 'color'], decor: ['blob'] },
    layout: { header: ['classic', 'centered'], hero: ['split', 'center', 'slideshow'], heroButtons: ['two', 'one'], heroHeight: ['auto', 'compact'], heroPhrases: ['rotating', 'none'], about: ['image-left', 'image-right', 'badge', 'collage', 'triptych', 'sandwich'], features: ['icons', 'bento', 'center', 'split'], cta: ['split'], services: ['boxed'], testimonials: ['cards'], footer: ['brand', 'light'], divider: ['waves', 'curve', 'wave-brush', 'curve-asymmetrical'], subheader: ['photo', 'split'], stats: ['cards', 'band'], process: ['cards', 'timeline'], highlights: ['strip'] },
  },
  {
    id: 'bold',
    name: 'Bold modern',
    summary: 'Saturated colors, huge titles, a colored header and cards over photos: energetic and contemporary.',
    brief: 'Bold contemporary look: saturated colors, huge left-aligned titles, colored header, photo cards, energetic.',
    palette: 'vivid and saturated: an intense primary (e.g. electric blue, magenta, vivid orange, emerald) and a contrasting bright "secondary"',
    fonts: [['Montserrat', 'Inter'], ['Poppins', 'DM Sans'], ['Plus Jakarta Sans', 'Inter'], ['Archivo', 'Inter'], ['Syne', 'DM Sans']],
    style: { theme: ['light'], buttons: ['pill'], cards: ['shadow'], titles: ['plain'], align: ['left'], scale: ['xl'], images: ['rounded'], titleCase: ['normal'], kicker: ['pill', 'plain'], radius: [10, 16], spacing: ['normal'], headingWeight: ['800'], uppercase: [false], fill: ['gradient', 'flat', 'radial'], motion: ['slide', 'zoom'], hover: ['lift', 'glow'], edges: ['all', 'hero'], rhythm: ['alternate', 'fixed'], highlight: ['color', 'outline', 'marker'], decor: ['wordmark', 'none'] },
    layout: { header: ['bold', 'classic', 'transparent'], hero: ['left', 'bottom', 'card'], heroButtons: ['two', 'one'], heroHeight: ['full', 'auto'], heroPhrases: ['rotating', 'none'], about: ['image-left', 'wide', 'stacked'], features: ['cards', 'icons', 'bento', 'split'], cta: ['banner'], services: ['overlay', 'boxed'], testimonials: ['band'], footer: ['brand'], divider: ['tilt', 'waves', 'opacity-tilt', 'zigzag'], subheader: ['photo', 'plain'], stats: ['band', 'cards'], process: ['cards', 'timeline'], highlights: ['marquee', 'strip'] },
  },
  {
    id: 'premium',
    name: 'Dark premium',
    summary: 'Dark pages with golden details, refined titles, thin outlines and generous spacing.',
    brief: 'Dark premium look: dark pages with gold / champagne details, refined titles, thin outlines, generous spacing, luxurious.',
    palette: 'deep dark "dark" (black, midnight blue or dark green), a gold, champagne or copper "secondary", a rich deep primary',
    fonts: [['Cormorant Garamond', 'Montserrat'], ['Playfair Display', 'Raleway'], ['DM Serif Display', 'Inter'], ['Josefin Sans', 'Lato'], ['Cinzel', 'Jost']],
    style: { theme: ['dark'], buttons: ['square'], cards: ['outline'], titles: ['plain', 'line'], align: ['center'], scale: ['large'], images: ['framed', 'square', 'arch'], titleCase: ['normal', 'upper'], kicker: ['dash', 'plain'], radius: [0, 2], spacing: ['airy'], headingWeight: ['500', '600'], uppercase: [true], fill: ['deep', 'radial'], motion: ['fade'], hover: ['glow', 'still'], edges: ['hero'], rhythm: ['lines', 'alternate'], highlight: ['italic', 'none'], decor: ['frame', 'none'] },
    layout: { header: ['centered', 'classic', 'transparent'], hero: ['center', 'bottom', 'slideshow'], heroButtons: ['one', 'link'], heroHeight: ['full', 'auto'], heroPhrases: ['none'], about: ['image-right', 'wide', 'badge', 'triptych'], features: ['list', 'icons', 'center'], cta: ['banner'], services: ['overlay', 'cards'], testimonials: ['minimal', 'quote'], footer: ['dark'], divider: ['none'], subheader: ['photo', 'plain'], stats: ['inline', 'band'], process: ['vertical', 'timeline'], highlights: ['strip'] },
  },
  {
    id: 'natural',
    name: 'Natural and fresh',
    summary: 'Nature tones, soft serif titles, tinted cards and curved edges.',
    brief: 'Natural and fresh look: earthy, organic colors, soft serif titles, tinted cards, curved edges, calm and genuine.',
    palette: 'organic, earthy tones (e.g. sage or forest green, olive, clay, sand, sky blue) with a natural warm "secondary"',
    fonts: [['Lora', 'Open Sans'], ['Merriweather', 'Lato'], ['Bitter', 'Source Sans 3'], ['Fraunces', 'DM Sans']],
    style: { theme: ['light'], buttons: ['rounded'], cards: ['tinted'], titles: ['line'], align: ['center', 'left'], scale: ['normal'], images: ['rounded', 'arch'], titleCase: ['normal'], kicker: ['pill', 'dash'], radius: [8, 16], spacing: ['normal', 'airy'], headingWeight: ['600', '700'], uppercase: [false], fill: ['flat', 'gradient'], motion: ['rise', 'fade'], hover: ['lift', 'still'], edges: ['all', 'hero'], rhythm: ['alternate', 'fixed'], highlight: ['color', 'italic'], decor: ['blob', 'dropcap'] },
    layout: { header: ['classic', 'topbar', 'transparent'], hero: ['left', 'split', 'slideshow'], heroButtons: ['two', 'link', 'one'], heroHeight: ['auto', 'full'], heroPhrases: ['none', 'rotating'], about: ['image-left', 'image-right', 'badge', 'collage', 'triptych', 'sandwich'], features: ['icons', 'list', 'split', 'center'], cta: ['banner', 'split'], services: ['boxed', 'cards'], testimonials: ['cards', 'quote'], footer: ['dark', 'light'], divider: ['curve', 'waves', 'mountains', 'wave-brush'], subheader: ['photo', 'split'], stats: ['cards', 'band'], process: ['timeline', 'cards'], highlights: ['strip'] },
  },
  {
    id: 'technical',
    name: 'Technical geometric',
    summary: 'Sharp lines, colored bars on the titles, cards with a top border and slanted edges: precise and professional.',
    brief: 'Technical and geometric look: sharp lines, colored bars on the titles, accent-topped cards, slanted edges, precise and professional.',
    palette: 'cool technical tones (e.g. steel blue, cyan, graphite) as primary, a sharp signal "secondary" (orange, lime, yellow)',
    fonts: [['Barlow', 'Inter'], ['Space Grotesk', 'Inter'], ['Roboto Slab', 'Roboto'], ['Rubik', 'Roboto']],
    style: { theme: ['light'], buttons: ['square', 'rounded'], cards: ['accent'], titles: ['bar'], align: ['left'], scale: ['large'], images: ['square'], titleCase: ['normal', 'upper'], kicker: ['plain', 'dash'], radius: [2, 6], spacing: ['normal', 'compact'], headingWeight: ['600', '700'], uppercase: [true], fill: ['flat', 'deep', 'gradient'], motion: ['slide', 'rise'], hover: ['underline', 'glow'], edges: ['hero', 'all'], rhythm: ['lines', 'alternate'], highlight: ['none', 'color'], decor: ['grid'] },
    layout: { header: ['topbar', 'classic'], hero: ['left', 'split'], heroButtons: ['two', 'one'], heroHeight: ['auto', 'compact'], heroPhrases: ['none', 'rotating'], about: ['image-right', 'image-left', 'stacked', 'sandwich'], features: ['cards', 'list', 'bento', 'split'], cta: ['split'], services: ['boxed', 'list'], testimonials: ['cards'], footer: ['dark'], divider: ['tilt', 'triangle', 'arrow'], subheader: ['split', 'photo'], stats: ['inline', 'band'], process: ['timeline', 'cards'], highlights: ['strip', 'marquee'] },
  },
  {
    id: 'luxury',
    name: 'Refined luxury',
    summary: 'Ivory pages, classic serif titles, arched photos, thin gold lines and a calm, exclusive rhythm.',
    brief: 'Refined light luxury look: ivory pages, classic high-contrast serif titles, arched or framed photos, thin gold / bronze lines, lots of air, exclusive and calm.',
    palette: 'warm ivory or cream "background", a deep elegant primary (e.g. espresso, ink, bottle green, burgundy), a gold, bronze or champagne "secondary"',
    fonts: [['Cormorant Garamond', 'Jost'], ['Marcellus', 'Jost'], ['Cinzel', 'Lato'], ['Prata', 'Tenor Sans'], ['EB Garamond', 'Jost']],
    style: { theme: ['light'], buttons: ['square'], cards: ['outline'], titles: ['plain'], align: ['center'], scale: ['large', 'xl'], images: ['arch', 'framed'], titleCase: ['normal', 'upper'], kicker: ['dash'], radius: [0, 2], spacing: ['airy'], headingWeight: ['500'], uppercase: [true], fill: ['deep', 'flat'], motion: ['fade', 'none'], hover: ['still', 'glow'], edges: ['hero'], rhythm: ['lines', 'alternate'], highlight: ['italic'], decor: ['frame', 'dropcap'] },
    layout: { header: ['centered', 'classic', 'transparent'], hero: ['editorial', 'center', 'split', 'slideshow'], heroButtons: ['one', 'link'], heroHeight: ['full', 'auto'], heroPhrases: ['none'], about: ['badge', 'image-right', 'collage', 'triptych'], features: ['list', 'icons', 'center'], cta: ['banner'], services: ['cards', 'list'], testimonials: ['quote', 'minimal'], contact: ['split'], footer: ['dark', 'light'], divider: ['none'], subheader: ['plain', 'photo'], stats: ['inline'], process: ['vertical'], highlights: ['strip'] },
  },
  {
    id: 'boutique',
    name: 'Soft boutique',
    summary: 'Delicate pastel tones, serif titles, arched photos, pill buttons and soft cards.',
    brief: 'Soft boutique look: delicate pastel and nude tones, gentle serif titles, arched photos, pill buttons, soft tinted cards, feminine and welcoming.',
    palette: 'soft and delicate: a dusty rose, sage, lavender, peach or nude primary (deep enough for white text), a warm soft "secondary", a very light blush or cream "background"',
    fonts: [['Fraunces', 'DM Sans'], ['Cormorant Garamond', 'Outfit'], ['Prata', 'Outfit'], ['Playfair Display', 'Jost']],
    style: { theme: ['light'], buttons: ['pill'], cards: ['tinted', 'shadow'], titles: ['plain', 'line'], align: ['center'], scale: ['large'], images: ['arch', 'rounded'], titleCase: ['normal'], kicker: ['pill'], radius: [18, 28], spacing: ['airy', 'normal'], headingWeight: ['500', '600'], uppercase: [false], fill: ['flat', 'radial'], motion: ['fade', 'zoom'], hover: ['glow', 'lift'], edges: ['all', 'hero'], rhythm: ['alternate', 'fixed'], highlight: ['italic', 'marker'], decor: ['blob', 'frame'] },
    layout: { header: ['centered', 'classic'], hero: ['split', 'editorial', 'slideshow'], heroButtons: ['one', 'link'], heroHeight: ['auto', 'full'], heroPhrases: ['none'], about: ['badge', 'image-left', 'collage', 'triptych', 'sandwich'], features: ['icons', 'center', 'split'], cta: ['split'], services: ['cards', 'boxed'], testimonials: ['quote', 'cards'], footer: ['light', 'brand'], divider: ['waves', 'curve', 'none', 'wave-brush'], subheader: ['split', 'photo'], stats: ['cards', 'inline'], process: ['vertical', 'cards'], highlights: ['strip'] },
  },
  {
    id: 'architectural',
    name: 'Architectural',
    summary: 'Photo-led and monochrome: huge thin titles, square shapes, numbered service rows and wide photos.',
    brief: 'Architectural, photo-led look: almost monochrome, huge light titles, square shapes, wide photos, numbered service rows, precise and sophisticated.',
    palette: 'almost monochrome: graphite, stone, concrete or warm grey tones, a single refined accent (e.g. brass, terracotta, olive) as "secondary"',
    fonts: [['Syne', 'Inter'], ['Outfit', 'Inter'], ['Tenor Sans', 'Work Sans'], ['Jost', 'Jost']],
    style: { theme: ['light', 'dark'], buttons: ['square'], cards: ['outline'], titles: ['plain'], align: ['left'], scale: ['xl'], images: ['square'], titleCase: ['upper', 'normal'], kicker: ['dash'], radius: [0, 0], spacing: ['airy'], headingWeight: ['500', '600'], uppercase: [true], fill: ['deep', 'flat'], motion: ['none', 'slide'], hover: ['still', 'underline'], edges: ['hero'], rhythm: ['lines'], highlight: ['none', 'outline'], decor: ['wordmark'] },
    layout: { header: ['classic', 'centered', 'transparent'], hero: ['bottom', 'editorial'], heroButtons: ['one', 'link'], heroHeight: ['full', 'auto'], heroPhrases: ['none'], about: ['wide', 'badge', 'stacked', 'triptych'], features: ['list', 'split'], cta: ['split', 'banner'], services: ['list', 'overlay'], testimonials: ['quote', 'minimal'], footer: ['dark', 'light'], divider: ['none'], subheader: ['plain', 'split'], stats: ['inline'], process: ['vertical', 'timeline'], highlights: ['strip'] },
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
  if (!pool.length) return varyOrder([...base], existing);
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
  return varyOrder(orderSections(base, best), existing);
}

const swap = (list, a, b) => {
  const [i, j] = [list.indexOf(a), list.indexOf(b)];
  if (i < 0 || j < 0) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
};
const moveBefore = (list, a, b) => {
  const [i, j] = [list.indexOf(a), list.indexOf(b)];
  if (i < 0 || j < 0 || i < j) return list;
  const out = list.filter((x) => x !== a);
  out.splice(out.indexOf(b), 0, a);
  return out;
};
/**
 * Variants of the order of the Home sections, all common on the websites of small businesses: the
 * recommended order, "why choose us" before "about", reviews before the gallery, the services
 * right after the hero, or the first two together.
 */
const ORDER_VARIANTS = [
  (s) => s,
  (s) => swap(s, 'about', 'features'),
  (s) => swap(s, 'gallery', 'reviews'),
  (s) => moveBefore(s, 'services', 'about'),
  (s) => swap(swap(s, 'about', 'features'), 'gallery', 'reviews'),
];
/** Sections whose place differs, among the sections both orders have. */
function orderDistance(a, b) {
  const common = a.filter((x) => b.includes(x));
  const other = b.filter((x) => common.includes(x));
  return common.filter((x, i) => other[i] !== x).length;
}
/**
 * Order of the Home sections: among the variants of the recommended order, the one whose order
 * differs most from the most similar template of the category (the recommended order when they
 * tie, so the first template of a category follows the industry analysis).
 */
function varyOrder(order, existing) {
  const orders = existing.map((s) => s.sections || []);
  let best = order;
  let bestScore = -1;
  for (const variant of ORDER_VARIANTS) {
    const candidate = variant(order);
    const sc = orders.length ? Math.min(...orders.map((o) => orderDistance(candidate, o))) : 0;
    if (sc > bestScore) [best, bestScore] = [candidate, sc];
  }
  return best;
}

/**
 * Weight of each design decision when two templates are compared: what is seen first and on every
 * page (theme, hero, header, page banners, colored bands, section backgrounds) counts more than the
 * details (gallery columns, label style, animations).
 */
export const DECISION_WEIGHTS = {
  style: { theme: 3, fill: 2, rhythm: 2, cards: 1.5, images: 1.5, highlight: 1.5, decor: 1.5, scale: 1, titles: 1, align: 1, buttons: 1, titleCase: 1, spacing: 1, kicker: 0.6, motion: 0.6, hover: 0.6, edges: 0.6, headingWeight: 0.5, uppercase: 0.4 },
  layout: { hero: 3, heroButtons: 1, heroHeight: 1.5, heroPhrases: 1, header: 2, subheader: 2, services: 2, about: 1.5, features: 1.5, featureCount: 1, testimonials: 1.5, footer: 1, divider: 1, cta: 1, stats: 1, process: 1, highlights: 0.8, contact: 0.7, gallery: 0.2 },
};
/** Layouts of optional Home sections: they only make two templates differ when both have the section. */
const OPTIONAL_LAYOUTS = ['cta', 'stats', 'process', 'highlights'];
/** Weight of a corner radius difference (full weight from 8px apart). */
const RADIUS_WEIGHT = 0.5;

/**
 * Concrete design decisions of a new template in `direction`, as different as possible from the
 * `existing` templates of the category (then from the `library` of the other categories):
 * { fonts, style: {look, radius, spacing, headingWeight, uppercase}, layout, sections }.
 * The Home sections are chosen first, so that the layouts of optional sections only count when
 * both templates show them; then, among many random combinations allowed by the direction, the one
 * whose weighted distance (DECISION_WEIGHTS) to the most similar template of the category is the
 * largest, then far from all of them, then made of the values used least.
 */
export function designPlan(direction, existing, rng = Math.random, profile = null, library = []) {
  const usedHeading = existing.map((s) => s.style?.fonts?.heading);
  const libHeading = library.map((s) => s.style?.fonts?.heading);
  const pairs = direction.fonts.filter(([h, b]) => FONTS.includes(h) && FONTS.includes(b));
  const fontCount = (p) => countOf(usedHeading, p[0]) * 100 + countOf(libHeading, p[0]);
  const minFonts = Math.min(...pairs.map(fontCount));
  const [heading, body] = pickRandom(pairs.filter((p) => fontCount(p) === minFonts), rng);
  const sections = planSections(existing, profile?.sections || null, rng);

  // Look + layouts (+ spacing, title weight, uppercase): best of many random combinations allowed by the direction
  const allowed = (all, own) => {
    const list = (own || all).filter((v) => all.includes(v));
    return list.length ? list : all;
  };
  const choices = [
    ...Object.entries(STYLE_OPTIONS).map(([key, values]) => ({ group: 'style', key, values: allowed(values, direction.style[key]) })),
    { group: 'style', key: 'spacing', values: allowed(SPACINGS, direction.style.spacing) },
    { group: 'style', key: 'headingWeight', values: allowed(WEIGHTS, direction.style.headingWeight) },
    { group: 'style', key: 'uppercase', values: allowed([false, true], direction.style.uppercase) },
    ...Object.entries(LAYOUTS).map(([key, values]) => ({ group: 'layout', key, values: allowed(values, direction.layout[key]) })),
  ].map((ch) => ({ ...ch, weight: DECISION_WEIGHTS[ch.group][ch.key] ?? 1 }));
  const [rMin, rMax] = direction.style.radius || [0, 12];

  const weightFor = (ch, other) => (ch.group === 'layout' && OPTIONAL_LAYOUTS.includes(ch.key) && !(sections.includes(ch.key) && (other.sections || []).includes(ch.key)) ? 0 : ch.weight);
  const distance = (cand, other) =>
    choices.reduce((sum, ch) => sum + (other[ch.group]?.[ch.key] !== cand[ch.group][ch.key] ? weightFor(ch, other) : 0), 0) +
    RADIUS_WEIGHT * Math.min(1, Math.abs((other.style?.radius ?? cand.radius) - cand.radius) / 8);
  const usage = (list, ch, v) => list.filter((s) => s[ch.group]?.[ch.key] === v).length;
  // Values used by the other categories weigh less than the ones of the category (share of the library, 0..10)
  const rarityOf = (ch, v) => usage(existing, ch, v) * 10 + (library.length ? (usage(library, ch, v) / library.length) * 10 : 0);
  const score = (cand) => {
    const distances = existing.map((s) => distance(cand, s));
    const nearest = distances.length ? Math.min(...distances) : 0;
    const mean = distances.length ? distances.reduce((a, b) => a + b, 0) / distances.length : 0;
    const rarity = choices.reduce((sum, ch) => sum - ch.weight * rarityOf(ch, cand[ch.group][ch.key]), 0);
    return nearest * 1000 + mean * 20 + rarity;
  };
  let best = null;
  for (let i = 0; i < 400; i++) {
    const cand = { style: {}, layout: {}, radius: rMin + Math.floor(rng() * (rMax - rMin + 1)) };
    for (const ch of choices) cand[ch.group][ch.key] = i === 0 ? leastUsed(ch.values, existing.map((s) => s[ch.group]?.[ch.key]), rng) : pickRandom(ch.values, rng);
    // The count of strengths the chosen "why choose us" layout really shows (as sanitizeSpec saves it)
    cand.layout.featureCount = String(featureCount(cand.layout));
    const sc = score(cand);
    if (!best || sc > best.score) best = { ...cand, score: sc };
  }
  return { fonts: { heading, body }, style: { ...best.style, radius: best.radius }, layout: best.layout, sections };
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
