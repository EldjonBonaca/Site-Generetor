/**
 * Brand color of the built-in layout: the dominant "real" color of the logo
 * (transparent, near-white, near-black and grey pixels are ignored).
 */
import sharp from 'sharp';

const toHex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** @returns {Promise<string|null>} hex color, or null when the logo has no clear color */
export async function logoColor(file) {
  let data;
  try {
    // kernel "nearest": edge pixels are not blended with the background
    ({ data } = await sharp(file, { failOn: 'none' }).resize(64, 64, { fit: 'inside', kernel: 'nearest' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true }));
  } catch {
    return null;
  }
  // Group pixels by hue (24 buckets) among saturated, mid-lightness pixels
  const buckets = new Map();
  let darkSum = [0, 0, 0];
  let darkCount = 0;
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 128) continue;
    const max = Math.max(r, g, b) / 255;
    const min = Math.min(r, g, b) / 255;
    const l = (max + min) / 2;
    const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
    if (l > 0.93) continue; // white background
    if (s < 0.25 || l < 0.12) {
      if (l < 0.45) {
        darkSum = [darkSum[0] + r, darkSum[1] + g, darkSum[2] + b];
        darkCount++;
      }
      continue;
    }
    let h;
    if (max === r / 255) h = ((g - b) / 255 / (max - min)) % 6;
    else if (max === g / 255) h = (b - r) / 255 / (max - min) + 2;
    else h = (r - g) / 255 / (max - min) + 4;
    const key = Math.floor((((h * 60) + 360) % 360) / 15);
    const e = buckets.get(key) || { n: 0, sum: [0, 0, 0] };
    e.n++;
    e.sum = [e.sum[0] + r, e.sum[1] + g, e.sum[2] + b];
    buckets.set(key, e);
  }
  const best = [...buckets.values()].sort((a, b) => b.n - a.n)[0];
  if (best && best.n >= 12) return toHex(best.sum.map((v) => v / best.n));
  // Monochrome dark logo: use its dark tone
  if (darkCount >= 12) return toHex(darkSum.map((v) => v / darkCount));
  return null;
}
