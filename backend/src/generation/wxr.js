/**
 * WordPress eXtended RSS (WXR 1.2) file for Tools → Import → WordPress:
 *  - category "Servizi" + one post per service (title, slug, content, excerpt, featured image)
 *  - featured images as attachments (downloaded by the importer from the images base URL)
 *  - the site pages (title + slug, content built with the Elementor templates)
 *  - the navigation menu with the main pages
 */
import { sanitizeHtml } from '../elementor/apply.js';
import { slugify } from '../lib/util.js';

const cdata = (s) => `<![CDATA[${String(s ?? '').replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const meta = (key, value) => `\t\t<wp:postmeta>\n\t\t\t<wp:meta_key>${cdata(key)}</wp:meta_key>\n\t\t\t<wp:meta_value>${cdata(value)}</wp:meta_value>\n\t\t</wp:postmeta>`;

function item({ id, title, slug, type, status = 'publish', content = '', excerpt = '', date, parent = 0, order = 0, extra = [], metas = [], guid }) {
  return `\t<item>
\t\t<title>${esc(title)}</title>
\t\t<dc:creator>${cdata('admin')}</dc:creator>
\t\t<guid isPermaLink="false">${esc(guid || `generated-${type}-${id}`)}</guid>
\t\t<description></description>
\t\t<content:encoded>${cdata(content)}</content:encoded>
\t\t<excerpt:encoded>${cdata(excerpt)}</excerpt:encoded>
\t\t<wp:post_id>${id}</wp:post_id>
\t\t<wp:post_date>${cdata(date)}</wp:post_date>
\t\t<wp:post_date_gmt>${cdata(date)}</wp:post_date_gmt>
\t\t<wp:comment_status>${cdata('closed')}</wp:comment_status>
\t\t<wp:ping_status>${cdata('closed')}</wp:ping_status>
\t\t<wp:post_name>${cdata(slug)}</wp:post_name>
\t\t<wp:status>${cdata(status)}</wp:status>
\t\t<wp:post_parent>${parent}</wp:post_parent>
\t\t<wp:menu_order>${order}</wp:menu_order>
\t\t<wp:post_type>${cdata(type)}</wp:post_type>
\t\t<wp:post_password>${cdata('')}</wp:post_password>
\t\t<wp:is_sticky>0</wp:is_sticky>
${[...extra, ...metas].join('\n')}
\t</item>`;
}

/**
 * @param {object} p
 *   site: { name, url, language }
 *   category: { name, slug }
 *   menu: { name, slug }
 *   pages: [{ title, slug, role }]                         (site pages, menu order)
 *   posts: [{ title, slug, content, excerpt, image: { url, name, alt } | null }]
 *   menuRoles: roles included in the menu
 */
export function buildWxr({ site, category, menu, pages, posts, menuRoles = ['home', 'about', 'services', 'gallery', 'contact'] }) {
  const now = new Date();
  const date = now.toISOString().slice(0, 19).replace('T', ' ');
  const items = [];
  let attachmentId = 1000;
  let postId = 3000;
  let pageId = 2000;
  let navId = 4000;

  // Attachments (featured images)
  const attachmentFor = new Map();
  for (const p of posts) {
    if (!p.image || attachmentFor.has(p.image.url)) continue;
    const id = ++attachmentId;
    attachmentFor.set(p.image.url, id);
    items.push(
      item({
        id,
        title: p.image.name.replace(/\.[^.]+$/, ''),
        slug: slugify(p.image.name.replace(/\.[^.]+$/, '')),
        type: 'attachment',
        status: 'inherit',
        date,
        guid: p.image.url,
        extra: [`\t\t<wp:attachment_url>${cdata(p.image.url)}</wp:attachment_url>`],
        metas: p.image.alt ? [meta('_wp_attachment_image_alt', p.image.alt)] : [],
      })
    );
  }

  // Pages
  const pageIds = new Map();
  for (const pg of pages) {
    const id = ++pageId;
    pageIds.set(pg, id);
    items.push(item({ id, title: pg.title, slug: pg.slug || slugify(pg.title), type: 'page', date, metas: [meta('_wp_page_template', 'elementor_header_footer')] }));
  }

  // Posts (services)
  for (const p of posts) {
    const id = ++postId;
    const metas = [];
    const att = p.image && attachmentFor.get(p.image.url);
    if (att) metas.push(meta('_thumbnail_id', att));
    items.push(
      item({
        id,
        title: p.title,
        slug: p.slug,
        type: 'post',
        content: sanitizeHtml(p.content || ''),
        excerpt: p.excerpt || '',
        date,
        extra: [`\t\t<category domain="category" nicename="${esc(category.slug)}">${cdata(category.name)}</category>`],
        metas,
      })
    );
  }

  // Navigation menu
  let order = 0;
  for (const pg of pages.filter((x) => menuRoles.includes(x.role))) {
    const id = ++navId;
    items.push(
      item({
        id,
        title: '',
        slug: String(id),
        type: 'nav_menu_item',
        date,
        order: ++order,
        extra: [`\t\t<category domain="nav_menu" nicename="${esc(menu.slug)}">${cdata(menu.name)}</category>`],
        metas: [
          meta('_menu_item_type', 'post_type'),
          meta('_menu_item_menu_item_parent', '0'),
          meta('_menu_item_object_id', String(pageIds.get(pg))),
          meta('_menu_item_object', 'page'),
          meta('_menu_item_target', ''),
          meta('_menu_item_classes', 'a:1:{i:0;s:0:"";}'),
          meta('_menu_item_xfn', ''),
          meta('_menu_item_url', ''),
        ],
      })
    );
  }

  return `<?xml version="1.0" encoding="UTF-8" ?>
