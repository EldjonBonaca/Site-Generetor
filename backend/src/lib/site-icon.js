/**
 * Site icon (favicon) made from the logo: a square transparent PNG of ICON_SIZE px.
 *  - the empty margins of the logo are cut away;
 *  - a logo with a symbol followed by the name (a clear empty gap between them) keeps only the symbol;
 *  - otherwise the whole logo, centered in the square.
 * Works for SVG logos too (rasterized), which WordPress cannot turn into a site icon.
 */
import sharp from 'sharp';

export const ICON_SIZE = 512;

/** Columns [start, end) of the symbol on the left of the logo, or null when no clear gap separates it from the rest. bg: [r, g, b, a] of the background. */
export function symbolColumns(data, width, height, channels, bg) {
  const empty = (x) => {
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * channels;
      const alpha = channels === 4 ? data[i + 3] : 255;
      if (bg[3] < 20 ? alpha >= 40 : Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) > 60) return false;
    }
    return true;
  };
  if (width < height * 1.6) return null; // square-ish: the whole logo is the icon
  const minGap = Math.max(3, Math.round(width * 0.03));
  let run = 0;
  for (let x = 0; x < Math.round(width * 0.7); x++) {
    if (empty(x)) {
      run++;
      const start = x - run + 1;
      // The part on the left is a symbol: about square (a first word of the name is much wider than tall)
      if (run >= minGap && start >= height * 0.5) return start <= height * 1.5 ? [0, start] : null;
    } else run = 0;
  }
  return null;
}

/** PNG buffer of the site icon made from the logo file. */
export async function siteIconFromLogo(file, mime) {
  const input = () => sharp(file, mime === 'image/svg+xml' ? { density: 300 } : { failOn: 'none' });
  // Margins cut away (the color of the top-left pixel), on a PNG so the next steps read real pixels
  const full = await input().rotate().png().toBuffer();
  const corner = await sharp(full).ensureAlpha().extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
  const trimmed = await sharp(full).trim({ threshold: 12 }).png().toBuffer().catch(() => full);
  const { data, info } = await sharp(trimmed).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const cols = symbolColumns(data, info.width, info.height, info.channels, [...corner]);
  let image = sharp(trimmed);
  if (cols) {
    const symbol = await image.extract({ left: 0, top: 0, width: cols[1], height: info.height }).png().toBuffer();
    image = sharp(await sharp(symbol).trim({ threshold: 12 }).png().toBuffer().catch(() => symbol));
  }
  const inner = Math.round(ICON_SIZE * 0.9);
  const fitted = await image.resize({ width: inner, height: inner, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  return sharp({ create: { width: ICON_SIZE, height: ICON_SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: fitted, gravity: 'center' }])
    .png()
    .toBuffer();
}
