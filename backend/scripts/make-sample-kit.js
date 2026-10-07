/**
 * Builds samples/sample-elementor-kit.zip: a minimal but realistic Elementor
 * Template Kit (Envato format) used to test the whole flow.
 *
 *   npm run sample-kit
 *
 * Demo values the generator should replace: brand "Plumbix", phone "+1 (555) 010-2030",
 * email "hello@plumbix-demo.com", address "123 Demo Street, Springfield".
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../../samples/sample-elementor-kit.zip');
const IMG = 'https://demo.example.com/wp-content/uploads/2024/01/';

const id = () => crypto.randomBytes(4).toString('hex').slice(0, 7);
const img = (name, n) => ({ url: IMG + name, id: n, size: '', alt: '', source: 'library' });
const link = (url) => ({ url, is_external: '', nofollow: '', custom_attributes: '' });

// --- element builders ------------------------------------------------------
const widget = (widgetType, settings) => ({ id: id(), elType: 'widget', settings, elements: [], widgetType });
const column = (size, elements, settings = {}) => ({ id: id(), elType: 'column', settings: { _column_size: size, _inline_size: null, ...settings }, elements, isInner: false });
const section = (columns, settings = {}) => ({ id: id(), elType: 'section', settings, elements: columns, isInner: false });
const container = (elements, settings = {}) => ({ id: id(), elType: 'container', settings: { flex_direction: 'column', ...settings }, elements, isInner: false });

const heading = (title, size = 'h2') => widget('heading', { title, header_size: size, title_color: '#0B2545', typography_typography: 'custom' });
const text = (html) => widget('text-editor', { editor: html, text_color: '#4A5568' });
const button = (t, url = '#') => widget('button', { text: t, link: link(url), background_color: '#F26419', border_radius: { unit: 'px', top: '6', right: '6', bottom: '6', left: '6', isLinked: true } });
const iconBox = (title, desc, icon = 'fas fa-wrench') => widget('icon-box', { selected_icon: { value: icon, library: 'fa-solid' }, title_text: title, description_text: desc, title_size: 'h3' });
const imageBox = (title, desc, image) => widget('image-box', { image, title_text: title, description_text: desc, link: link('#') });
const image = (i) => widget('image', { image: i, image_size: 'large' });
const contactList = () =>
  widget('icon-list', {
    icon_list: [
      { _id: id(), text: '+1 (555) 010-2030', selected_icon: { value: 'fas fa-phone', library: 'fa-solid' }, link: link('tel:+15550102030') },
      { _id: id(), text: 'hello@plumbix-demo.com', selected_icon: { value: 'fas fa-envelope', library: 'fa-solid' }, link: link('mailto:hello@plumbix-demo.com') },
      { _id: id(), text: '123 Demo Street, Springfield', selected_icon: { value: 'fas fa-map-marker-alt', library: 'fa-solid' }, link: link('') },
    ],
  });
const subheader = (title, bg) =>
  section([column(100, [heading(title, 'h1'), text('<p>Short introduction text for this page, shown over the banner image.</p>')])], {
    background_background: 'classic',
    background_image: bg,
    background_image_mobile: bg,
    background_size: 'cover',
    background_overlay_background: 'classic',
    background_overlay_color: '#0B2545',
    background_overlay_opacity: { unit: 'px', size: 0.6 },
    padding: { unit: 'px', top: '120', right: '0', bottom: '120', left: '0', isLinked: false },
  });

const tpl = (title, type, content) => ({ version: '0.4', title, type, content, page_settings: { hide_title: 'yes' }, metadata: [] });

// --- templates -------------------------------------------------------------
const home = tpl('Home', 'page', [
  section(
    [
      column(100, [
        heading('Plumbix: Reliable Plumbing Services 24/7', 'h1'),
        text('<p>From leaking taps to full bathroom renovations, our certified plumbers fix it right the first time.</p>'),
        button('Get a Free Quote', '#contact'),
        button('Call +1 (555) 010-2030', 'tel:+15550102030'),
      ]),
    ],
    { background_background: 'classic', background_image: img('hero.jpg', 11), background_size: 'cover', min_height: { unit: 'vh', size: 80 } }
  ),
  section([
    column(33, [iconBox('Fast Response', 'We arrive within 60 minutes for emergencies, day or night.', 'fas fa-bolt')]),
    column(33, [iconBox('Certified Experts', 'Licensed and insured plumbers with years of experience.', 'fas fa-certificate')]),
    column(33, [iconBox('Fair Prices', 'Transparent quotes with no hidden fees, ever.', 'fas fa-tags')]),
  ]),
  section([
    column(50, [image(img('about.jpg', 12))]),
    column(50, [
      heading('About Plumbix'),
      text('<p>Founded in 2005, Plumbix has helped thousands of homeowners keep their homes running smoothly.</p><p>Our team treats every home as if it were our own.</p>'),
      widget('counter', { starting_number: 0, ending_number: 2500, suffix: '+', title: 'Happy Customers' }),
      button('Learn More', '/about/'),
    ]),
  ]),
  section([
    column(100, [heading('Our Services'), text('<p>Everything your home needs, done by professionals.</p>')]),
  ]),
  section([
    column(33, [imageBox('Leak Repair', 'Quick detection and repair of any leak.', img('service-1.jpg', 13))]),
    column(33, [imageBox('Drain Cleaning', 'Unblock drains with professional tools.', img('service-2.jpg', 14))]),
    column(33, [imageBox('Water Heaters', 'Installation and repair of water heaters.', img('service-3.jpg', 15))]),
  ]),
  section([
    column(100, [
      widget('testimonial', {
        testimonial_content: 'Plumbix fixed our burst pipe in the middle of the night. Fast, friendly and fairly priced!',
        testimonial_name: 'Jane Cooper',
        testimonial_job: 'Homeowner',
        testimonial_image: img('client.jpg', 16),
      }),
    ]),
  ]),
  section([column(100, [heading('Need a plumber today?'), contactList(), button('Contact Us', '/contact/')])], { background_background: 'classic', background_color: '#F5F7FA' }),
]);

const service = tpl('Service Single', 'page', [
  container([heading('Service Name', 'h1'), text('<p>One-line summary of the service.</p>')], {
    background_background: 'classic',
    background_image: img('subheader.jpg', 21),
    min_height: { unit: 'px', size: 380 },
  }),
  container(
    [
      container([image(img('service-detail.jpg', 22))], { width: { unit: '%', size: 50 } }),
      container(
        [
          heading('What this service includes'),
          text('<p>Detailed description of the service, the process and the benefits for the customer.</p><ul><li>First benefit</li><li>Second benefit</li><li>Third benefit</li></ul>'),
          button('Book this service', '/contact/'),
        ],
        { width: { unit: '%', size: 50 } }
      ),
    ],
    { flex_direction: 'row' }
  ),
  container([
    heading('Frequently asked questions'),
    widget('accordion', {
      tabs: [
        { _id: id(), tab_title: 'How long does it take?', tab_content: '<p>Most jobs are completed in a few hours.</p>' },
        { _id: id(), tab_title: 'Do you offer a warranty?', tab_content: '<p>Yes, all our work comes with a 2-year warranty.</p>' },
      ],
    }),
  ]),
  container([heading('Call us now: +1 (555) 010-2030'), button('Call Now', 'tel:+15550102030')], { background_background: 'classic', background_color: '#0B2545' }),
]);

const about = tpl('About Us', 'page', [
  subheader('About Us', img('subheader.jpg', 21)),
  section([
    column(50, [heading('Our Story'), text('<p>Plumbix started as a small family business and grew into the most trusted plumbing company in Springfield.</p>')]),
    column(50, [image(img('team.jpg', 31))]),
  ]),
  section([
    column(33, [iconBox('Our Mission', 'Make quality plumbing accessible to every home.', 'fas fa-bullseye')]),
    column(33, [iconBox('Our Values', 'Honesty, punctuality and craftsmanship.', 'fas fa-heart')]),
    column(33, [iconBox('Our Team', 'Twenty certified plumbers ready to help.', 'fas fa-users')]),
  ]),
]);

const contact = tpl('Contact', 'page', [
  subheader('Contact Us', img('subheader.jpg', 21)),
  section([
    column(50, [heading('Get in touch'), text('<p>Write to us or call: we answer within one business day. Email hello@plumbix-demo.com or, for emergencies, call +1 (555) 010-2030.</p>'), contactList()]),
    column(50, [widget('google_maps', { address: '123 Demo Street, Springfield', zoom: { unit: 'px', size: 14 } })]),
  ]),
  section([
    column(100, [
      heading('Send us a message'),
      widget('form', {
        form_name: 'Contact',
        form_fields: [
          { _id: id(), field_type: 'text', field_label: 'Name', placeholder: 'Your name' },
          { _id: id(), field_type: 'email', field_label: 'Email', placeholder: 'Your email' },
          { _id: id(), field_type: 'textarea', field_label: 'Message', placeholder: 'How can we help?' },
        ],
        button_text: 'Send',
      }),
    ]),
  ]),
]);

const servicesPage = tpl('Our Services', 'page', [
  subheader('Our Services', img('subheader.jpg', 21)),
  section([
    column(33, [imageBox('Leak Repair', 'Quick detection and repair of any leak.', img('service-1.jpg', 13)), button('Read more', '/leak-repair/')]),
    column(33, [imageBox('Drain Cleaning', 'Unblock drains with professional tools.', img('service-2.jpg', 14)), button('Read more', '/drain-cleaning/')]),
    column(33, [imageBox('Water Heaters', 'Installation and repair of water heaters.', img('service-3.jpg', 15)), button('Read more', '/water-heaters/')]),
  ]),
  section([column(100, [heading('Not sure what you need?'), button('Ask an expert', '/contact/')])]),
]);

const gallery = tpl('Gallery', 'page', [
  subheader('Gallery', img('subheader.jpg', 21)),
  section([
    column(100, [
      widget('image-gallery', {
        wp_gallery: [1, 2, 3, 4, 5, 6].map((n) => ({ id: 50 + n, url: `${IMG}gallery-${n}.jpg` })),
        thumbnail_size: 'medium',
        gallery_columns: 3,
        gallery_link: 'none',
      }),
    ]),
  ]),
]);

const singlePost = tpl('Single Post', 'single-post', [
  section([
    column(100, [
      widget('theme-post-featured-image', { __dynamic__: {} }),
      widget('theme-post-title', { header_size: 'h1' }),
      widget('theme-post-content', {}),
    ]),
  ]),
  section([column(100, [heading('Need this service? Plumbix is ready to help.'), button('Contact us', '/contact/')])], { background_background: 'classic', background_color: '#F5F7FA' }),
]);

const header = tpl('Header', 'section', [
  section([
    column(25, [image(img('logo.png', 41))]),
    column(50, [widget('nav-menu', { menu: 'main' })]),
    column(25, [button('Call +1 (555) 010-2030', 'tel:+15550102030')]),
  ]),
]);

const footer = tpl('Footer', 'section', [
  section([
    column(33, [image(img('logo-white.png', 42)), text('<p>Plumbix — your local plumbing experts since 2005.</p>')]),
    column(33, [heading('Contact', 'h4'), contactList()]),
    column(33, [heading('Opening hours', 'h4'), text('<p>Mon–Fri: 8am – 6pm<br>Sat: 9am – 1pm</p>')]),
  ]),
  section([column(100, [text('<p>© 2026 Plumbix. All rights reserved.</p>')])]),
]);

const globalStyles = { version: '0.4', title: 'Global Kit Styles', type: 'page', content: [], page_settings: { system_colors: [{ _id: 'primary', title: 'Primary', color: '#0B2545' }] } };

const templates = [
  ['Global Kit Styles', 'global.json', globalStyles, 'global-styles'],
  ['Home', 'home.json', home, 'single-page'],
  ['Service Single', 'service.json', service, 'single-page'],
  ['About Us', 'about.json', about, 'single-page'],
  ['Contact', 'contact.json', contact, 'single-page'],
  ['Header', 'header.json', header, 'section-header'],
  ['Footer', 'footer.json', footer, 'section-footer'],
  ['Our Services', 'services.json', servicesPage, 'single-page'],
  ['Gallery', 'gallery.json', gallery, 'single-page'],
  ['Single Post', 'single-post.json', singlePost, 'single-post'],
];

const manifest = {
  manifest_version: '1.0.0',
  title: 'Plumbix – Plumbing Services Template Kit (sample)',
  page_builder: 'elementor',
  kit_version: '1.0.0',
  templates: templates.map(([name, file, , templateType]) => ({
    name,
    screenshot: `screenshots/${file.replace('.json', '.png')}`,
    source: `templates/${file}`,
    preview_url: '',
    type: templateType.startsWith('section') ? 'section' : 'page',
    category: templateType.startsWith('section') ? 'section' : 'page',
    metadata: { template_type: templateType, include_in_zip: '1', elementor_pro_required: templateType.startsWith('section-') ? '1' : null },
  })),
  required_plugins: [{ name: 'Elementor', version: '3.20.0', file: 'elementor/elementor.php' }],
};

async function screenshot(label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#0B2545"/><rect x="30" y="30" width="540" height="60" rx="8" fill="#13315C"/><rect x="30" y="120" width="340" height="24" rx="4" fill="#F26419"/><rect x="30" y="160" width="440" height="14" rx="4" fill="#8DA9C4"/><rect x="30" y="185" width="400" height="14" rx="4" fill="#8DA9C4"/><text x="300" y="330" font-family="Arial" font-size="40" fill="#EEF4ED" text-anchor="middle">${label}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const zip = new AdmZip();
zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));
for (const [name, file, doc] of templates) {
  zip.addFile(`templates/${file}`, Buffer.from(JSON.stringify(doc, null, 2)));
  zip.addFile(`screenshots/${file.replace('.json', '.png')}`, await screenshot(name));
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
zip.writeZip(OUT);
console.log(`Sample kit written to ${path.relative(process.cwd(), OUT)}`);
