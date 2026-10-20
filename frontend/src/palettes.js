/**
 * Ready-made color palettes for the template editor, built around the main color of the template:
 * the same hue in several tones, its opposite, its neighbours, three evenly spaced hues, or neutrals
 * with a sand accent. Titles, text and backgrounds are tinted with the main hue so every palette
 * stays coherent; the builder still fixes any color that would make texts unreadable.
 */

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

const toHsl = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
};

const hsl = (h, s, l) => {
  h = ((h % 360) + 360) % 360;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
};

/** Titles, text, light background and dark color tinted with hue `h`. */
const neutrals = (h, s) => ({
  heading: hsl(h, Math.min(s, 0.45), 0.15),
  text: hsl(h, 0.1, 0.34),
  background: hsl(h, 0.35, 0.97),
  dark: hsl(h, 0.4, 0.1),
});

export const PALETTE_NAMES = { mono: 'Monochrome', complementary: 'Complementary', analogous: 'Analogous', triadic: 'Triadic', neutral: 'Neutral with sand' };

/**
 * Five palettes around `base` (hex). `shift` rotates the main hue (degrees): 0 keeps the exact main
 * color of the template, any other value proposes palettes on a different main color.
 */
export function palettes(base, shift = 0) {
  const b = toHsl(base);
  const h = (b.h + shift) % 360;
  // A grey or very pale / dark main color would give dull palettes: keep it lively and readable
  const s = clamp(b.s, 0.35, 0.8);
  const l = clamp(b.l, 0.3, 0.48);
  const primary = shift ? hsl(h, s, l) : base.toUpperCase();
  return [
    { id: 'mono', colors: { primary, secondary: hsl(h, s, Math.min(l + 0.22, 0.68)), accent: hsl(h, s, Math.max(l - 0.12, 0.2)), ...neutrals(h, s) } },
    { id: 'complementary', colors: { primary, secondary: hsl(h + 180, 0.78, 0.55), accent: hsl(h + 180, 0.6, 0.38), ...neutrals(h, s) } },
    { id: 'analogous', colors: { primary, secondary: hsl(h + 35, 0.75, 0.55), accent: hsl(h - 35, 0.55, 0.4), ...neutrals(h, s) } },
    { id: 'triadic', colors: { primary, secondary: hsl(h + 120, 0.65, 0.5), accent: hsl(h + 240, 0.55, 0.45), ...neutrals(h, s) } },
    {
      id: 'neutral',
      colors: { primary, secondary: hsl(38, 0.55, 0.58), accent: hsl(h, 0.2, 0.4), heading: hsl(0, 0, 0.1), text: hsl(0, 0, 0.32), background: hsl(40, 0.25, 0.96), dark: hsl(h, 0.15, 0.09) },
    },
  ];
}

/** Do two color sets match on every key? */
export const samePalette = (a, b) => !!a && !!b && Object.keys(a).every((k) => a[k]?.toUpperCase() === b[k]?.toUpperCase());
