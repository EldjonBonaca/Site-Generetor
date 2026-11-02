/**
 * SEO score of a page computed with the checks of the free Yoast SEO analysis, on the final content of
 * the page (its Elementor document turned into the HTML Elementor saves as the post content):
 * keyphrase in the introduction, length and density of the keyphrase, meta description (keyphrase and
 * length), images and their ALT, text length, SEO title (keyphrase at the beginning, width), slug,
 * subheadings, internal / outbound links, a single H1, keyphrase used by another page, competing links.
 *
 * Each check scores 9 (good), 6 (ok) or 3 (bad) — text length can go below zero — and the score is
 * their sum over 9 × the number of checks, out of 100: green from 71, orange from 41 (like Yoast).
 * The WordPress plugin saves it as the Yoast score of the page (shown in the lists of pages /
 * articles); Yoast computes it again in the browser when the page is opened in the editor, so it
 * stays an estimate (Yoast Premium-only checks, e.g. word forms, are not done).
 */

const FUNCTION_WORDS = new Set(
  (
    // Italian
    'il lo la i gli le un uno una di a da in con su per tra fra e ed o od ma che del dello della dei degli delle al allo alla ai agli alle dal dallo dalla dai dagli dalle nel nello nella nei negli nelle sul sullo sulla sui sugli sulle col coi è sono non si ci vi ne' +
    // English
    ' the a an of in on at for to and or with by from is are be as that this your our'
  ).split(' ')
);

/** Lowercase words without accents and punctuation. */
export function words(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

const contentWords = (keyphrase) => {
  const all = words(keyphrase);
  const content = all.filter((w) => !FUNCTION_WORDS.has(w));
  return content.length ? content : all;
};

const stripTags = (html) =>
  String(html || '')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#?\w+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const sentences = (text) => String(text).split(/(?<=[.!?…])\s+|\n+/).filter((s) => s.trim());
/** Every content word of the keyphrase is in the text. */
const hasAll = (text, kw) => {
  const set = new Set(words(text));
  return kw.every((w) => set.has(w));
};
const escapeAttr = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escapeText = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Text-like settings of widgets of addons (Template Kits), in the order they usually render. */
const TEXT_KEYS = /^(title|title_text|heading|sub_?title|description|description_text|text|content|editor|ekit_heading_title|ekit_heading_sub_title|ekit_heading_extra_title|testimonial_content|item_description)$/;

/**
 * The HTML Elementor saves as the post content of a document (approximation used by the checks):
 * headings, texts, buttons and links, images with their ALT, icon boxes, lists, reviews, accordions,
 * galleries; the scripts and styles of HTML widgets are left out.
 */
export function docToHtml(doc) {
  const out = [];
  const link = (l, inner) => (l && typeof l.url === 'string' && l.url ? `<a href="${escapeAttr(l.url)}">${inner}</a>` : inner);
  const img = (i) => (i && typeof i === 'object' && i.url ? `<img src="${escapeAttr(i.url)}" alt="${escapeAttr(i.alt || '')}">` : '');
  const walk = (list) => {
    for (const el of list || []) {
      const s = el.settings || {};
      if (el.elType === 'widget') {
        const t = el.widgetType;
        if (t === 'heading' || t === 'theme-post-title') {
          const tag = /^(h[1-6]|p|div|span)$/.test(s.header_size) ? s.header_size : t === 'theme-post-title' ? 'h1' : 'h2';
          out.push(`<${tag}>${link(s.link, s.title || '')}</${tag}>`);
        } else if (t === 'text-editor') out.push(String(s.editor || ''));
        else if (t === 'button') out.push(`<p>${link(s.link, escapeText(s.text || ''))}</p>`);
        else if (t === 'image') out.push(link(s.link_to === 'custom' ? s.link : null, img(s.image)));
        else if (t === 'icon-box' || t === 'image-box') out.push(`${t === 'image-box' ? img(s.image) : ''}<h3>${link(s.link, s.title_text || '')}</h3><p>${s.description_text || ''}</p>`);
        else if (t === 'icon-list') for (const it of s.icon_list || []) out.push(`<p>${link(it.link, escapeText(it.text || ''))}</p>`);
        else if (t === 'testimonial') out.push(`<p>${s.testimonial_content || ''}</p><p>${escapeText(s.testimonial_name || '')}</p>`);
        else if (t === 'accordion' || t === 'toggle') for (const tab of s.tabs || []) out.push(`<p><strong>${escapeText(tab.tab_title || '')}</strong></p>${tab.tab_content || ''}`);
        else if (t === 'image-carousel') for (const i of s.carousel || []) out.push(img(i));
        else if (t === 'image-gallery') for (const i of s.wp_gallery || []) out.push(img(i));
        else if (t === 'html') out.push(String(s.html || '').replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ''));
        else if (t === 'shortcode' || t === 'star-rating' || t === 'icon' || t === 'divider' || t === 'spacer' || t === 'social-icons') continue;
        else {
          // Widgets of addons: their texts, and their main image
          for (const [k, v] of Object.entries(s)) if (TEXT_KEYS.test(k) && typeof v === 'string' && v.trim()) out.push(/^\s*</.test(v) ? v : `<p>${escapeText(v)}</p>`);
          if (s.image?.url) out.push(img(s.image));
        }
      }
      walk(el.elements);
    }
  };
  walk(doc?.content);
  return out.filter(Boolean).join('\n');
}

