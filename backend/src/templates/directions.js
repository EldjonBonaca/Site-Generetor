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
import { DEFAULT_SECTIONS, DEFAULT_SPEC, FONTS, LAYOUTS, featureCount, OPTIONAL_SECTIONS, SPACINGS, STYLE_OPTIONS, WEIGHTS, similarColor } from './spec.js';
import { change, colorAmount, effective, firstScreen, homeShape, repeatedBlocks, shapeDistance } from './similarity.js';

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
    style: { theme: ['dark'], buttons: ['square'], cards: ['accent', 'outline'], titles: ['bar'], align: ['left'], scale: ['xl', 'large'], images: ['square'], titleCase: ['upper'], kicker: ['plain', 'dash'], radius: [0, 2], spacing: ['normal', 'compact'], headingWeight: ['700', '800'], uppercase: [true], fill: ['flat', 'deep'], motion: ['slide', 'rise'], hover: ['underline', 'lift'], edges: ['hero', 'all'], rhythm: ['alternate', 'fixed'], highlight: ['outline', 'none'], decor: ['none', 'grid', 'lines'], photoTone: ['natural', 'mono'], photoRatio: ['wide', 'standard'], signature: ['numbers', 'vertical', 'stamp'] },
    layout: { header: ['topbar', 'bold', 'transparent'], hero: ['bottom', 'left', 'color'], heroButtons: ['two', 'one'], heroHeight: ['full', 'auto'], heroPhrases: ['none', 'rotating'], about: ['image-left', 'image-right', 'badge', 'stacked'], features: ['cards', 'list', 'split'], cta: ['banner', 'split', 'phone'], services: ['overlay', 'boxed'], testimonials: ['band', 'cards', 'side'], homeGallery: ['strip', 'mosaic', 'carousel'], footer: ['dark'], footerCta: ['none', 'large'], divider: ['tilt', 'none', 'opacity-tilt', 'triangle'], subheader: ['photo', 'split'], stats: ['band', 'inline'], process: ['timeline', 'cards'], highlights: ['marquee', 'strip'] },
  },
  {
    id: 'corporate',
    name: 'Trustworthy corporate',
    summary: 'Clean and reassuring: light pages, soft shadows, clear titles and a confident brand color.',
    brief: 'Clean, trustworthy corporate look: light pages, clear titles, soft shadows, balanced spacing, confident and modern.',
    palette: 'a confident blue, navy, teal or deep brand color as primary, a warm complementary "secondary" for buttons, a very light cool "background"',
    fonts: [['Montserrat', 'Open Sans'], ['Plus Jakarta Sans', 'Inter'], ['Poppins', 'Lato'], ['Outfit', 'Inter'], ['Source Sans 3', 'Source Sans 3']],
    style: { theme: ['light'], buttons: ['rounded', 'pill'], cards: ['shadow', 'accent', 'outline'], titles: ['line', 'plain'], align: ['center', 'left'], scale: ['normal', 'large'], images: ['rounded', 'square'], titleCase: ['normal'], kicker: ['pill', 'plain'], radius: [6, 12], spacing: ['normal'], headingWeight: ['700', '600'], uppercase: [false, true], fill: ['gradient', 'radial', 'flat'], motion: ['rise', 'fade'], hover: ['lift', 'glow'], edges: ['hero'], rhythm: ['alternate', 'fixed'], highlight: ['color', 'none'], decor: ['none', 'grid'], photoTone: ['natural'], photoRatio: ['standard', 'wide'], signature: ['numbers', 'none'] },
    layout: { header: ['classic', 'topbar'], hero: ['center', 'left', 'split', 'slideshow', 'color'], heroButtons: ['two', 'link'], heroHeight: ['auto', 'compact', 'full'], heroPhrases: ['none', 'rotating'], about: ['image-left', 'image-right', 'badge', 'stacked', 'sandwich'], features: ['icons', 'cards', 'bento', 'split', 'center'], cta: ['banner', 'split', 'photo-split', 'phone'], services: ['boxed', 'cards', 'list'], testimonials: ['cards', 'quote', 'side'], homeGallery: ['carousel', 'masonry', 'mosaic'], footer: ['dark', 'brand'], footerCta: ['none', 'large'], divider: ['curve', 'none', 'curve-asymmetrical', 'opacity-tilt'], subheader: ['photo', 'split'], stats: ['band', 'cards'], process: ['cards', 'timeline'], highlights: ['strip'] },
  },
  {
    id: 'minimal',
    name: 'Essential minimal',
    summary: 'Lots of white space, plain left-aligned titles, thin outlines and sharp corners.',
    brief: 'Minimal Swiss-style look: lots of white space, left-aligned plain titles, thin outlines, square corners, almost monochrome with a single accent.',
    palette: 'almost monochrome: near-black "heading", a single restrained accent as primary (one hue only), "secondary" close to the primary or neutral, white-ish "background"',
    fonts: [['Manrope', 'Inter'], ['Space Grotesk', 'Inter'], ['Work Sans', 'Work Sans'], ['DM Sans', 'DM Sans'], ['Jost', 'Inter']],
    style: { theme: ['light'], buttons: ['square'], cards: ['outline'], titles: ['plain'], align: ['left'], scale: ['large'], images: ['square'], titleCase: ['normal'], kicker: ['dash', 'plain'], radius: [0, 4], spacing: ['airy'], headingWeight: ['500', '600'], uppercase: [false], fill: ['flat', 'deep'], motion: ['fade', 'none'], hover: ['still', 'underline'], edges: ['hero'], rhythm: ['lines'], highlight: ['none'], decor: ['wordmark', 'none', 'lines'], photoTone: ['mono', 'natural', 'faded'], photoRatio: ['standard', 'tall', 'wide'], signature: ['numbers', 'vertical', 'none'] },
    layout: { header: ['classic', 'centered'], hero: ['split', 'card', 'editorial'], heroButtons: ['one', 'link'], heroHeight: ['auto', 'compact'], heroPhrases: ['none'], about: ['wide', 'image-right', 'stacked'], features: ['list', 'split'], cta: ['split', 'photo-split'], services: ['cards', 'list'], testimonials: ['minimal', 'quote', 'side'], homeGallery: ['masonry', 'strip'], contact: ['stacked', 'split'], footer: ['light'], footerCta: ['none'], divider: ['none'], subheader: ['plain', 'split'], stats: ['inline'], process: ['vertical', 'timeline'], highlights: ['strip'] },
  },
  {
    id: 'editorial',
    name: 'Elegant editorial',
    summary: 'Serif titles, photos with an offset frame, magazine rhythm and understated colors.',
    brief: 'Elegant editorial look: serif titles, framed photos with an offset color block, magazine rhythm, refined and calm.',
    palette: 'muted, sophisticated tones (e.g. deep green, burgundy, ink blue, warm taupe) as primary, a soft metallic or sand "secondary", warm off-white "background"',
    fonts: [['Playfair Display', 'Lato'], ['Cormorant Garamond', 'Raleway'], ['Libre Baskerville', 'Source Sans 3'], ['DM Serif Display', 'DM Sans'], ['Fraunces', 'Work Sans'], ['EB Garamond', 'Jost']],
    style: { theme: ['light'], buttons: ['square', 'rounded'], cards: ['outline', 'tinted'], titles: ['plain', 'line'], align: ['center'], scale: ['large'], images: ['framed', 'arch'], titleCase: ['normal'], kicker: ['dash'], radius: [0, 4], spacing: ['airy'], headingWeight: ['500', '600'], uppercase: [true], fill: ['deep', 'flat'], motion: ['fade', 'slide'], hover: ['still', 'underline'], edges: ['hero'], rhythm: ['lines', 'alternate'], highlight: ['italic'], decor: ['dropcap', 'frame'], photoTone: ['faded', 'mono', 'natural'], photoRatio: ['tall', 'standard'], signature: ['vertical', 'numbers', 'tilted'] },
    layout: { header: ['centered', 'split'], hero: ['center', 'card', 'editorial'], heroButtons: ['one', 'link'], heroHeight: ['auto', 'full'], heroPhrases: ['none'], about: ['image-right', 'wide', 'badge', 'collage', 'triptych', 'stacked', 'sandwich'], features: ['icons', 'list', 'center'], cta: ['banner', 'photo-split'], services: ['cards', 'list'], testimonials: ['minimal', 'quote', 'side'], homeGallery: ['mosaic', 'masonry'], footer: ['light', 'dark'], footerCta: ['none', 'large'], divider: ['none'], subheader: ['plain', 'split', 'photo'], stats: ['inline'], process: ['vertical'], highlights: ['strip'] },
  },
  {
    id: 'friendly',
    name: 'Warm and welcoming',
    summary: 'Soft shapes, pill buttons, tinted cards and wavy edges: friendly and close to people.',
    brief: 'Warm and friendly look: soft rounded shapes, pill buttons, tinted cards, wavy edges, approachable and human.',
    palette: 'warm and cheerful: a friendly primary (e.g. terracotta, coral, warm green, sunny blue) with a soft complementary "secondary" and a warm light "background"',
    fonts: [['Quicksand', 'Nunito'], ['Rubik', 'Nunito'], ['Poppins', 'Nunito'], ['Fraunces', 'Nunito']],
    style: { theme: ['light'], buttons: ['pill'], cards: ['tinted'], titles: ['line'], align: ['center'], scale: ['normal', 'large'], images: ['rounded', 'arch'], titleCase: ['normal'], kicker: ['pill'], radius: [16, 24], spacing: ['normal'], headingWeight: ['700', '800'], uppercase: [false], fill: ['flat', 'radial', 'gradient'], motion: ['zoom', 'rise'], hover: ['lift', 'glow'], edges: ['all', 'hero'], rhythm: ['alternate', 'fixed'], highlight: ['marker', 'color'], decor: ['blob', 'dots'], photoTone: ['natural'], photoRatio: ['standard', 'tall'], signature: ['tilted', 'stamp'] },
    layout: { header: ['classic', 'centered'], hero: ['split', 'center', 'slideshow', 'color'], heroButtons: ['two', 'one'], heroHeight: ['auto', 'compact'], heroPhrases: ['rotating', 'none'], about: ['image-left', 'image-right', 'badge', 'collage', 'triptych', 'sandwich'], features: ['icons', 'bento', 'center', 'split'], cta: ['split', 'photo-split'], services: ['boxed'], testimonials: ['cards'], homeGallery: ['carousel', 'masonry'], footer: ['brand', 'light'], footerCta: ['none', 'large'], divider: ['waves', 'curve', 'wave-brush', 'curve-asymmetrical'], subheader: ['photo', 'split'], stats: ['cards', 'band'], process: ['cards', 'timeline'], highlights: ['strip'] },
  },
  {
    id: 'bold',
    name: 'Bold modern',
    summary: 'Saturated colors, huge titles, a colored header and cards over photos: energetic and contemporary.',
    brief: 'Bold contemporary look: saturated colors, huge left-aligned titles, colored header, photo cards, energetic.',
    palette: 'vivid and saturated: an intense primary (e.g. electric blue, magenta, vivid orange, emerald) and a contrasting bright "secondary"',
    fonts: [['Montserrat', 'Inter'], ['Poppins', 'DM Sans'], ['Plus Jakarta Sans', 'Inter'], ['Archivo', 'Inter'], ['Syne', 'DM Sans']],
    style: { theme: ['light'], buttons: ['pill'], cards: ['shadow'], titles: ['plain'], align: ['left'], scale: ['xl'], images: ['rounded'], titleCase: ['normal'], kicker: ['pill', 'plain'], radius: [10, 16], spacing: ['normal'], headingWeight: ['800'], uppercase: [false], fill: ['gradient', 'flat', 'radial'], motion: ['slide', 'zoom'], hover: ['lift', 'glow'], edges: ['all', 'hero'], rhythm: ['alternate', 'fixed'], highlight: ['color', 'outline', 'marker'], decor: ['wordmark', 'none'], photoTone: ['natural', 'duotone'], photoRatio: ['wide', 'standard'], signature: ['stamp', 'numbers', 'tilted'] },
    layout: { header: ['bold', 'classic', 'transparent'], hero: ['left', 'bottom', 'card', 'color'], heroButtons: ['two', 'one'], heroHeight: ['full', 'auto'], heroPhrases: ['rotating', 'none'], about: ['image-left', 'wide', 'stacked'], features: ['cards', 'icons', 'bento', 'split'], cta: ['banner', 'phone'], services: ['overlay', 'boxed'], testimonials: ['band'], homeGallery: ['strip', 'mosaic', 'carousel'], footer: ['brand'], footerCta: ['none', 'large'], divider: ['tilt', 'waves', 'opacity-tilt', 'zigzag'], subheader: ['photo', 'plain'], stats: ['band', 'cards'], process: ['cards', 'timeline'], highlights: ['marquee', 'strip'] },
  },
  {
    id: 'premium',
    name: 'Dark premium',
    summary: 'Dark pages with golden details, refined titles, thin outlines and generous spacing.',
    brief: 'Dark premium look: dark pages with gold / champagne details, refined titles, thin outlines, generous spacing, luxurious.',
    palette: 'deep dark "dark" (black, midnight blue or dark green), a gold, champagne or copper "secondary", a rich deep primary',
    fonts: [['Cormorant Garamond', 'Montserrat'], ['Playfair Display', 'Raleway'], ['DM Serif Display', 'Inter'], ['Josefin Sans', 'Lato'], ['Cinzel', 'Jost']],
    style: { theme: ['dark'], buttons: ['square'], cards: ['outline'], titles: ['plain', 'line'], align: ['center'], scale: ['large'], images: ['framed', 'square', 'arch'], titleCase: ['normal', 'upper'], kicker: ['dash', 'plain'], radius: [0, 2], spacing: ['airy'], headingWeight: ['500', '600'], uppercase: [true], fill: ['deep', 'radial'], motion: ['fade'], hover: ['glow', 'still'], edges: ['hero'], rhythm: ['lines', 'alternate'], highlight: ['italic', 'none'], decor: ['frame', 'none'], photoTone: ['mono', 'faded', 'natural'], photoRatio: ['tall', 'standard'], signature: ['vertical', 'stamp', 'none'] },
    layout: { header: ['centered', 'classic', 'transparent', 'split'], hero: ['center', 'bottom', 'slideshow'], heroButtons: ['one', 'link'], heroHeight: ['full', 'auto'], heroPhrases: ['none'], about: ['image-right', 'wide', 'badge', 'triptych'], features: ['list', 'icons', 'center'], cta: ['banner', 'photo-split'], services: ['overlay', 'cards'], testimonials: ['minimal', 'quote', 'side'], homeGallery: ['mosaic', 'strip'], footer: ['dark'], footerCta: ['none', 'large'], divider: ['none'], subheader: ['photo', 'plain'], stats: ['inline', 'band'], process: ['vertical', 'timeline'], highlights: ['strip'] },
  },
  {
    id: 'natural',
    name: 'Natural and fresh',
    summary: 'Nature tones, soft serif titles, tinted cards and curved edges.',
    brief: 'Natural and fresh look: earthy, organic colors, soft serif titles, tinted cards, curved edges, calm and genuine.',
    palette: 'organic, earthy tones (e.g. sage or forest green, olive, clay, sand, sky blue) with a natural warm "secondary"',
    fonts: [['Lora', 'Open Sans'], ['Merriweather', 'Lato'], ['Bitter', 'Source Sans 3'], ['Fraunces', 'DM Sans']],
    style: { theme: ['light'], buttons: ['rounded'], cards: ['tinted'], titles: ['line'], align: ['center', 'left'], scale: ['normal'], images: ['rounded', 'arch'], titleCase: ['normal'], kicker: ['pill', 'dash'], radius: [8, 16], spacing: ['normal', 'airy'], headingWeight: ['600', '700'], uppercase: [false], fill: ['flat', 'gradient'], motion: ['rise', 'fade'], hover: ['lift', 'still'], edges: ['all', 'hero'], rhythm: ['alternate', 'fixed'], highlight: ['color', 'italic'], decor: ['blob', 'dropcap', 'dots'], photoTone: ['natural', 'faded'], photoRatio: ['standard', 'tall'], signature: ['tilted', 'stamp', 'none'] },
    layout: { header: ['classic', 'topbar', 'transparent', 'split'], hero: ['left', 'split', 'slideshow'], heroButtons: ['two', 'link', 'one'], heroHeight: ['auto', 'full'], heroPhrases: ['none', 'rotating'], about: ['image-left', 'image-right', 'badge', 'collage', 'triptych', 'sandwich'], features: ['icons', 'list', 'split', 'center'], cta: ['banner', 'split', 'photo-split', 'phone'], services: ['boxed', 'cards'], testimonials: ['cards', 'quote'], homeGallery: ['carousel', 'masonry', 'mosaic'], footer: ['dark', 'light'], footerCta: ['none', 'large'], divider: ['curve', 'waves', 'mountains', 'wave-brush'], subheader: ['photo', 'split'], stats: ['cards', 'band'], process: ['timeline', 'cards'], highlights: ['strip'] },
  },
  {
    id: 'technical',
    name: 'Technical geometric',
    summary: 'Sharp lines, colored bars on the titles, cards with a top border and slanted edges: precise and professional.',
    brief: 'Technical and geometric look: sharp lines, colored bars on the titles, accent-topped cards, slanted edges, precise and professional.',
    palette: 'cool technical tones (e.g. steel blue, cyan, graphite) as primary, a sharp signal "secondary" (orange, lime, yellow)',
    fonts: [['Barlow', 'Inter'], ['Space Grotesk', 'Inter'], ['Roboto Slab', 'Roboto'], ['Rubik', 'Roboto']],
    style: { theme: ['light'], buttons: ['square', 'rounded'], cards: ['accent'], titles: ['bar'], align: ['left'], scale: ['large'], images: ['square'], titleCase: ['normal', 'upper'], kicker: ['plain', 'dash'], radius: [2, 6], spacing: ['normal', 'compact'], headingWeight: ['600', '700'], uppercase: [true], fill: ['flat', 'deep', 'gradient'], motion: ['slide', 'rise'], hover: ['underline', 'glow'], edges: ['hero', 'all'], rhythm: ['lines', 'alternate'], highlight: ['none', 'color'], decor: ['grid', 'lines'], photoTone: ['natural', 'duotone', 'mono'], photoRatio: ['standard', 'wide'], signature: ['numbers', 'vertical'] },
    layout: { header: ['topbar', 'classic'], hero: ['left', 'split', 'color'], heroButtons: ['two', 'one'], heroHeight: ['auto', 'compact'], heroPhrases: ['none', 'rotating'], about: ['image-right', 'image-left', 'stacked', 'sandwich'], features: ['cards', 'list', 'bento', 'split'], cta: ['split', 'phone'], services: ['boxed', 'list'], testimonials: ['cards', 'side'], homeGallery: ['carousel', 'strip', 'mosaic'], footer: ['dark'], footerCta: ['none', 'large'], divider: ['tilt', 'triangle', 'arrow'], subheader: ['split', 'photo'], stats: ['inline', 'band'], process: ['timeline', 'cards'], highlights: ['strip', 'marquee'] },
  },
  {
    id: 'luxury',
    name: 'Refined luxury',
    summary: 'Ivory pages, classic serif titles, arched photos, thin gold lines and a calm, exclusive rhythm.',
    brief: 'Refined light luxury look: ivory pages, classic high-contrast serif titles, arched or framed photos, thin gold / bronze lines, lots of air, exclusive and calm.',
    palette: 'warm ivory or cream "background", a deep elegant primary (e.g. espresso, ink, bottle green, burgundy), a gold, bronze or champagne "secondary"',
    fonts: [['Cormorant Garamond', 'Jost'], ['Marcellus', 'Jost'], ['Cinzel', 'Lato'], ['Prata', 'Tenor Sans'], ['EB Garamond', 'Jost']],
    style: { theme: ['light'], buttons: ['square'], cards: ['outline'], titles: ['plain'], align: ['center'], scale: ['large', 'xl'], images: ['arch', 'framed'], titleCase: ['normal', 'upper'], kicker: ['dash'], radius: [0, 2], spacing: ['airy'], headingWeight: ['500'], uppercase: [true], fill: ['deep', 'flat'], motion: ['fade', 'none'], hover: ['still', 'glow'], edges: ['hero'], rhythm: ['lines', 'alternate'], highlight: ['italic'], decor: ['frame', 'dropcap'], photoTone: ['faded', 'natural', 'mono'], photoRatio: ['tall', 'standard'], signature: ['vertical', 'stamp', 'none'] },
    layout: { header: ['centered', 'classic', 'transparent', 'split'], hero: ['editorial', 'center', 'split', 'slideshow'], heroButtons: ['one', 'link'], heroHeight: ['full', 'auto'], heroPhrases: ['none'], about: ['badge', 'image-right', 'collage', 'triptych'], features: ['list', 'icons', 'center'], cta: ['banner', 'photo-split'], services: ['cards', 'list'], testimonials: ['quote', 'minimal'], homeGallery: ['mosaic', 'masonry'], contact: ['split'], footer: ['dark', 'light'], footerCta: ['none', 'large'], divider: ['none'], subheader: ['plain', 'photo'], stats: ['inline'], process: ['vertical'], highlights: ['strip'] },
  },
  {
    id: 'boutique',
    name: 'Soft boutique',
    summary: 'Delicate pastel tones, serif titles, arched photos, pill buttons and soft cards.',
    brief: 'Soft boutique look: delicate pastel and nude tones, gentle serif titles, arched photos, pill buttons, soft tinted cards, feminine and welcoming.',
    palette: 'soft and delicate: a dusty rose, sage, lavender, peach or nude primary (deep enough for white text), a warm soft "secondary", a very light blush or cream "background"',
    fonts: [['Fraunces', 'DM Sans'], ['Cormorant Garamond', 'Outfit'], ['Prata', 'Outfit'], ['Playfair Display', 'Jost']],
    style: { theme: ['light'], buttons: ['pill'], cards: ['tinted', 'shadow'], titles: ['plain', 'line'], align: ['center'], scale: ['large'], images: ['arch', 'rounded'], titleCase: ['normal'], kicker: ['pill'], radius: [18, 28], spacing: ['airy', 'normal'], headingWeight: ['500', '600'], uppercase: [false], fill: ['flat', 'radial'], motion: ['fade', 'zoom'], hover: ['glow', 'lift'], edges: ['all', 'hero'], rhythm: ['alternate', 'fixed'], highlight: ['italic', 'marker'], decor: ['blob', 'frame', 'dots'], photoTone: ['faded', 'natural'], photoRatio: ['tall', 'standard'], signature: ['tilted', 'stamp', 'vertical'] },
    layout: { header: ['centered', 'classic', 'split'], hero: ['split', 'editorial', 'slideshow'], heroButtons: ['one', 'link'], heroHeight: ['auto', 'full'], heroPhrases: ['none'], about: ['badge', 'image-left', 'collage', 'triptych', 'sandwich'], features: ['icons', 'center', 'split'], cta: ['split', 'photo-split'], services: ['cards', 'boxed'], testimonials: ['quote', 'cards'], homeGallery: ['masonry', 'carousel'], footer: ['light', 'brand'], footerCta: ['none', 'large'], divider: ['waves', 'curve', 'none', 'wave-brush'], subheader: ['split', 'photo'], stats: ['cards', 'inline'], process: ['vertical', 'cards'], highlights: ['strip'] },
  },
  {
    id: 'architectural',
    name: 'Architectural',
    summary: 'Photo-led and monochrome: huge thin titles, square shapes, numbered service rows and wide photos.',
    brief: 'Architectural, photo-led look: almost monochrome, huge light titles, square shapes, wide photos, numbered service rows, precise and sophisticated.',
    palette: 'almost monochrome: graphite, stone, concrete or warm grey tones, a single refined accent (e.g. brass, terracotta, olive) as "secondary"',
    fonts: [['Syne', 'Inter'], ['Outfit', 'Inter'], ['Tenor Sans', 'Work Sans'], ['Jost', 'Jost']],
    style: { theme: ['light', 'dark'], buttons: ['square'], cards: ['outline'], titles: ['plain'], align: ['left'], scale: ['xl'], images: ['square'], titleCase: ['upper', 'normal'], kicker: ['dash'], radius: [0, 0], spacing: ['airy'], headingWeight: ['500', '600'], uppercase: [true], fill: ['deep', 'flat'], motion: ['none', 'slide'], hover: ['still', 'underline'], edges: ['hero'], rhythm: ['lines'], highlight: ['none', 'outline'], decor: ['wordmark', 'lines'], photoTone: ['mono', 'duotone'], photoRatio: ['wide', 'tall'], signature: ['vertical', 'numbers'] },
    layout: { header: ['classic', 'centered', 'transparent'], hero: ['bottom', 'editorial'], heroButtons: ['one', 'link'], heroHeight: ['full', 'auto'], heroPhrases: ['none'], about: ['wide', 'badge', 'stacked', 'triptych'], features: ['list', 'split'], cta: ['split', 'banner', 'photo-split'], services: ['list', 'overlay'], testimonials: ['quote', 'minimal', 'side'], homeGallery: ['strip', 'masonry', 'mosaic'], footer: ['dark', 'light'], footerCta: ['large', 'none'], divider: ['none'], subheader: ['plain', 'split'], stats: ['inline'], process: ['vertical', 'timeline'], highlights: ['strip'] },
  },
];