<!-- Generated by Elementor Site Generator. Import with Tools > Import > WordPress. -->
<rss version="2.0"
\txmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"
\txmlns:content="http://purl.org/rss/1.0/modules/content/"
\txmlns:wfw="http://wellformedweb.org/CommentAPI/"
\txmlns:dc="http://purl.org/dc/elements/1.1/"
\txmlns:wp="http://wordpress.org/export/1.2/"
>
<channel>
\t<title>${esc(site.name)}</title>
\t<link>${esc(site.url)}</link>
\t<description></description>
\t<pubDate>${now.toUTCString()}</pubDate>
\t<language>${esc(site.language)}</language>
\t<wp:wxr_version>1.2</wp:wxr_version>
\t<wp:base_site_url>${esc(site.url)}</wp:base_site_url>
\t<wp:base_blog_url>${esc(site.url)}</wp:base_blog_url>
\t<wp:author><wp:author_id>1</wp:author_id><wp:author_login>${cdata('admin')}</wp:author_login><wp:author_email>${cdata('')}</wp:author_email><wp:author_display_name>${cdata('admin')}</wp:author_display_name><wp:author_first_name>${cdata('')}</wp:author_first_name><wp:author_last_name>${cdata('')}</wp:author_last_name></wp:author>
\t<wp:category><wp:term_id>900</wp:term_id><wp:category_nicename>${cdata(category.slug)}</wp:category_nicename><wp:category_parent>${cdata('')}</wp:category_parent><wp:cat_name>${cdata(category.name)}</wp:cat_name></wp:category>
\t<wp:term><wp:term_id>901</wp:term_id><wp:term_taxonomy>${cdata('nav_menu')}</wp:term_taxonomy><wp:term_slug>${cdata(menu.slug)}</wp:term_slug><wp:term_parent>${cdata('')}</wp:term_parent><wp:term_name>${cdata(menu.name)}</wp:term_name></wp:term>
\t<generator>Elementor Site Generator</generator>
${items.join('\n')}
</channel>
</rss>
`;
}