const result = (id, score, text) => ({ id, score, text });

/**
 * @param {object} p
 *   html: content of the page (docToHtml), keyphrase, title (SEO title), description (meta description),
 *   slug, siteHost (to tell internal links), otherKeyphrases (of the other pages / articles)
 * @returns {{ score: number, rating: 'good'|'ok'|'bad'|'none', checks: { id, score, text }[] }}
 */
export function seoScore({ html, keyphrase = '', title = '', description = '', slug = '', siteHost = '', otherKeyphrases = [] }) {
  const kw = contentWords(keyphrase);
  if (!kw.length) return { score: 0, rating: 'none', checks: [result('keyphrase', 0, 'No focus keyphrase.')] };
  const text = stripTags(html);
  const allWords = words(text);
  const checks = [];

  // Introduction: the first paragraph of text
  const firstP = stripTags((String(html).match(/<p[^>]*>([\s\S]*?)<\/p>/i) || [])[1] || '');
  if (sentences(firstP).some((s) => hasAll(s, kw))) checks.push(result('introduction', 9, 'Keyphrase in the first paragraph.'));
  else if (hasAll(firstP, kw)) checks.push(result('introduction', 6, 'Keyphrase words in the first paragraph, not in one sentence.'));
  else checks.push(result('introduction', 3, 'Keyphrase missing from the first paragraph.'));

  // Keyphrase length
  checks.push(kw.length <= 4 ? result('keyphraseLength', 9, 'Keyphrase length good.') : kw.length <= 8 ? result('keyphraseLength', 6, 'Keyphrase a bit long.') : result('keyphraseLength', 3, 'Keyphrase too long.'));

  // Density: sentences containing the whole keyphrase, per 100 words (texts of 100 words or more)
  if (allWords.length >= 100) {
    const found = sentences(text).filter((s) => hasAll(s, kw)).length;
    const density = (found / allWords.length) * 100;
    const max = kw.length <= 2 ? 3 : 3.5;
    if (found < 2 && density < 0.5) checks.push(result('density', 4, `Keyphrase found ${found} time(s): too few.`));
    else if (density > max + 0.5) checks.push(result('density', -10, `Keyphrase density ${density.toFixed(1)}%: too high.`));
    else checks.push(result('density', 9, `Keyphrase found ${found} times: good.`));
  }

  // Meta description
  const metaFound = sentences(description).filter((s) => hasAll(s, kw)).length;
  checks.push(metaFound >= 1 && metaFound <= 2 ? result('metaKeyphrase', 9, 'Keyphrase in the meta description.') : result('metaKeyphrase', 3, 'Keyphrase missing from the meta description.'));
  const len = description.trim().length;
  checks.push(!len ? result('metaLength', 1, 'No meta description.') : len < 120 ? result('metaLength', 6, `Meta description short (${len}).`) : len > 156 ? result('metaLength', 6, `Meta description long (${len}).`) : result('metaLength', 9, 'Meta description length good.'));

  // Images and their ALT
  const alts = [...String(html).matchAll(/<img[^>]*\salt="([^"]*)"/gi)].map((m) => m[1]);
  const images = (String(html).match(/<img\b/gi) || []).length;
  if (!images) checks.push(result('images', 3, 'No images.'));
  else {
    const withKw = alts.filter((a) => hasAll(a, kw)).length;
    const share = withKw / images;
    const good = images < 5 ? withKw >= 1 : share >= 0.3 && share <= 0.7;
    checks.push(good ? result('images', 9, 'Images with the keyphrase in the ALT.') : result('images', 6, 'Images without the keyphrase in the ALT.'));
  }

  // Text length
  const n = allWords.length;
  checks.push(n >= 300 ? result('textLength', 9, `${n} words.`) : n >= 250 ? result('textLength', 6, `${n} words.`) : n >= 200 ? result('textLength', 3, `${n} words.`) : n >= 100 ? result('textLength', -10, `${n} words: too few.`) : result('textLength', -20, `${n} words: far too few.`));

  // SEO title: keyphrase at the beginning, width (~10 px per character, 600 px)
  const t = words(title).join(' ');
  const exact = words(keyphrase).join(' ');
  if (exact && t.startsWith(exact)) checks.push(result('titleKeyphrase', 9, 'SEO title starts with the keyphrase.'));
  else if (exact && t.includes(exact)) checks.push(result('titleKeyphrase', 6, 'Keyphrase in the SEO title, not at the beginning.'));
  else checks.push(result('titleKeyphrase', hasAll(title, kw) ? 6 : 2, 'Exact keyphrase missing from the SEO title.'));
  const width = title.length * 10;
  checks.push(!title ? result('titleWidth', 1, 'No SEO title.') : width > 600 ? result('titleWidth', 3, 'SEO title too long.') : width < 400 ? result('titleWidth', 6, 'SEO title short.') : result('titleWidth', 9, 'SEO title width good.'));

  // Slug: all, or more than half, of the keyphrase words
  if (slug) {
    const slugWords = new Set(words(slug.replace(/-/g, ' ')));
    const inSlug = kw.filter((w) => slugWords.has(w)).length;
    checks.push(inSlug === kw.length || inSlug > kw.length / 2 ? result('slug', 9, 'Keyphrase in the slug.') : result('slug', 6, 'Keyphrase (partly) missing from the slug.'));
  }

  // Subheadings (h2, h3) reflecting the keyphrase: more than half of its words, in 30–75% of them
  const subs = [...String(html).matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi)].map((m) => stripTags(m[1]));
  if (subs.length) {
    const reflect = subs.filter((h) => {
      const set = new Set(words(h));
      return kw.filter((w) => set.has(w)).length > kw.length / 2;
    }).length;
    const share = reflect / subs.length;
    if ((subs.length === 1 && reflect === 1) || (share >= 0.3 && share <= 0.75)) checks.push(result('subheadings', 9, `${reflect} of ${subs.length} subheadings reflect the keyphrase.`));
    else checks.push(result('subheadings', 3, `${reflect} of ${subs.length} subheadings reflect the keyphrase.`));
  }

  // Links
  const hrefs = [...String(html).matchAll(/<a\s[^>]*href="([^"]+)"/gi)].map((m) => m[1]);
  const isInternal = (h) => h.startsWith('/') || h.startsWith('#') || (siteHost && h.includes(siteHost)) || h.startsWith('esg-');
  const internal = hrefs.filter((h) => isInternal(h) && !/^(tel|mailto):/i.test(h)).length;
  const outbound = hrefs.filter((h) => /^https?:\/\//i.test(h) && !isInternal(h)).length;
  checks.push(internal ? result('internalLinks', 9, `${internal} internal link(s).`) : result('internalLinks', 3, 'No internal links.'));
  checks.push(outbound ? result('outboundLinks', 9, `${outbound} outbound link(s).`) : result('outboundLinks', 3, 'No outbound links.'));

  // A single H1, keyphrase not used elsewhere, no link with the keyphrase as text
  if ((String(html).match(/<h1\b/gi) || []).length > 1) checks.push(result('singleH1', 1, 'More than one H1.'));
  const used = otherKeyphrases.filter((k) => words(k).join(' ') === exact).length;
  checks.push(used === 0 ? result('previouslyUsed', 9, 'Keyphrase not used elsewhere.') : result('previouslyUsed', used === 1 ? 6 : 1, 'Keyphrase already used by another page.'));
  const competing = [...String(html).matchAll(/<a\s[^>]*>([\s\S]*?)<\/a>/gi)].some((m) => words(stripTags(m[1])).join(' ') === exact);
  if (competing) checks.push(result('competingLinks', 2, 'A link has the keyphrase as text.'));

  const total = checks.reduce((sum, c) => sum + c.score, 0);
  const score = Math.max(0, Math.min(100, Math.round((total / (checks.length * 9)) * 100)));
  return { score, rating: score >= 71 ? 'good' : score >= 41 ? 'ok' : 'bad', checks };
}
