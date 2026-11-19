/**
 * Photos of a business found elsewhere, offered to the user to choose from (Images step of a project):
 *
 *  - Google Maps: the photos of the business listing, through the official Places API (New). It needs
 *    a key of the owner of the app (GOOGLE_MAPS_API_KEY in backend/.env); Google gives a free monthly
 *    allowance. A Maps page itself gives no photos to a server (they are loaded by its scripts).
 *  - a public web page (the old website of the client, a page of its social profile…): the images the
 *    page shows to anyone, read from its HTML. Instagram and Facebook show their photos only to
 *    logged-in users: for a visitor without account their pages hold no photos, so nothing (or very
 *    little) is found there. Nothing is done to get around that.
 *
 * The found images are never fetched by the browser from the other site: the app gives each a signed
 * token; the preview and the import routes fetch the address inside it (public hosts only, size limits).
 */
import crypto from 'node:crypto';
import path from 'node:path';
import { parse } from 'node-html-parser';
import { config } from '../config.js';
import { badRequest } from './util.js';
import { referenceUrl, safeGet } from '../templates/reference.js';
import { undoLazyLoading } from '../kits/from-site.js';

const MAX_PAGE = 4_000_000;
export const MAX_FOUND = 80;
const PLACES = 'https://places.googleapis.com/v1/';

// ---------------------------------------------------------------- tokens --

const mac = (url) => crypto.createHmac('sha256', config.encryptionKey).update(`photo-import:${url}`).digest('base64url').slice(0, 32);
/** A found image as a token only this app can make (the routes fetch nothing else). */
export const tokenFor = (url) => `${Buffer.from(url).toString('base64url')}.${mac(url)}`;
/** The address inside a token, or a 400 error. */
export function urlOfToken(token) {
  const [data, sig] = String(token || '').split('.');
  let url = '';
  try {
    url = Buffer.from(data || '', 'base64url').toString('utf8');
  } catch {
    /* not base64 */
  }
  if (!url || !sig || sig.length !== 32 || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(mac(url)))) throw badRequest('This image is not one of the images found.');
  return url;
}

// ------------------------------------------------------------- web pages --

