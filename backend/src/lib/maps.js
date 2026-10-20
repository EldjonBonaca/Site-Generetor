/**
 * Google map of the Contact page: the listing of the Google Business Profile of the site when its
 * link is set, else the address. Maps are embedded without an API key (iframe "output=embed").
 *
 * Accepted links (all optional, anything else falls back to "site name, address"):
 *  - an embed link or the whole <iframe> of Google Maps "Share → Embed a map" (used as it is);
 *  - a place link (google.com/maps/place/<name>/@lat,lng…): the name and position of the listing;
 *  - a search link (?q=… / ?query=…);
 *  - short links (maps.app.goo.gl, goo.gl/maps, g.page, g.co, share.google): expanded when the
 *    project is saved (resolveMapsLink), the expanded link is stored in projects.map_resolved_url.
 */

const SHORT_HOSTS = /^(maps\.app\.goo\.gl|goo\.gl|g\.page|g\.co|share\.google)$/i;
// google.com, google.it, google.co.uk, google.com.au… (not look-alikes such as google.example.com)
const GOOGLE_HOST = /(^|\.)google\.(com|co|[a-z]{2})(\.[a-z]{2})?$|(^|\.)goo\.gl$|^g\.page$|^g\.co$|^share\.google$/i;
// Addresses requested while a short link is expanded
const FETCH_HOST = /^(maps\.app\.goo\.gl|goo\.gl|g\.page|g\.co|share\.google|((www|maps|consent)\.)?google\.com)$/i;
const EMBED_SRC = /^https:\/\/(www\.)?google\.(com|co|[a-z]{2})(\.[a-z]{2})?\/maps\/embed\?pb=[^"'<>\s]+$/i;

/** The link inside a pasted <iframe …> snippet, or the text itself. */
function linkOf(input) {
  const s = String(input || '').trim();
  const src = s.match(/<iframe[^>]*\ssrc\s*=\s*["']([^"']+)["']/i);
  return (src ? src[1] : s).replace(/&amp;/g, '&');
}

function toUrl(input) {
  const s = linkOf(input);
  if (!/^https?:\/\//i.test(s)) return null;
  try {
    return new URL(s);
  } catch {
    return null;
  }
}

/** Is it a link (or an embed snippet) of Google Maps / Google Business Profile? */
export const isGoogleMapsLink = (input) => {
  const url = toUrl(input);
  return Boolean(url && GOOGLE_HOST.test(url.hostname));
};

/** Is it a short link that must be expanded to know the place? */
export const isShortMapsLink = (input) => {
  const url = toUrl(input);
  // goo.gl is also a generic link shortener: only its /maps/ links
  return Boolean(url && SHORT_HOSTS.test(url.hostname) && (url.hostname.toLowerCase() !== 'goo.gl' || /^\/maps\//i.test(url.pathname)));
};

/**
 * Expand a short link by following its redirects (the Google cookie-consent page is skipped).
 * @returns {Promise<string>} the expanded link, '' when it is not a short link or cannot be expanded
 */
export async function resolveMapsLink(input, { timeoutMs = 6000, fetchImpl = globalThis.fetch } = {}) {
  if (!isShortMapsLink(input)) return '';
  let current = toUrl(input).href;
  const signal = AbortSignal.timeout(timeoutMs); // for the whole chain of redirects
  try {
    for (let hop = 0; hop < 8; hop++) {
      // Only Google addresses are requested (a redirect elsewhere is never followed)
      if (!FETCH_HOST.test(new URL(current).hostname) || !/^https?:$/.test(new URL(current).protocol)) break;
      const res = await fetchImpl(current, { redirect: 'manual', signal, headers: { 'user-agent': 'Mozilla/5.0 (site generator)' } });
      const location = res.headers.get('location');
      if (res.status < 300 || res.status >= 400 || !location) break;
      let next = new URL(location, current);
      // EU: Google asks for cookie consent first, the place is in its "continue" parameter
      if (/^consent\./i.test(next.hostname) && next.searchParams.get('continue')) next = new URL(next.searchParams.get('continue'));
      current = next.href;
      if (!SHORT_HOSTS.test(next.hostname) && /\/maps/.test(next.pathname)) break;
    }
  } catch {
    // Offline / timeout: the map falls back to the name and address of the business
  }
  return current !== toUrl(input).href ? current : '';
}

const decode = (s) => {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' ')).trim();
  } catch {
    return s.replace(/\+/g, ' ').trim();
  }
};

/**
 * What a Google Maps link tells about the place.
 * @returns {{ embed?: string, name?: string, query?: string, lat?: string, lng?: string } | null}
 */
export function parseMapsLink(input) {
  const url = toUrl(input);
  if (!url || !GOOGLE_HOST.test(url.hostname)) return null;
  const href = url.href;
  if (EMBED_SRC.test(href)) return { embed: href };
  const out = {};
  const place = url.pathname.match(/\/maps\/place\/([^/@]+)/);
  if (place) out.name = decode(place[1]);
  // The pin of the place (!3d…!4d…) is more precise than the center of the view (@lat,lng)
  const pin = href.match(/!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/) || url.pathname.match(/@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
  if (pin) [out.lat, out.lng] = [pin[1], pin[2]];
  const q = url.searchParams.get('q') || url.searchParams.get('query') || url.searchParams.get('destination');
  if (q && !/^https?:/i.test(q)) out.query = q.trim();
  return out;
}

/**
 * The map of the site.
 * @param {object} p  { businessUrl, resolvedUrl, siteName, address }
 * @returns {{ src: string, query: string, fromListing: boolean }}
 *   src = iframe link; query = text to search on the map (Elementor "Google Maps" widget)
 */
export function siteMap({ businessUrl = '', resolvedUrl = '', siteName = '', address = '' }) {
  const addr = String(address || '').replace(/\s*\n+\s*/g, ', ').trim();
  const name = String(siteName || '').trim();
  const join = (...parts) => parts.filter(Boolean).join(', ');
  const embed = (query, pin) => `https://www.google.com/maps?q=${encodeURIComponent(query)}${pin ? `&ll=${pin.lat},${pin.lng}&z=16` : ''}&output=embed`;
  if (!String(businessUrl || '').trim()) return { src: addr ? embed(addr) : '', query: addr, fromListing: false };

  const info = parseMapsLink(resolvedUrl) || parseMapsLink(businessUrl) || {};
  const query = info.name ? join(info.name, addr) : info.query || join(name, addr);
  if (info.embed) return { src: info.embed, query, fromListing: true };
  return { src: query ? embed(query, info.lat ? info : null) : '', query, fromListing: true };
}

/** The iframe of a map (same markup everywhere on the site). */
export const mapIframe = (src) =>
  `<iframe src="${src}" width="100%" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
