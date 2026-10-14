# Elementor Site Generator

A local web app that turns **site data + images + a reusable category template** into ready‑to‑import Elementor files, with the text written by the AI provider you choose (Claude, ChatGPT, Gemini or any OpenAI‑compatible API).

There are no Template Kits to upload: you create **categories** (e.g. *Plumbers*, *Restaurants*), and for each category the AI **generates templates** that you preview, save and reuse in every project of that category.

The site always has **5 pages: Home, About Us, Services, Gallery and Contact**. Services are published as WordPress articles, and the Gallery shows every uploaded photo.

The app produces a **downloadable zip** with a **WordPress plugin** (`<site>-site.zip`): upload and activate it, and it creates the whole site by itself (images in the Media Library, the 5 Elementor pages, one article per service, menu, header/footer, MetForm contact form). The zip also contains everything needed to import the site manually (single templates, optimized images, `wordpress-import.xml`, `content.md`, `seo.csv`, `INSTRUCTIONS.md`).

---

## Quick start

Requirements: **Node.js 22.13+** (tested on Node 24; uses the built‑in `node:sqlite`, so there are no native database builds).

```bash
npm install        # installs backend + frontend (npm workspaces)
npm run dev        # API on :4000 + UI on http://localhost:5173
```

Open **http://localhost:5173**.