const BY_ID = new Map(DIRECTIONS.map((d) => [d.id, d]));
export const directionById = (id) => BY_ID.get(id) || null;

/** Direction list for the UI. */
export const directionList = () => DIRECTIONS.map(({ id, name, summary }) => ({ id, name, summary }));

/** The values of `all` a direction allows (`own`; all of them when it does not say). */
const allowedValues = (all, own) => {
  const list = (own || all).filter((v) => all.includes(v));
  return list.length ? list : all;
};

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
  (s) => moveBefore(s, 'reviews', 'services'),
  (s) => moveBefore(s, 'gallery', 'services'),
  (s) => moveBefore(moveBefore(s, 'services', 'about'), 'reviews', 'gallery'),
  (s) => moveBefore(swap(s, 'about', 'features'), 'gallery', 'services'),
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
  style: { theme: 3, fill: 2, rhythm: 2, cards: 1.5, images: 1.5, highlight: 1.5, decor: 1.5, photoTone: 2, photoRatio: 1, signature: 1.5, scale: 1, titles: 1, align: 1, buttons: 1, titleCase: 1, spacing: 1, kicker: 0.6, motion: 0.6, hover: 0.6, edges: 0.6, headingWeight: 0.5, uppercase: 0.4 },
  layout: { hero: 3, heroButtons: 1, heroHeight: 1.5, heroPhrases: 1, header: 2, subheader: 2, services: 2, about: 1.5, features: 1.5, featureCount: 1, testimonials: 1.5, footer: 1, footerCta: 1, divider: 1, cta: 1, stats: 1, process: 1, highlights: 0.8, contact: 0.7, homeGallery: 1.5, gallery: 0.2 },
};
/** Layouts of optional Home sections: they only make two templates differ when both have the section. */
const OPTIONAL_LAYOUTS = ['cta', 'stats', 'process', 'highlights'];
/** Weight of a corner radius difference (full weight from 8px apart). */
const RADIUS_WEIGHT = 0.5;
/** Weight of each block to change to turn the Home shape of one template into the other's. */
const SHAPE_WEIGHT = 1.5;
/** Weight of each colored block more or less on the Home page (up to 3: an almost white template against a colorful one). */
const COLOR_WEIGHT = 1;
/** Penalties (in score points; one unit of distance to the nearest template = 1000) of a candidate. */
const PENALTY = {
  // A hero layout another template of the category has, while the direction allows an unused one
  usedHero: 1e6,
  // The same first screen (kind of header, hero, full screen or not) or the same Home shape as another template
  sameFirstScreen: 1e5,
  sameShape: 1e5,
  // Two neighbouring Home blocks of the same form (as much as changing the hero layout)
  repeatedBlock: 3000,
};