const IMAGE_EXT = /\.(jpe?g|jfif|png|webp|avif)(?=$|[?#])/i;
/** Not photos: icons, logos, tracking pixels, emoji, placeholders, avatars of the platform. */
const NOT_A_PHOTO = /(^|[\/_.-])(logo|icon|icons|sprite|favicon|emoji|pixel|blank|placeholder|spinner|loader|avatar|badge|flag|arrow|button|bg-pattern)([\/_.-]|\d|$)|\/static\/|\/rsrc\.php\/|gravatar\.com|\/tr\?|1x1|data:/i;

/** The same photo in another size (…-300x200.jpg, ?w=300, =s400): one key for all, so it is listed once. */
const sizeless = (u) => u.replace(/-\d{2,4}x\d{2,4}(?=\.\w+$|\.\w+\?)/, '').replace(/[?#].*$/, '').replace(/=[swh]\d+(-[a-z0-9-]+)?$/i, '').toLowerCase();
/** The largest version named in a srcset. */
function largestOfSrcset(srcset) {
  let best = null;
  for (const part of String(srcset || '').split(',')) {
    const [u, size] = part.trim().split(/\s+/);
    const n = parseFloat(size) || 1;
    if (u && (!best || n > best.n)) best = { u, n };
  }
  return best?.u || null;
}

/**
 * The photos a public web page shows: [{ url, width, height }], largest version of each, most likely
 * photos first (the page image, then the images of the content in order). Icons and logos are left out.
 */
export function imagesOfPage(html, base) {
  const root = parse(html);
  undoLazyLoading(root, base);
  const abs = (u) => {
    try {
      const url = new URL(String(u).replace(/&amp;/g, '&'), base);
      return /^https?:$/.test(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  };
  const found = new Map();
  const add = (u, width = null, height = null) => {
    const url = abs(u);
    if (!url || NOT_A_PHOTO.test(url) || /\.(svg|gif|ico)(\?|#|$)/i.test(url)) return;
    // Known to be small: an icon or a thumbnail of the interface
    if ((width && width < 200) || (height && height < 150)) return;
    const key = sizeless(url);
    if (!found.has(key)) found.set(key, { url, width, height });
  };
  for (const meta of root.querySelectorAll('meta[property="og:image"], meta[property="og:image:secure_url"], meta[name="twitter:image"], link[rel="image_src"]')) add(meta.getAttribute('content') || meta.getAttribute('href'));
  for (const img of root.querySelectorAll('img')) {
    const width = parseInt(img.getAttribute('width'), 10) || null;
    const height = parseInt(img.getAttribute('height'), 10) || null;
    add(largestOfSrcset(img.getAttribute('srcset')) || img.getAttribute('src'), width, height);
  }
  for (const source of root.querySelectorAll('picture source')) add(largestOfSrcset(source.getAttribute('srcset')));
  // Photos opened by a link (galleries with lightbox) and background photos
  for (const a of root.querySelectorAll('a[href]')) if (IMAGE_EXT.test(a.getAttribute('href'))) add(a.getAttribute('href'));
  for (const el of root.querySelectorAll('[style]')) for (const m of el.getAttribute('style').matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)) add(m[1]);
  // Addresses of image files written in the data of the page (galleries filled by a script)
  for (const m of html.matchAll(/https?:\\?\/\\?\/[^"'\s<>\\]+(?:\\\/[^"'\s<>\\]+)*\.(?:jpe?g|png|webp)(?:\?(?:[^"'\s<>\\]|\\u0026|\\\/)*)?/gi)) add(m[0].replace(/\\\//g, '/').replace(/\\u0026/gi, '&'));
  return [...found.values()].slice(0, MAX_FOUND);
}

/** Pages that show their photos only to logged-in users. */
const LOGIN_ONLY = /(^|\.)(instagram\.com|facebook\.com|fb\.com)$/i;

/**
 * The photos of a public web page. @returns {{ page, images: [{ url, width, height }], loginOnly: boolean }}
 * loginOnly: the page belongs to a network that hides its photos from visitors without account.
 */
export async function scanPage(address, opts = {}) {
  const start = referenceUrl(address);
  const res = await safeGet(start, { ...opts, maxBytes: MAX_PAGE, accept: 'text/html,application/xhtml+xml' });
  const host = res.url.hostname;
  // An image address typed directly
  if (/^image\//i.test(res.type)) return { page: res.url.href, images: [{ url: res.url.href, width: null, height: null }], loginOnly: false };
  return { page: res.url.href, images: imagesOfPage(res.text, res.url.href), loginOnly: LOGIN_ONLY.test(host) };
}

// ----------------------------------------------------------- Google Maps --

/** Is the photo of Google Places (fetched with the key of the app, never shown to the browser)? */
export const isPlacesPhoto = (url) => url.startsWith(PLACES) && /\/photos\/[^/?]+\/media(\?|$)/.test(url);

/**
 * The photos of the Google Maps listing of a business (Places API, Text Search with the photos field).
 * query: what identifies the business ("<name>, <address>"). key: GOOGLE_MAPS_API_KEY.
 * @returns {{ place: string, images: [{ url, width, height }] }} url without the key (added when fetched)
 */
export async function scanGooglePlace(query, key, { fetchImpl = fetch, language = 'it' } = {}) {
  if (!key) throw badRequest('Google Maps photos need a Google key: add GOOGLE_MAPS_API_KEY to backend/.env on the server (Google Cloud → Places API (New); Google gives a free monthly allowance).');
  if (!String(query || '').trim()) throw badRequest('Enter the name and the address of the business in the site data first.');
  let res;
  try {
    res = await fetchImpl(`${PLACES}places:searchText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.photos' },
      body: JSON.stringify({ textQuery: String(query).slice(0, 300), languageCode: language, pageSize: 1 }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw badRequest('Google Maps did not answer. Try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw badRequest(`Google Maps refused the request: ${data?.error?.message || res.status}. Check the key and that "Places API (New)" is enabled for it.`);
  const place = data.places?.[0];
  if (!place) throw badRequest('This business was not found on Google Maps: check its name and address in the site data.');
  const images = (place.photos || []).filter((p) => /^places\/[^/]+\/photos\/[^/]+$/.test(p.name || '')).map((p) => ({ url: `${PLACES}${p.name}/media?maxWidthPx=${Math.min(2400, Number(p.widthPx) || 1600)}`, width: Number(p.widthPx) || null, height: Number(p.heightPx) || null }));
  return { place: [place.displayName?.text, place.formattedAddress].filter(Boolean).join(' – '), images };
}

// -------------------------------------------------------------- download --

/** A found image as bytes: { buffer, type, name }. Public hosts only; Places photos with the key of the app. */
export async function fetchFound(url, { maxBytes, key = '', fetchImpl = fetch, lookup } = {}) {
  let target = url;
  if (isPlacesPhoto(url)) {
    if (!key) throw badRequest('Google Maps photos need the Google key of the app.');
    target = `${url}${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}`;
  }
  const res = await safeGet(new URL(target), { maxBytes, fetchImpl, ...(lookup ? { lookup } : {}), accept: 'image/avif,image/webp,image/*', binary: true });
  if (!/^image\//i.test(res.type) && !/octet-stream/i.test(res.type)) throw badRequest('The address is not an image.');
  if (res.truncated) throw badRequest('The image is too large.');
  const base = path.basename(res.url.pathname).replace(/\.[^.]*$/, '').replace(/[^\w-]+/g, '-').slice(0, 60) || 'foto';
  const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/avif': '.avif', 'image/gif': '.gif' }[res.type.split(';')[0].trim().toLowerCase()] || (path.extname(res.url.pathname).match(/^\.(jpe?g|png|webp|avif|gif|jfif)$/i)?.[0] || '.jpg');
  return { buffer: res.buffer, type: res.type.split(';')[0].trim() || 'image/jpeg', name: `${base}${ext}` };
}
