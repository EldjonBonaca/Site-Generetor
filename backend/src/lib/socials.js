/**
 * Social networks of a project (all optional): one URL column each on the project. The filled ones
 * become social icons in the footer of the site (template builder), replace the demo links of the
 * social icons of a Template Kit (the networks the project does not have are removed), and are
 * given to Yoast SEO (organization profiles).
 */

/** key = project column. icon: Font Awesome 5 brands (Elementor "fa-brands" library). */
export const SOCIALS = [
  { key: 'facebook_url', name: 'Facebook', icon: 'fab fa-facebook-f', host: /(^|\.)(facebook\.com|fb\.com|fb\.me)$/i },
  { key: 'instagram_url', name: 'Instagram', icon: 'fab fa-instagram', host: /(^|\.)(instagram\.com|instagr\.am)$/i },
  { key: 'linkedin_url', name: 'LinkedIn', icon: 'fab fa-linkedin-in', host: /(^|\.)(linkedin\.com|lnkd\.in)$/i },
  { key: 'youtube_url', name: 'YouTube', icon: 'fab fa-youtube', host: /(^|\.)(youtube\.com|youtu\.be)$/i },
  { key: 'tiktok_url', name: 'TikTok', icon: 'fab fa-tiktok', host: /(^|\.)tiktok\.com$/i },
  { key: 'x_url', name: 'X (Twitter)', icon: 'fab fa-twitter', host: /(^|\.)(twitter\.com|x\.com)$/i },
];

export const SOCIAL_KEYS = SOCIALS.map((s) => s.key);

/** An http(s) URL (same check as the site data form). */
export function isSocialUrl(value) {
  try {
    return /^https?:$/.test(new URL(String(value || '').trim()).protocol);
  } catch {
    return false;
  }
}

/** The filled and valid social networks of a project: [{ key, name, icon, url }]. */
export function socialLinks(project) {
  return SOCIALS.filter((s) => isSocialUrl(project?.[s.key])).map(({ key, name, icon }) => ({ key, name, icon, url: String(project[key]).trim() }));
}

/** Network of a link (by its host), or null: { key, name, icon }. */
export function socialOf(url) {
  let host;
  try {
    host = new URL(String(url || '').trim()).hostname;
  } catch {
    return null;
  }
  return SOCIALS.find((s) => s.host.test(host)) || null;
}