/**
 * Concrete design decisions of a new template in `direction`, as different as possible from the
 * `existing` templates of the category (then from the `library` of the other categories):
 * { fonts, style: {look, radius, spacing, headingWeight, uppercase}, layout, sections }.
 * The Home sections are chosen first, so that the layouts of optional sections only count when
 * both templates show them; then, among many random combinations allowed by the direction, the one
 * whose distance to the most similar template of the category is the largest, then far from all of
 * them, then made of the values used least. The distance is the one a visitor sees (similarity.js):
 * weighted decisions (DECISION_WEIGHTS) as they show on the page, look-alike values counting less,
 * plus the blocks that differ in the shape of the Home page. A candidate is pushed back when it
 * takes a hero layout already in the category (while the direction has a free one), the same first
 * screen or the same Home shape as another template, or puts two blocks of the same form in a row.
 * opts.sections: keep these Home sections (only their order changes); opts.exclude: values not to
 * use, as { style|layout: { key: [values] } } (diversify()).
 */
export function designPlan(direction, existing, rng = Math.random, profile = null, library = [], { sections: keep = null, exclude = {} } = {}) {
  const usedHeading = existing.map((s) => s.style?.fonts?.heading);
  const libHeading = library.map((s) => s.style?.fonts?.heading);
  const pairs = direction.fonts.filter(([h, b]) => FONTS.includes(h) && FONTS.includes(b));
  const fontCount = (p) => countOf(usedHeading, p[0]) * 100 + countOf(libHeading, p[0]);
  const minFonts = Math.min(...pairs.map(fontCount));
  const [heading, body] = pickRandom(pairs.filter((p) => fontCount(p) === minFonts), rng);
  const sections = keep ? varyOrder([...keep], existing) : planSections(existing, profile?.sections || null, rng);

  // Look + layouts (+ spacing, title weight, uppercase): best of many random combinations allowed by the direction
  const allowed = allowedValues;
  // Without the excluded values (all of them when nothing else is left)
  const usable = (ch) => {
    const left = ch.values.filter((v) => !exclude[ch.group]?.[ch.key]?.includes(String(v)));
    return { ...ch, values: left.length ? left : ch.values };
  };
  const choices = [
    ...Object.entries(STYLE_OPTIONS)
      .filter(([key]) => key !== 'signature')
      .map(([key, values]) => ({ group: 'style', key, values: allowed(values, direction.style[key]) })),
    { group: 'style', key: 'spacing', values: allowed(SPACINGS, direction.style.spacing) },
    { group: 'style', key: 'headingWeight', values: allowed(WEIGHTS, direction.style.headingWeight) },
    { group: 'style', key: 'uppercase', values: allowed([false, true], direction.style.uppercase) },
    ...Object.entries(LAYOUTS).map(([key, values]) => ({ group: 'layout', key, values: allowed(values, direction.layout[key]) })),
  ]
    .map(usable)
    .map((ch) => ({ ...ch, weight: DECISION_WEIGHTS[ch.group][ch.key] ?? 1 }));
  const [rMin, rMax] = direction.style.radius || [0, 12];

  const weightFor = (ch, other) => (ch.group === 'layout' && OPTIONAL_LAYOUTS.includes(ch.key) && !(sections.includes(ch.key) && (other.sections || []).includes(ch.key)) ? 0 : ch.weight);
  // The other templates as they look (similarity.js), computed once
  const others = existing.map((s) => ({ spec: s, look: effective(s), shape: homeShape(s), screen: firstScreen(s), color: colorAmount(s) }));
  /** How different two templates look: decisions as they show (look-alike values count less), corners, Home shape, amount of color. */
  const distance = (cand, other) =>
    choices.reduce((sum, ch) => sum + weightFor(ch, other.spec) * change(ch.group, ch.key, cand.look[ch.group][ch.key], other.look[ch.group]?.[ch.key]), 0) +
    RADIUS_WEIGHT * Math.min(1, Math.abs((other.spec.style?.radius ?? cand.radius) - cand.radius) / 8) +
    SHAPE_WEIGHT * shapeDistance(cand.shape, other.shape) +
    COLOR_WEIGHT * Math.min(3, Math.abs(cand.color - other.color));
  const usage = (list, ch, v) => list.filter((s) => s[ch.group]?.[ch.key] === v).length;
  // Values used by the other categories weigh less than the ones of the category (share of the library, 0..10)
  const rarityOf = (ch, v) => usage(existing, ch, v) * 10 + (library.length ? (usage(library, ch, v) / library.length) * 10 : 0);
  // Hero layouts of the direction no template of the category has yet
  const heroes = choices.find((ch) => ch.key === 'hero').values;
  const freeHero = heroes.some((v) => !existing.some((s) => s.layout?.hero === v));
  const score = (cand) => {
    const distances = others.map((o) => distance(cand, o));
    const nearest = distances.length ? Math.min(...distances) : 0;
    const mean = distances.length ? distances.reduce((a, b) => a + b, 0) / distances.length : 0;
    const rarity = choices.reduce((sum, ch) => sum - ch.weight * rarityOf(ch, cand[ch.group][ch.key]), 0);
    const penalty =
      (freeHero && others.some((o) => o.spec.layout?.hero === cand.layout.hero) ? PENALTY.usedHero : 0) +
      (others.some((o) => o.screen === cand.screen) ? PENALTY.sameFirstScreen : 0) +
      (others.some((o) => shapeDistance(o.shape, cand.shape) === 0) ? PENALTY.sameShape : 0) +
      repeatedBlocks(cand.shape) * PENALTY.repeatedBlock;
    return nearest * 1000 + mean * 20 + rarity - penalty;
  };
  let best = null;
  for (let i = 0; i < 400; i++) {
    const cand = { style: {}, layout: {}, radius: rMin + Math.floor(rng() * (rMax - rMin + 1)) };
    for (const ch of choices) cand[ch.group][ch.key] = i === 0 ? leastUsed(ch.values, existing.map((s) => s[ch.group]?.[ch.key]), rng) : pickRandom(ch.values, rng);
    // The count of strengths the chosen "why choose us" layout really shows (as sanitizeSpec saves it)
    cand.layout.featureCount = String(featureCount(cand.layout));
    Object.assign(cand, { look: effective(cand), shape: homeShape({ layout: cand.layout, sections }), screen: firstScreen(cand), color: colorAmount({ layout: cand.layout, sections }) });
    const sc = score(cand);
    if (!best || sc > best.score) best = { ...cand, score: sc };
  }
  return { fonts: { heading, body }, style: { ...best.style, radius: best.radius }, layout: best.layout, sections, signatures: signatureOptions(direction, existing, library, rng) };
}