On first start the backend creates `backend/.env` with a random `ENCRYPTION_KEY` if none exists (see [Configuration](#configuration)).

### Try the whole flow in 2 minutes (no API key needed)

1. **AI Providers → Add provider → "Demo (offline mock)"**. It designs a sample template and fills fields with placeholder text, without network calls.
2. **Templates → New category** (e.g. `Plumbers`) **→ Generate template → Generate → Save template**.
3. **Projects → New project**: fill in the site data and add 2–3 services.
4. **Images**: upload a few pictures and assign *Home hero*, *Subheader*, *Logo* and one image per service.
5. **Template**: pick the category and click **Use** on the saved template (or generate one right there).
6. **AI**: pick the demo provider.
7. **Generate & Preview → Generate**, then edit any text.
8. **Download**: click **Export & download zip**, then **Download WordPress plugin**. In WordPress (with Elementor active): *Plugins → Add New Plugin → Upload Plugin → Activate*.

### Other commands

| Command | What it does |
|---|---|
| `npm run dev` | Backend (auto‑restart on changes) + Vite dev server |
| `npm start` | Builds the UI and serves everything from the backend on http://localhost:4000 |
| `npm test` | Backend unit + end‑to‑end tests (mock provider, temporary storage) |

---

## Configuration

`backend/.env` (copy from [`backend/.env.example`](backend/.env.example)):

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | API port (the Vite dev server proxies `/api` to it) |
| `ENCRYPTION_KEY` | auto‑generated | 64 hex chars (32 bytes) used for AES‑256‑GCM encryption of API keys. **If you lose or change it, saved API keys can't be decrypted** (just enter them again). |
| `STORAGE_DIR` | `../storage` | SQLite DB, uploaded images and exports |
| `MAX_IMAGE_MB` | `15` | Max size of each uploaded image |
| `AI_TIMEOUT_MS` | `180000` | Timeout of a single AI request |
| `DEFAULT_LANGUAGE` | `it` | Site language of new projects (can be changed per project) |

---

## Templates (categories)

The **Templates** page in the top menu manages the design of the sites:

- **Categories**: one per kind of business (*Plumbers*, *Restaurants*, *Dentists*…), with an optional description of what those businesses do (sent to the AI). They can be renamed or deleted; deleting a category deletes its templates, and the projects that used them must choose another template.
- **Generate template**: the AI designs a template for the category, following the built-in template prompt ([`backend/src/db/prompts/template-categoria-it.md`](backend/src/db/prompts/template-categoria-it.md), read-only). You can add style instructions (*"elegant, dark colors"*) and choose the language of the sample texts. The result is shown as a sketch of the Home page: **regenerate** until you like it, then **save** it with a name. Nothing is saved before that.
- **Saved templates** are reused by every project of the category. They can be edited (name, colors, fonts, title weight, corner radius, spacing, layout of each section, icons, tone of voice), duplicated or deleted. Editing a template changes every project that uses it.

A template is a small **design spec**, not Elementor JSON written by the AI:

| Part | Content |
|---|---|
| `style` | 7 colors (primary, secondary, accent, titles, text, light background, dark), title and text fonts (from a list of Google Fonts), title weight, corner radius, spacing, uppercase buttons |
| `layout` | one variant per section: header (classic / centered / top bar with phone and email), hero (centered or left text over a photo / text beside a photo), about (image left/right), why choose us (icons / cards over a photo), call to action (banner / colored band / none), services (cards / boxed), reviews (cards / minimal), contact (details beside / above the form), footer (dark / light), gallery columns |
| `icons` | 4 Font Awesome icons for *Why choose us* |
| `tone`, `copy` | tone of voice and sample texts of every section (only a guide of tone and length: every project rewrites them) |

The AI answer is validated ([`templates/spec.js`](backend/src/templates/spec.js)): unknown fonts, icons, layouts or invalid colors fall back to defaults, so any answer becomes a usable template. The builder ([`templates/builder.js`](backend/src/templates/builder.js)) then turns the spec + the data of a project into the Elementor documents, using **only native Elementor widgets** (flexbox containers, heading, text, button, image, icon box, image box, icon list, testimonial, star rating, image gallery, shortcode, HTML) — no addon, no UAE.

---

## Italian full-site prompt ("Sito completo Elementor (IT)")

This is **the** prompt of the system ([`backend/src/db/prompts/sito-completo-it.md`](backend/src/db/prompts/sito-completo-it.md), loaded by [`generation/site-prompt.js`](backend/src/generation/site-prompt.js)). Every site uses it for every page, the header, the footer and the service articles. Prompts cannot be uploaded, edited or chosen: the **AI** step only shows it (and the final prompt of each page) read-only. The technical instructions appended to it make the AI write in the site language, so the Italian wording of the prompt does not force Italian texts on sites in other languages.

Its Italian variables are filled automatically:

- **Site data:** `{{NOME_SITO}}`, `{{SETTORE_CLIENTE}}` (the project industry, or the template category), `{{TELEFONO}}`, `{{EMAIL}}`, `{{INDIRIZZO}}`, `{{INDIRIZZO_URL_ENCODED}}`, `{{TESTO_COPYRIGHT}}`
- **Services:** `{{SERVIZIO_1}}`…`{{SERVIZIO_N}}`
- **Images:** `{{ELENCO_IMMAGINI}}` (the shared archive: every photo, logo excluded), `{{LOGO}}`, `{{IMG_HOME_HERO}}`, `{{IMG_SUBHEADER}}`, `{{IMG_SERVIZIO_n}}`, `{{ALTRE_IMMAGINI}}` (photos without a specific use), `{{ELENCO_IMMAGINI_GALLERIA}}` (each becomes the exported file name plus its ALT text)
- **Template:** `{{NOME_TEMPLATE}}`, `{{CATEGORIA_TEMPLATE}}`, `{{STILE_TEMPLATE}}` (colors, fonts, layouts and tone of voice of the template)
- **Contact form:** `{{PLUGIN_MODULO}}` (MetForm, or Contact Form 7 if chosen in the Template step)

A line containing `{{SERVIZIO_N}}` is repeated for every service after the last numbered one. Lines that refer to a service that doesn't exist are removed.

The generator builds the files itself; the AI only writes the texts. This is how each requirement of the prompt is met:

| Prompt requirement | How the generator handles it |
|---|---|
| Pages Home, Chi Siamo, Servizi, Galleria, Contatti | The template builder always creates these 5 pages, the header, the footer and the single post template, with exactly the sections listed in the prompt. Titles and slugs follow the site language (`/chi-siamo/`, `/servizi/`, `/galleria/`, `/contatti/`). |
| Style of the template | Colors, fonts, spacing, radius and layout variants come from the chosen template; its colors and fonts are also set as Elementor global colors / fonts. The tone of voice is described to the AI (`{{STILE_TEMPLATE}}`). |
| Subheader with the page title on inner pages | The first section of every inner page is a banner with the page title (fixed, not written by the AI) over the subheader image. |
| Shared image archive, no section without image | Every image slot is filled: hero, subheader, logo and service cards with their image, every other slot (about, why choose us, call to action, story, mission) with the photos of the archive round-robin, starting from a different photo on each page so neighbouring sections don't repeat the same one. A missing hero/subheader/service image is replaced by a photo of the archive. Final checks verify that no placeholder image is left. |
| Galleria with all images + lightbox | The Gallery page shows **every uploaded photo** (all images except the logo) in an Elementor *Image Gallery* with lightbox. |
| Home: 3 featured services; Servizi: grid with all services | Home shows up to 3 service cards, the Services page one card per service. Each card has the service name, image and link to its article (fixed), and a short description written by the AI. |
| Buttons "Scopri di più", "Tutti i servizi"… point to the right page | Every link is set by the builder (Chi Siamo, Servizi, Contatti, articles, `tel:`); the AI only writes the button texts. Links can still be changed in the preview. |
| 3 reviews, the same in Home and Chi Siamo | The AI writes the 3 reviews (text, name, role/city) on the Home page; the About page always shows the same ones (marked *Shared* in the preview, edited on Home). No avatar: nothing is left empty. |
| Services as **articles** (category "Servizi", featured image, ≥ 300 characters, CTA to Contatti) | Always articles (there are no per-service pages). Each article's text is validated at ≥ 300 characters. `wordpress-import.xml` (WXR) contains the category, articles, featured images, empty pages and the menu. The single post template (Theme Builder) ends with a call to action to the contact page. |
| Header and footer as separate templates, footer in 4 columns | Header: logo, menu with the 5 pages (Elementor icon list, so no Pro widget is needed), button or top bar with phone and email depending on the template. Footer: logo · **Link** (5 pages) · **Servizi** (every service, linked to its article) · **Contatti** (address, `mailto:`, `tel:`), then the copyright from *Site data → Copyright*. |
| Contatti: `tel:`/`mailto:`, form, Google Maps | Contact details with `tel:`/`mailto:` links, a Shortcode widget with the **MetForm** placeholder `[metform form_id="INSERIRE_ID"]` (or the Contact Form 7 one) and a Google Maps iframe with your address. |
| Plugins: no UAE, native widgets | The template uses only native Elementor widgets and MetForm. The WordPress plugin never installs Ultimate Addons for Elementor: without Elementor Pro it displays header and footer itself. |
| Output: templates, articles, menu, import guide | WordPress plugin `<site>-site.zip` (see [The WordPress plugin](#the-wordpress-plugin)), plus `templates/*.json`, `wordpress-import.xml`, `menu.md`, `ISTRUZIONI.md` (in Italian for Italian sites, with the plugins to activate) for the manual import |
| Final checks | `CONTROLLI.md` and the Download step list leftover placeholder images and sample texts, wrong links, emails that differ from yours, short articles and missing featured images. Responsive layout must still be checked by hand. |

---

## Workflow

The project wizard autosaves at every step. The sidebar shows ✓ / ⚠ / ✕ for each step, based on a server‑side readiness check.

1. **Site data**: name, phone, email, address, city, industry, notes for the AI, site language. Phone and email are validated.
2. **Services**: add, remove and drag to reorder. Each service gets an auto‑generated slug, which you can edit.
3. **Images**: drag & drop upload (JPG/PNG/WEBP/SVG) or **Choose from the Gallery** (see below), then pick a role per image:
   - `hero_home`: only one
   - `subheader`: one, or one per page if you enable that option
   - `service:<slug>`: one per service
   - `logo` (without logo, header and footer show the site name)
   - `gallery` (no specific spot)

   Every image except the logo is a site photo: it appears in the Gallery and can fill image slots on any page. Each image also has an ALT text (typed or generated by the AI) and an editable file name. **SEO rename** names files like `plumber-london-boiler-repair.webp`. Resizing and WEBP conversion are applied on export.
4. **Template**: choose the category of the business and one of its saved templates, or **Generate template** right there (it is saved in the category). The selected template is shown with its sections; *Edit design* changes it for every project that uses it. The same step sets the **contact form plugin** (MetForm by default, or Contact Form 7), the menu name and the Google map.
5. **AI**: choose the provider. The built-in site prompt is used automatically; you can preview the final prompt of each page with the variables already replaced.
6. **Generate & Preview**: shows the plan with the estimated token usage, then a live progress bar and log. Afterwards you get an editable preview of every field and the SEO fields, and can regenerate a single field or a whole page. Fields filled by the template (titles, menus, contacts, links) are marked *Template*; the reviews of the About page are marked *Shared*.
7. **Download**: export the zip and download the WordPress plugin. The images base URL is only needed for the manual import.

Templates and AI providers are global, so every project can reuse them. A generation belongs to the template it was made with: after changing template, run a new generation before exporting.

### Gallery (reusable image library)

The **Gallery** page in the top menu is an image library shared by all projects:

- Create categories (e.g. Kitchens, Bathrooms), then rename or delete them. Deleting a category keeps its images and moves them to *Uncategorized*.
- Upload images into a category. You can move one image or a selection to another category, add an optional ALT text, or delete them.
- In a project's **Images** step, **Choose from the Gallery** opens a picker filtered by category. The selected images are **copied** into the project with their name and ALT text. The project then treats them like any upload (roles, SEO rename, export).
- Images already added to the project are marked and cannot be added twice.
- Deleting an image from the Gallery does not affect projects that already use it.

---

## Architecture

```
website-maker/
├── package.json              # npm workspaces + "dev" runs both apps (concurrently)
├── backend/                  # Node.js + Express 5 (ESM JavaScript)
│   ├── src/
│   │   ├── server.js         # entry point (listens on 127.0.0.1)
│   │   ├── app.js            # express app, routes, error handler, static UI in prod
│   │   ├── config.js         # env, storage paths, encryption key bootstrap
│   │   ├── db/               # node:sqlite connection, schema.sql, the built-in prompts (prompts/)
│   │   ├── lib/              # crypto (AES-GCM), images, uploads, zip, utils
│   │   ├── routes/           # projects+services, images, library, templates, providers, prompts, generations
│   │   ├── ai/
│   │   │   ├── AIProvider.js # common interface + HTTP/timeout/error normalization
│   │   │   ├── registry.js   # auto-discovers adapters in ./providers
│   │   │   ├── json.js       # robust JSON extraction/validation of AI answers
│   │   │   └── providers/    # anthropic, openai, gemini, openai-compatible, mock
│   │   ├── templates/
│   │   │   ├── spec.js       # template design spec: allowed values, validation, description
│   │   │   ├── generate.js   # AI generation of a category template (template prompt + JSON spec)
│   │   │   └── builder.js    # spec + site data -> Elementor documents (+ field/slot marks, global styles)
│   │   ├── elementor/
│   │   │   ├── analyze.js    # find text fields + image slots (with exact JSON paths)
│   │   │   └── apply.js      # write texts, images, contacts back (structure untouched)
│   │   └── generation/
│   │       ├── plan.js       # project context, page plan, readiness check
│   │       ├── prompt-builder.js  # {{variables}} + automatic JSON instructions
│   │       ├── runner.js     # background job: chunks, retries, shared fields, progress, log
│   │       ├── exporter.js   # images, templates, content.md, seo.csv, INSTRUCTIONS.md
│   │       ├── wp-plugin.js  # packages the WordPress plugin (data + images + contact form)
│   │       └── wp-plugin/plugin.php  # generic plugin code: creates the site in WordPress
│   └── test/                 # node:test unit + e2e tests
├── frontend/                 # React 19 + Vite + Tailwind CSS v4
│   └── src/
│       ├── pages/            # Projects, Wizard (+ steps/), Templates, Gallery, Providers
│       ├── components/       # UI primitives, template preview/dialogs, toasts, step issues
│       ├── hooks/useAutosave.js
│       └── i18n/             # gettext-style i18n (English source strings + locales/)
└── storage/                  # created at runtime (DB, images, output) — gitignored
```

### Data model

These are the tables from the spec, plus a few practical columns:

- `projects`: also has `template_id`, `settings_json` (image options and crop sizes, contact form plugin, menu, map, chosen provider) and `status`
- `services`
- `images`: also has `original_name`, `mime`, `width`, `height`, `size`, `target_page` and `library_image_id` (the Gallery image it was copied from)
- `template_categories` and `site_templates`: the categories and their saved templates (`spec_json`, `instructions`, `language`, `generated_by`, `tokens_used`)
- `library_categories` and `library_images`: the Gallery library (files in `storage/library/`)
- `ai_providers`: also has `key_hint` and `models_json`
- `generations`: also has `progress`, `log_json`, `config_json` (prompt and template used) and `error`

The schema is plain SQL in [`backend/src/db/schema.sql`](backend/src/db/schema.sql) and can be ported to PostgreSQL easily. Databases created by earlier versions keep their old `kits` / `kit_mappings` tables and `projects.kit_id`: they are no longer used (projects made with a Template Kit must choose a template).

### How the Elementor processing works

1. **Build** ([`templates/builder.js`](backend/src/templates/builder.js)). The template spec and the project data (pages, services, contacts, logo, contact form) become the Elementor documents. Everything that is not marketing copy is decided here and **marked**: page titles in the subheaders, menus, service names and links, contact data, copyright (*fixed*); the texts the AI must write (*hint* and length limits); the reviews shared by Home and About (*share*); the role of each image slot. Element ids are derived from the build order, so the same project always gives the same ids.
2. **Analysis** ([`elementor/analyze.js`](backend/src/elementor/analyze.js)) walks the element tree and finds every text field and image slot with its exact JSON path. Field IDs are readable, e.g. `home.hero.heading2.title`; each field and slot is matched to its builder mark through `<elementId>:<settings path>`.
3. **Generation** ([`generation/runner.js`](backend/src/generation/runner.js)). The site prompt is rendered with the variables. The generator then appends technical instructions: reply only with a JSON object, these exact keys, a length limit per field, plus `_seo.title` / `_seo.description`.
   - Long pages are split into chunks of 45 fields.
   - Invalid or incomplete JSON is **retried up to 2 times**. After that, missing fields keep the template sample text and a readable error is logged.
   - Rate limits, timeouts and 5xx errors are retried with backoff. Fatal errors (invalid key, unknown model) stop the run immediately.
   - Fixed fields are never sent to the AI; shared fields are written once (on Home).
4. **Export** ([`generation/exporter.js`](backend/src/generation/exporter.js)) rebuilds the documents and writes the values and images into them:
   - Only the targeted string values and image objects are set, so element IDs, styles and settings stay untouched.
   - `tel:` / `mailto:` links and stray emails in AI texts become the site ones.
   - Images get the URL `<base URL>/<file name>` with `id: ''` in the manual-import files, and `esg-image://<file name>` in the WordPress plugin (which replaces it with the uploaded attachment).

### Image slot roles

| Role | Filled with |
|---|---|
| `hero` | the `hero_home` image, cropped (a photo of the archive if missing) |
| `subheader` | the subheader image, or the page‑specific one if enabled, cropped (a photo of the archive if missing) |
| `service_list` | the image of the card's service (a photo of the archive if missing) |
| `logo` | the logo (only placed when the project has one) |
| `photo` | the photos of the shared archive, round-robin from a different starting photo on each page |
| `gallery` | gallery widget: all photos (lightbox on) |

### The WordPress plugin

Built by [`generation/wp-plugin.js`](backend/src/generation/wp-plugin.js) from the generic PHP file [`generation/wp-plugin/plugin.php`](backend/src/generation/wp-plugin/plugin.php) (only the header and a per-project namespace are filled in). The zip contains `data/site.json` (pages, articles, images, menu, templates, contact form, template colors/fonts, admin texts in the site language), `data/elementor/*.json` and the optimized images. Inside these documents images are referenced as `esg-image://<file>`.

It requires Elementor (`Requires Plugins: elementor`); Elementor Pro is optional. Activating it opens **Tools → Site &lt;name&gt;**, which starts by itself and runs in AJAX steps (a few images per request, so slow hosts don't time out):

0. installs and activates from wordpress.org what the site needs: **MetForm** (or **Contact Form 7**) and the **Hello Elementor** theme when the active theme is a block theme, or when Elementor Pro is not active (classic themes are kept with Pro). **Ultimate Addons for Elementor is never installed**;
1. copies the bundled images into the Media Library (with ALT texts and thumbnails);
2. creates the services category, the menu and the contact form — a MetForm form (name, email, phone, message, privacy consent, send button; notifications to the site email) or a Contact Form 7 form — whose shortcode replaces the `INSERIRE_ID` placeholder;
3. creates the 5 pages with `_elementor_data`: each `esg-image://` becomes the attachment id + URL, internal links become absolute;
4. creates one article per service (category, featured image, excerpt, Yoast / Rank Math title and description);
5. creates the header, footer and single post template: with Elementor Pro as Theme Builder templates (display conditions included); **without Pro** header and footer are saved as Elementor sections and **displayed by the plugin itself** on every page and article (Hello Elementor hooks), so the plugin must stay active. It also sets the template colors/fonts as the Elementor global colors and fonts;
6. sets the site title, logo, Home as static front page and "Post name" permalinks, then clears the Elementor CSS cache.

It records the ids it creates (option `esg_site_<hash>`), so **Update the website** updates the same posts instead of duplicating them. Pages or articles with the same slug are reused, and only the menu items it added are replaced. Unchanged images are not uploaded twice.

---

## Adding an AI provider

Create **one file** in `backend/src/ai/providers/`. The registry discovers it at startup, and the UI form adapts to its metadata.

```js
// backend/src/ai/providers/my-provider.js
import { AIProvider } from '../AIProvider.js';

export default class MyProvider extends AIProvider {
  static type = 'my-provider';
  static label = 'My Provider';
  static defaultModels = ['model-a', 'model-b'];
  static defaultBaseUrl = 'https://api.example.com/v1';

  async generate(prompt, options = {}) {
    const data = await this.postJson(`${this.baseUrl}/generate`, {
      headers: { authorization: `Bearer ${this.apiKey}` },
      body: { model: this.model, prompt, max_tokens: options.maxTokens ?? this.maxTokens },
    });
    return { text: data.output, usage: { inputTokens: data.in || 0, outputTokens: data.out || 0 } };
  }
}
```

`postJson` handles the timeout and maps HTTP errors to readable messages (invalid key, rate limit, model not found…). If a model rejects an optional parameter such as `temperature`, it retries without that parameter.

Model lists are editable in the UI because model names change over time.

## Adding a UI language

UI strings are written in English inside `t('…')`. To add a language:

1. Create `frontend/src/i18n/locales/<code>.js` exporting `{ 'English string': 'Translation' }`.
2. Register it in `LOCALES` in `frontend/src/i18n/index.jsx`.

Missing strings fall back to English. A partial Italian locale is included as an example.

---

## Security

- **API keys**:
  - encrypted with AES‑256‑GCM, using the key from `ENCRYPTION_KEY`
  - decrypted only in memory when calling the provider
  - never logged and never returned to the frontend, which only receives `sk-...abcd`
  - Gemini keys go in a header, not in the URL
- **Uploads**:
  - Images are validated by content (decoded with sharp), not by extension.
  - SVGs with scripts or event handlers are rejected, and every image is served with a sandboxed CSP.
  - Size limits apply to all uploads.
- **AI output**: template specs are validated against fixed lists (fonts, icons, layouts, hex colors); `<script>`, `<iframe>`, `on*` attributes and `javascript:` URLs are stripped from AI‑written HTML.
- **Network**: the server listens on `127.0.0.1` only and refuses cross‑origin write requests.
- **No third‑party calls**: the only external requests go to the AI provider you selected. Template previews only name the fonts (nothing is loaded from Google Fonts).

---

## Decisions where the spec was open

- **Stack**: Node.js + Express backend, React + Vite + Tailwind frontend, SQLite through Node's built‑in `node:sqlite`. One `npm run dev` starts everything.
- **Templates instead of Template Kits**: the AI designs a validated *spec* (colors, fonts, layout variants, icons, tone, sample texts) and a deterministic builder produces the Elementor JSON. Asking the AI for whole Elementor documents would be slow, expensive and easy to break; with a spec every saved template always produces valid, consistent pages with exactly the sections of the prompt.
- **Contact form**: MetForm, as the prompt requires; Contact Form 7 can be chosen per project. The form is created by the WordPress plugin and inserted through its shortcode.
- **Header and footer without Elementor Pro**: displayed by the generated plugin (Hello Elementor hooks) instead of an addon, because the prompt excludes UAE.
- **Images in templates** (manual import): images are referenced by the configurable base URL. When Elementor imports a template, it downloads each referenced image into the Media Library, so the images must be online at that URL first. `INSTRUCTIONS.md` explains this, including the duplicate images it creates.
- **ALT text generation** is text‑only: it uses the image role, the service name and the business data. No image is sent to the AI.
- **SEO data**: each page request also asks for `_seo.title` and `_seo.description`. Slugs come from the role or the service slug and are editable in the preview.
- **Mock provider**: an extra "Demo (offline mock)" provider for testing the workflow without keys (it also designs demo templates).
- **Prompts**: one built-in prompt for every site and one for every template (see above); earlier versions let you upload and choose prompts per page type.
- **Hero and subheader size**: the images placed in the Home hero and in the page subheaders are cropped to an exact size (default 1920×1080 and 1920×600, editable in the Images step) with sharp's *attention* strategy, which keeps the most interesting part of the photo. The crops are extra files (`<name>-hero.webp`, `<name>-subheader.webp`); the gallery keeps the full photo. Photos smaller than the target are enlarged, and the Images step warns about them.

## Known limitations

- **Fixed structure**: templates change the design, not the structure: the sections are always the ones of the prompt.
- **Template preview** is a sketch drawn in the app (fonts named, photos drawn as gradients); the exact result is visible after importing into WordPress.
- **Header menu** is an Elementor icon list (works without Elementor Pro): on mobile it wraps instead of becoming a hamburger menu.
- **MetForm forms** are created with MetForm's own widgets and settings; if a future MetForm version stores them differently, recreate the form in MetForm and put its shortcode in the contact page.
- **Pages created by `wordpress-import.xml` are empty**: their Elementor content is inserted from `templates/*.json` (Elementor data is not embedded in the XML, for reliability).
- **Links** assume permalinks set to "Post name" (`/chi-siamo/`, `/<service>/`).
- **Text links** inside text-editor HTML written by the AI are not validated (button and list links are set by the template).
- **Without Elementor Pro** the single post template is not used: the theme shows the articles, with the service photo at the top; header and footer need the generated plugin to stay active. With the manual import, header and footer need Elementor Pro (Theme Builder).
- **The plugin overwrites**: running it again replaces the content of the pages and articles it created (and of existing ones with the same slug), so edit the site in the generator and re-export rather than in WordPress, or stop running the plugin once you start editing in WordPress.
- **Duplicate images (manual import only)**: Elementor's importer creates its own copy of each referenced image, so each image appears twice in the Media Library (see `INSTRUCTIONS.md`). The plugin does not have this problem.
- **Restarts**: a generation interrupted by a server restart is marked as failed and must be started again.
- **Single user**: local tool with no authentication.

## Possible future developments

- Direct publishing through the WordPress REST API (the plugin already does this work, but it has to be uploaded by hand).
- More section variants per template, and a rendered preview of the real Elementor pages.
- Vision models for ALT texts and for automatic image‑to‑slot matching.
- Multi‑user mode with authentication and PostgreSQL.
- Streaming progress (SSE) instead of polling, and parallel page generation with rate‑limit awareness.
