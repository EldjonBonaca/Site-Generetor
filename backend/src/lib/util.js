/** Small shared helpers: HTTP errors, slugs, validation. */

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new HttpError(400, msg, details);
export const notFound = (what = 'Resource') => new HttpError(404, `${what} not found`);

/** URL/file-name friendly slug: "Boiler Repair & Co." -> "boiler-repair-co" (accents removed). */
export function slugify(input, maxLen = 80) {
  return String(input || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen)
    .replace(/-+$/g, '');
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Permissive international phone: digits, spaces, dots, dashes, parentheses, optional leading +, 6–20 digits.
export const PHONE_RE = /^\+?[\d\s().-]{6,25}$/;

export function isValidEmail(v) {
  return EMAIL_RE.test(String(v || '').trim());
}

export function isValidPhone(v) {
  const s = String(v || '').trim();
  const digits = s.replace(/\D/g, '');
  return PHONE_RE.test(s) && digits.length >= 6 && digits.length <= 20;
}

/** Phone number as used in tel: links ("+39 06 1234 567" -> "+39061234567"). */
export function telHref(phone) {
  const s = String(phone || '').trim();
  return (s.startsWith('+') ? '+' : '') + s.replace(/\D/g, '');
}

/** Pick only the allowed keys from an object (used to whitelist update payloads). */
export function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj && Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
  return out;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Remove HTML tags (used for previews, content.md and length estimates). */
export function stripHtml(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const LANGUAGES = {
  en: 'English',
  it: 'Italian',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  nl: 'Dutch',
  sq: 'Albanian',
  pl: 'Polish',
  ro: 'Romanian',
  el: 'Greek',
  sv: 'Swedish',
};