/**
 * Signature details offered to the AI (it chooses the one that best expresses its concept): the ones
 * of the direction no template of the category has yet (all of them when every one is taken), the
 * least used across the library first, at most 3.
 */
function signatureOptions(direction, existing, library, rng) {
  const all = allowedValues(STYLE_OPTIONS.signature, direction.style.signature);
  const used = existing.map((s) => s.style?.signature);
  const free = all.filter((v) => !used.includes(v));
  const elsewhere = library.map((s) => s.style?.signature);
  const order = new Map(all.map((v) => [v, countOf(used, v) * 100 + countOf(elsewhere, v) + rng()]));
  return (free.length ? free : all).sort((a, b) => order.get(a) - order.get(b)).slice(0, 3);
}

/**
 * Apply the plan to the spec answered by the AI (the AI keeps palette, icons, tone and texts, and
 * chooses the signature detail among the offered ones; otherwise the first of them).
 */
export function applyPlan(spec, direction, plan) {
  const offered = plan.signatures || [];
  const signature = offered.includes(spec.style?.signature) ? spec.style.signature : offered[0] || 'none';
  return {
    ...spec,
    direction: direction.id,
    style: { ...spec.style, ...plan.style, fonts: plan.fonts, signature },
    layout: { ...plan.layout },
    sections: [...plan.sections],
  };
}

