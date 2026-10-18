/**
 * How alike two templates look, as a visitor sees them (used by the planner, directions.js):
 *  - families of values that look alike: changing a decision inside its family (a centered hero
 *    over a photo or over a slideshow, a curve or a wave edge) counts only a share of its weight;
 *  - decisions without a visible effect are ignored (the height of the editorial hero, the shaped
 *    band edges of a template without shapes);
 *  - the shape of the Home page: the sequence of its blocks as forms (text beside a photo, a grid
 *    of cards, a band over a photo...), whatever section they belong to;
 *  - the first screen (header, hero, its height), which a visitor sees before anything else;
 *  - the amount of strong color of the Home page (colored and photo bands, a hero on a photo or on the brand color).
 */
import { DEFAULT_SECTIONS, featureCount } from './spec.js';

/** Values that look alike (only the decisions with such values; the others are all different). */
export const FAMILIES = {
  style: {
    fill: { gradient: 'blend', radial: 'blend', flat: 'solid', deep: 'solid' },
    cards: { shadow: 'raised', accent: 'raised', outline: 'flat', tinted: 'flat' },
    images: { rounded: 'soft', arch: 'soft', square: 'sharp', framed: 'sharp' },
    motion: { rise: 'moving', slide: 'moving', zoom: 'moving', fade: 'calm', none: 'calm' },
    highlight: { italic: 'type', outline: 'type', color: 'color', marker: 'color', none: 'none' },
    decor: { grid: 'texture', dots: 'texture', lines: 'texture', frame: 'photo', blob: 'photo', dropcap: 'type', wordmark: 'type', none: 'none' },
    photoTone: { mono: 'graphic', duotone: 'graphic', natural: 'natural', faded: 'faded' },
    headingWeight: { 500: 'light', 600: 'light', 700: 'bold', 800: 'bold' },
  },
  layout: {
    header: { classic: 'bar', centered: 'bar', topbar: 'topbar', bold: 'bold', transparent: 'over', split: 'split' },
    hero: { center: 'photo-center', slideshow: 'photo-center', left: 'photo-side', bottom: 'photo-side', card: 'photo-card', split: 'split', editorial: 'editorial', color: 'color' },
    heroButtons: { two: 'two', one: 'one', link: 'one' },
    heroHeight: { auto: 'normal', compact: 'normal', full: 'full' },
    about: { 'image-left': 'row', 'image-right': 'row', badge: 'row', collage: 'row', wide: 'wide', stacked: 'wide', triptych: 'three', sandwich: 'three' },
    featureCount: { 3: 'few', 4: 'few', 5: 'many', 6: 'many' },
    services: { cards: 'cards', boxed: 'cards', overlay: 'overlay', list: 'rows' },
    testimonials: { cards: 'grid', minimal: 'grid', band: 'band', quote: 'quote', side: 'side' },
    process: { cards: 'cards', timeline: 'line', vertical: 'line' },
    divider: {
      none: 'straight',
      curve: 'soft',
      'curve-asymmetrical': 'soft',
      waves: 'soft',
      'wave-brush': 'soft',
      tilt: 'angular',
      'opacity-tilt': 'angular',
      triangle: 'angular',
      arrow: 'angular',
      zigzag: 'angular',
      mountains: 'angular',
    },
  },
};
/** Share of the weight of a decision changed inside its family. */
export const SAME_FAMILY = 0.35;

/** 0 (same look), SAME_FAMILY (a look-alike value) or 1 (a different look) for one decision. */
export function change(group, key, a, b) {
  if (a === b) return 0;
  const family = FAMILIES[group]?.[key];
  return family && family[a] !== undefined && family[a] === family[b] ? SAME_FAMILY : 1;
}

/**
 * The decisions as they show on the page: the ones without a visible effect take a neutral value,
 * the count of strengths is the one the layout really shows. design: { style, layout }.
 */
export function effective(design) {
  const style = { ...(design.style || {}) };
  const layout = { ...(design.layout || {}) };
  if (layout.hero === 'editorial') layout.heroHeight = 'auto';
  if (layout.divider === 'none') style.edges = 'hero';
  if (layout.features) layout.featureCount = String(featureCount(layout));
  return { style, layout };
}

/** Form of each Home section for its layout (sections of the same form look alike, whatever they say). */
const SHAPES = {
  about: (l) => ({ wide: 'media-wide', stacked: 'media-wide', triptych: 'three-col', sandwich: 'three-col' })[l.about] || 'media-row',
  features: (l) => ({ icons: 'card-grid', cards: 'photo-band', list: 'side-list', bento: 'tiles', split: 'media-row', center: 'three-col' })[l.features] || 'card-grid',
  cta: (l) => ({ split: 'color-card', phone: 'color-band', 'photo-split': 'media-band' })[l.cta] || 'photo-band',
  services: (l) => ({ overlay: 'tiles', list: 'rows' })[l.services] || 'card-grid',
  reviews: (l) => ({ cards: 'card-grid', band: 'color-band', side: 'side-list' })[l.testimonials] || 'centered',
  stats: (l) => ({ band: 'color-band', inline: 'line', cards: 'card-grid' })[l.stats] || 'color-band',
  process: (l) => ({ timeline: 'line', vertical: 'side-list' })[l.process] || 'card-grid',
  highlights: () => 'color-band',
  gallery: (l) => ({ mosaic: 'tiles', strip: 'photo-strip', masonry: 'photo-grid' })[l.homeGallery] || 'carousel',
  faq: () => 'accordion',
};

/** Shape of the Home page: the hero, then the form of each section in order. design: { layout, sections }. */
export function homeShape(design) {
  const layout = design.layout || {};
  const sections = design.sections || DEFAULT_SECTIONS;
  return [FAMILIES.layout.hero[layout.hero] || 'photo-center', ...sections.map((id) => (SHAPES[id] ? SHAPES[id](layout) : id))];
}

/** Blocks to add, remove or replace to turn one Home shape into the other (edit distance). */
export function shapeDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length];
}

/** Neighbouring Home blocks of the same form (a monotonous page: text beside a photo twice in a row...). */
export function repeatedBlocks(shape) {
  return shape.slice(1).filter((x, i) => x === shape[i]).length;
}

/** Home blocks in a strong color or over a photo (the others stand on the page color or a light tint). */
const COLORED = new Set(['photo-band', 'color-band', 'color-card', 'media-band']);
/** Heroes on a photo or on the brand color (the split and editorial ones stand on a light tint). */
const LIGHT_HEROES = ['split', 'editorial'];

/**
 * How much strong color the Home page shows: its colored and photo bands, plus the hero when it is
 * not on a light tint. A template almost all white and one with many color blocks look different
 * even with the same palette.
 */
export function colorAmount(design) {
  const [, ...blocks] = homeShape(design);
  return blocks.filter((x) => COLORED.has(x)).length + (LIGHT_HEROES.includes(design.layout?.hero) ? 0 : 1);
}

/** What a visitor sees first: the kind of header, the hero and whether it fills the screen. */
export function firstScreen(design) {
  const { layout } = effective(design);
  const f = FAMILIES.layout;
  return `${f.header[layout.header] || layout.header}|${layout.hero}|${f.heroHeight[layout.heroHeight] || 'normal'}`;
}