/**
 * Visible decisions compared between two saved templates: the ones the planner chooses, plus the
 * signature detail (chosen by the AI).
 */
const COMPARED = [
  ...Object.keys(STYLE_OPTIONS).map((key) => ({ group: 'style', key })),
  ...['spacing', 'headingWeight', 'uppercase'].map((key) => ({ group: 'style', key })),
  ...Object.keys(LAYOUTS).map((key) => ({ group: 'layout', key })),
].map((ch) => ({ ...ch, weight: DECISION_WEIGHTS[ch.group][ch.key] ?? 1 }));
/** Weight of the main color (similar hue or not) and of the title font when two saved templates are compared. */
const PALETTE_WEIGHT = 4;
const FONT_WEIGHT = 2;

/**
 * How alike two saved templates look (the "Compare" view): likeness 0..100 (the weighted share of
 * what looks the same: the decisions as they show, corners, Home shape, amount of color, main color,
 * title font) and what they visibly have in common:
 * direction, palette, fonts, firstScreen (same header + hero + height) or hero, shape (Home blocks
 * in nearly the same order and form), signature, photoTone.
 */
export function compareTemplates(a, b) {
  const [la, lb] = [effective(a), effective(b)];
  const both = (key) => (a.sections || []).includes(key) && (b.sections || []).includes(key);
  const [sa, sb] = [homeShape(a), homeShape(b)];
  const blocks = Math.max(sa.length, sb.length);
  const shapeGap = shapeDistance(sa, sb);
  const parts = [
    ...COMPARED.map((ch) => ({
      weight: ch.group === 'layout' && OPTIONAL_LAYOUTS.includes(ch.key) && !both(ch.key) ? 0 : ch.weight,
      diff: change(ch.group, ch.key, la[ch.group][ch.key], lb[ch.group][ch.key]),
    })),
    { weight: RADIUS_WEIGHT, diff: Math.min(1, Math.abs(a.style.radius - b.style.radius) / 8) },
    { weight: SHAPE_WEIGHT * blocks, diff: shapeGap / blocks },
    { weight: COLOR_WEIGHT * 3, diff: Math.min(3, Math.abs(colorAmount(a) - colorAmount(b))) / 3 },
    { weight: PALETTE_WEIGHT, diff: similarColor(a.style.colors.primary, b.style.colors.primary) ? 0 : 1 },
    { weight: FONT_WEIGHT, diff: a.style.fonts.heading === b.style.fonts.heading ? 0 : 1 },
  ];
  const total = parts.reduce((sum, p) => sum + p.weight, 0);
  const diff = parts.reduce((sum, p) => sum + p.weight * p.diff, 0);
  const same = (group, key, none) => la[group][key] === lb[group][key] && la[group][key] !== none;
  const shared = [
    a.direction && a.direction === b.direction && 'direction',
    similarColor(a.style.colors.primary, b.style.colors.primary) && 'palette',
    a.style.fonts.heading === b.style.fonts.heading && 'fonts',
    firstScreen(a) === firstScreen(b) ? 'firstScreen' : same('layout', 'hero') && 'hero',
    shapeGap <= 1 && 'shape',
    same('style', 'signature', 'none') && 'signature',
    same('style', 'photoTone', 'natural') && 'photoTone',
  ].filter(Boolean);
  return { likeness: Math.round(100 * (1 - diff / total)), shared };
}

/** Is this list of sample texts still the default one (a template generated before it existed)? */
const defaultCopy = (spec, key, from = 0) => JSON.stringify(spec.copy?.[key]?.slice(from)) === JSON.stringify(DEFAULT_SPEC.copy[key].slice(from));

/** Attempts of diversify(): the planner is randomized, the best of them is kept. */
const DIVERSIFY_TRIES = 8;
/** Likeness (compareTemplates) to the current design above which a new design does not look new enough (1 point each). */
const MAX_SELF_LIKENESS = 50;

/**
 * "Make it more different": a new design for a saved template, keeping its palette, icons, tone,
 * texts and Home sections (only their order may change). Layouts, look, fonts and signature detail
 * are planned again against the `others` templates of the category (as if it were the last one
 * generated), in its direction or in a direction no other template of the category has (among the
 * `suitable` ones for the industry, when known). Among a few plans, the one least like its most
 * similar template, also clearly different from the current design. Layouts needing texts the
 * template does not have (rotating hero phrases, about points, 5–6 strengths) are left out.
 */
export function diversify(spec, others, { library = [], suitable = null, rng = Math.random } = {}) {
  const current = directionById(spec.direction) || pickDirection(others, { library, suitable, rng });
  const fitting = (suitable || []).filter((id) => BY_ID.has(id));
  const free = (fitting.length ? fitting : DIRECTIONS.map((d) => d.id)).filter((id) => id !== current.id && !others.some((o) => o.direction === id));
  const layout = {};
  if (defaultCopy(spec, 'heroPhrases')) layout.heroPhrases = ['rotating'];
  if (defaultCopy(spec, 'aboutPoints')) layout.about = ['sandwich'];
  if (defaultCopy(spec, 'features', 4)) layout.featureCount = ['5', '6'];
  let best = null;
  for (let i = 0; i < DIVERSIFY_TRIES; i++) {
    const direction = i === 0 || !free.length ? current : BY_ID.get(pickRandom(free, rng));
    const plan = designPlan(direction, others, rng, null, library, { sections: spec.sections, exclude: { layout } });
    // Another signature detail than the current one when the direction has another
    const signatures = [...plan.signatures.filter((v) => v !== spec.style.signature), spec.style.signature];
    const cand = applyPlan({ ...spec, style: { ...spec.style, signature: null } }, direction, { ...plan, signatures });
    const nearest = Math.max(0, ...others.map((o) => compareTemplates(cand, o).likeness));
    const score = nearest + Math.max(0, compareTemplates(cand, spec).likeness - MAX_SELF_LIKENESS);
    if (!best || score < best.score) best = { spec: cand, score };
  }
  return best.spec;
}
