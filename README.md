# Elementor Site Generator

A local web app that turns **site data + images + an Elementor Template Kit** into ready‑to‑import Elementor files, with the text written by the AI provider you choose (Claude, ChatGPT, Gemini or any OpenAI‑compatible API).

The site always has **5 pages: Home, About Us, Services, Gallery and Contact**. Services are published as WordPress articles, and the Gallery shows every uploaded photo.

The app produces a **downloadable zip** with a **WordPress plugin** (`<site>-site.zip`): upload and activate it, and it creates the whole site by itself (images in the Media Library, the 5 Elementor pages, one article per service, menu, header/footer, contact form). The zip also contains everything needed to import the site manually (kit, single templates, optimized images, `wordpress-import.xml`, `content.md`, `seo.csv`, `INSTRUCTIONS.md`).

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

1. **AI Providers → Add provider → "Demo (offline mock)"**. It fills fields with placeholder text and makes no network calls.
2. **Projects → New project**: fill in the site data and add 2–3 services.
3. **Images**: upload a few pictures and assign *Home hero*, *Subheader* and one image per service.
4. **Template Kit**: upload `samples/sample-elementor-kit.zip`. Under *Demo values to replace*, enter the brand `Plumbix` and the address `123 Demo Street, Springfield`.
5. **AI**: pick the demo provider.
6. **Generate & Preview → Generate**, then edit any text.
7. **Download**: click **Export & download zip**, then **Download WordPress plugin**. In WordPress (with Elementor active): *Plugins → Add New Plugin → Upload Plugin → Activate*.

Rebuild the sample kit at any time with `npm run sample-kit`.

### Deploy on a server

See [DEPLOY.md](DEPLOY.md) (Hostinger VPS: Node + PM2 + nginx + HTTPS). It needs a VPS: the app keeps state in SQLite and `storage/`, so serverless hosts such as Vercel cannot run the backend.

### Other commands

| Command | What it does |
|---|---|
| `npm run dev` | Backend (auto‑restart on changes) + Vite dev server |
| `npm start` | Builds the UI and serves everything from the backend on http://localhost:4000 |
| `npm test` | Backend unit + end‑to‑end tests (mock provider, sample kit, temporary storage) |
| `npm run sample-kit` | Regenerates `samples/sample-elementor-kit.zip` |

---

## Configuration

`backend/.env` (copy from [`backend/.env.example`](backend/.env.example)):

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | API port (the Vite dev server proxies `/api` to it) |
| `HOST` | `127.0.0.1` | Interface to listen on. A non-local address requires `APP_PASSWORD` |
| `TRUST_PROXY` | `0` | Number of reverse proxies in front of the app (`1` behind nginx) |
| `APP_USER` / `APP_PASSWORD` | `admin` / empty | Login (HTTP Basic Auth) for the whole app. **Required on a server**; empty = no login |
| `ENCRYPTION_KEY` | auto‑generated | 64 hex chars (32 bytes) used for AES‑256‑GCM encryption of API keys. **If you lose or change it, saved API keys can't be decrypted** (just enter them again). |
| `STORAGE_DIR` | `../storage` | SQLite DB, uploaded images, kits and exports |
| `MAX_IMAGE_MB` | `15` | Max size of each uploaded image |
| `MAX_KIT_MB` | `150` | Max size of a kit zip |
| `AI_TIMEOUT_MS` | `180000` | Timeout of a single AI request |
| `DEFAULT_LANGUAGE` | `it` | Site language of new projects (can be changed per project) |

---

## Layouts

The **Layout** step of a project chooses how the pages are built:

- **Clean built-in layout** (default, no kit needed). The generator builds the pages itself ([`elementor/layout.js`](backend/src/elementor/layout.js)) with fixed sections and only free Elementor widgets:
  - **Home**: hero banner, about section with a button to the About page, a card per service (name, description, button), photo carousel, customer reviews.
  - **About**: banner, then two text + photo blocks (no team section).
  - **Services**: banner, then one card per service (photo, name, text, button to its article).
  - **Gallery**: banner, then an image gallery of every photo, with lightbox.
  - **Contact**: banner, contact details, a Contact Form 7 form styled with CSS, and a Google map.
  - **Service articles**: a banner in the brand color with the service name and summary, then the text. Comments are closed.
  - **Header and footer**: logo, menu, phone; footer links, contacts and copyright.

  The brand color comes from the logo (dominant color), or from the color picked in the Layout step. Links, contact details and service names are set by the generator; the AI writes only the texts. Reviews are entered in *Site data → Customer reviews* and are never written by the AI. Without reviews, the Home page has no reviews section.
- **Elementor Template Kit**: rewrites the texts and images of an uploaded kit. The rest of this README describes this mode.

## Italian full-site prompt ("Sito completo Elementor (IT)")

This is **the** prompt of the system ([`backend/src/db/prompts/sito-completo-it.md`](backend/src/db/prompts/sito-completo-it.md), loaded by [`generation/site-prompt.js`](backend/src/generation/site-prompt.js)). Every site uses it for every page, the header, the footer and the service articles. Prompts cannot be uploaded, edited or chosen: the **AI** step only shows it (and the final prompt of each page) read-only. The technical instructions appended to it make the AI write in the site language, so the Italian wording of the prompt does not force Italian texts on sites in other languages.

Its Italian variables are filled automatically:

- **Site data:** `{{NOME_SITO}}`, `{{TELEFONO}}`, `{{EMAIL}}`, `{{INDIRIZZO}}`, `{{INDIRIZZO_URL_ENCODED}}`, `{{TESTO_COPYRIGHT}}`
- **Services:** `{{SERVIZIO_1}}`…`{{SERVIZIO_N}}`
- **Images:** `{{LOGO}}`, `{{IMG_HOME_HERO}}`, `{{IMG_SUBHEADER}}`, `{{IMG_SERVIZIO_n}}`, `{{ELENCO_IMMAGINI_GALLERIA}}` (each becomes the exported file name plus its ALT text)
- **Kit:** `{{NOME_FILE_TEMPLATE_KIT}}`

A line containing `{{SERVIZIO_N}}` is repeated for every service after the last numbered one. Lines that refer to a service that doesn't exist are removed.

The generator builds the files itself; the AI only writes the texts. This is how each requirement of the prompt is met:

| Prompt requirement | How the generator handles it |
|---|---|
| Pages Home, Chi Siamo, Servizi, Galleria, Contatti | These are the only pages generated. Kit step: map one template to each of Home / About / Services overview / Gallery / Contact (mapping a second template to a role un-maps the first). Titles and slugs follow the site language (`/chi-siamo/`, `/servizi/`, `/galleria/`, `/contatti/`). A page without a template is still created by the plugin (empty; the Gallery gets a WordPress gallery of all photos). |
| "Remove all sections not listed" | Kit step → **Sections**: uncheck the sections to drop (per template). |
| Subheader with the page title on inner pages | The first heading of the first section is set to the page title, and its background gets the subheader image. |
| Replace **all** images | Option *Replace all demo images* (on by default): every slot gets one of your images. Testimonial avatars and a missing logo are removed. Final checks verify that no demo image URL is left. |
| Galleria with all images + lightbox | The Gallery page shows **every uploaded photo** (all images except the logo), with lightbox enabled. If its template has no gallery widget, an Elementor *Image Gallery* is added after the subheader. The same photos also fill the free image slots of the other pages (service photos included), starting from a different photo on each page. |
| Home: 3 featured services; Servizi: grid with all services | Service cards are detected automatically. Home keeps up to the template's cards; the Services page is cloned or trimmed to one card per service. Each card gets the service name, image and link to its article. |
| Buttons "Scopri di più", "Tutti i servizi"… point to the right page | Link fields are filled by the AI, choosing only from the site's URLs (validated; with a fallback). Cards link to their service automatically. Links can be edited in the preview. |
| Services as **articles** (category "Servizi", featured image, ≥ 300 characters, CTA to Contatti) | Always articles (there are no per-service pages). Each article's text is validated at ≥ 300 characters. `wordpress-import.xml` (WXR) contains the category, articles, featured images, empty pages and the menu. A kit "Single post" template is exported for the Theme Builder. |
| Header and footer as separate templates, menu, copyright | Header and footer are exported as theme templates, and nav-menu widgets point to "Menu principale" (created by the XML). The footer copyright line comes from *Site data → Copyright*. |
| Contatti: `tel:`/`mailto:`, CF7 shortcode, Google Maps | Contact links are rewritten. The template form is replaced by a Shortcode widget with `[contact-form-7 id="INSERIRE_ID" title="Modulo di contatto"]` (editable). The map widget gets your address, or a Maps iframe is added. |
| Output: templates, articles, menu, import guide | WordPress plugin `<site>-site.zip` (see [The WordPress plugin](#the-wordpress-plugin)), plus `templates/*.json`, `wordpress-import.xml`, `menu.md`, `ISTRUZIONI.md` (in Italian for Italian sites) for the manual import |
| Final checks | `CONTROLLI.md` and the Download step list leftover demo images/texts, wrong links, emails that differ from yours, short articles and missing featured images. Responsive layout must still be checked by hand. |

---

## Workflow

The project wizard autosaves at every step. The sidebar shows ✓ / ⚠ / ✕ for each step, based on a server‑side readiness check.

1. **Site data**: name, phone, email, address, city, industry, notes for the AI, site language. Phone and email are validated.
2. **Services**: add, remove and drag to reorder. Each service gets an auto‑generated slug, which you can edit.
3. **Images**: drag & drop upload (JPG/PNG/WEBP/SVG) or **Choose from the Gallery** (see below), then pick a role per image:
   - `hero_home`: only one
   - `subheader`: one, or one per page if you enable that option
   - `service:<slug>`: one per service
   - `logo`
   - `gallery` (no specific spot)

   Every image except the logo is a site photo: it appears in the Gallery and can fill image slots on any page. Each image also has an ALT text (typed or generated by the AI) and an editable file name. **SEO rename** names files like `plumber-london-boiler-repair.webp`. Resizing and WEBP conversion are applied on export.
4. **Template Kit**: upload a kit or reuse one from the library, then map one template to each role (Home, About, Services overview, Gallery, Contact, Single post, Header, Footer). Other templates are ignored.
   - Expand a template to choose what replaces each image slot.
   - Phones and emails found in the kit are detected automatically. You can add the kit's demo brand and address and any custom replacements.
5. **AI**: choose the provider. The built-in site prompt is used automatically; you can preview the final prompt of each page with the variables already replaced.
6. **Generate & Preview**: shows the plan with the estimated token usage, then a live progress bar and log. Afterwards you get an editable preview of every field and the SEO fields, and can regenerate a single field or a whole page.
7. **Download**: export the zip and download the WordPress plugin. The images base URL is only needed for the manual import.

Kits and AI providers are global, so every project can reuse them.

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
│   │   ├── db/               # node:sqlite connection, schema.sql, the site prompt (prompts/)
│   │   ├── lib/              # crypto (AES-GCM), safe zip extraction, utils
│   │   ├── routes/           # projects+services, images, kits, providers, site prompt preview, generations
│   │   ├── ai/
│   │   │   ├── AIProvider.js # common interface + HTTP/timeout/error normalization
│   │   │   ├── registry.js   # auto-discovers adapters in ./providers
│   │   │   ├── json.js       # robust JSON extraction/validation of AI answers
│   │   │   └── providers/    # anthropic, openai, gemini, openai-compatible, mock
│   │   ├── elementor/
│   │   │   ├── kit.js        # read Template Kit / Website Kit / loose JSON
│   │   │   ├── analyze.js    # find text fields + image slots (with exact JSON paths)
│   │   │   └── apply.js      # write texts, images, contacts back (structure untouched)
│   │   └── generation/
│   │       ├── plan.js       # project context, page plan, readiness check
│   │       ├── prompt-builder.js  # {{variables}} + automatic JSON instructions
│   │       ├── runner.js     # background job: chunks, retries, progress, log
│   │       ├── exporter.js   # images, templates, kit rebuild, content.md, seo.csv, INSTRUCTIONS.md
│   │       ├── wp-plugin.js  # packages the WordPress plugin (data + images)
│   │       └── wp-plugin/plugin.php  # generic plugin code: creates the site in WordPress
│   ├── scripts/make-sample-kit.js
│   └── test/                 # node:test unit + e2e tests
├── frontend/                 # React 19 + Vite + Tailwind CSS v4
│   └── src/
│       ├── pages/            # Projects, Wizard (+ steps/), Kits, Providers
│       ├── components/       # UI primitives, toasts, step issues
│       ├── hooks/useAutosave.js
│       └── i18n/             # gettext-style i18n (English source strings + locales/)
├── samples/sample-elementor-kit.zip
└── storage/                  # created at runtime (DB, images, kits, output) — gitignored
```

### Data model

These are the tables from the spec, plus a few practical columns:

- `projects`: also has `kit_id`, `settings_json` (image options and crop sizes, demo replacements, chosen provider) and `status`
- `services`
- `images`: also has `original_name`, `mime`, `width`, `height`, `size`, `target_page` and `library_image_id` (the Gallery image it was copied from)
- `library_categories` and `library_images`: the Gallery library (files in `storage/library/`)
- `kits`: also has `format`, `extracted_path` and `templates_json`
- `kit_mappings`: also has `image_slots_json`
- `ai_providers`: also has `key_hint` and `models_json`
- `generations`: also has `progress`, `log_json`, `config_json` and `error`

The schema is plain SQL in [`backend/src/db/schema.sql`](backend/src/db/schema.sql) and can be ported to PostgreSQL easily.

### How the Elementor processing works

1. **Kit reading** ([`elementor/kit.js`](backend/src/elementor/kit.js)). The zip is extracted safely and `manifest.json` is located, even when nested in a folder. Two layouts are supported:
   - *Template Kit*: `manifest.templates[]` + `templates/*.json`
   - *Website Kit*: `manifest.templates{}` / `manifest.content{}` + `templates/<id>.json` and `content/page/<id>.json`

   If neither layout is found, any JSON with an Elementor `content` array is used. Roles are guessed from titles and types, and you can change them. **The original zip is never modified.**
2. **Analysis** ([`elementor/analyze.js`](backend/src/elementor/analyze.js)) walks the element tree:
   - **Text fields**: known keys of core and Pro widgets (heading, text‑editor, button, icon‑box, image‑box, icon‑list, tabs, accordion, testimonial, price‑table, flip‑box, CTA…), plus a heuristic for third‑party widgets that skips config values such as `h2`, `left` or colors.
   - **Image slots**: image controls, background images and galleries.

   Each item records its exact JSON path. Field IDs are readable, e.g. `home.hero.heading1.title` or `service.s2.icon_list1.icon_list3_text`.
3. **Generation** ([`generation/runner.js`](backend/src/generation/runner.js)). The site prompt is rendered with the variables. The generator then appends technical instructions: reply only with a JSON object, these exact keys, a length limit per field, plus `_seo.title` / `_seo.description`.
   - Long pages are split into chunks of 45 fields.
   - Invalid or incomplete JSON is **retried up to 2 times**. After that, missing fields keep their original text and a readable error is logged.
   - Rate limits, timeouts and 5xx errors are retried with backoff. Fatal errors (invalid key, unknown model) stop the run immediately.
   - Fields that contain only a phone number or email are filled automatically and never sent to the AI.
4. **Export** ([`generation/exporter.js`](backend/src/generation/exporter.js)) rebuilds everything from the original kit:
   - It sets only the targeted string values and image objects, so element IDs, styles and settings stay untouched.
   - It replaces `tel:` and `mailto:` links, the detected demo phones and emails, the demo brand and address, and any custom replacements, everywhere.
   - Images get the URL `<base URL>/<file name>` with `id: ''` in the manual-import files, and `esg-image://<file name>` in the WordPress plugin (which replaces it with the uploaded attachment).

### Image slot roles

| Role | Filled with |
|---|---|
| `hero` | the `hero_home` image (default: first background of the Home page) |
| `subheader` | the subheader image, or the page‑specific one if enabled (default: first background of inner pages) |
| `service_list` | the image of the card's service (default for service cards on Home and Services) |
| `logo` | the logo (default: first image in header and footer) |
| `gallery` | single images: the photos round‑robin (a different starting photo on each page). Gallery widgets: all photos (lightbox on) |
| `keep` | untouched (default for testimonial and team photos). With *Replace all demo images* on, they are removed instead |
| `remove` | image removed (empty) |

### The WordPress plugin

Built by [`generation/wp-plugin.js`](backend/src/generation/wp-plugin.js) from the generic PHP file [`generation/wp-plugin/plugin.php`](backend/src/generation/wp-plugin/plugin.php) (only the header and a per-project namespace are filled in). The zip contains `data/site.json` (pages, articles, images, menu, templates, kit styles, admin texts in the site language), `data/elementor/*.json` and the optimized images. Inside these documents images are referenced as `esg-image://<file>`.

It requires Elementor (`Requires Plugins: elementor`); Elementor Pro is optional. Activating it opens **Tools → Site &lt;name&gt;**, which starts by itself and runs in AJAX steps (a few images per request, so slow hosts don't time out):

0. installs and activates from wordpress.org what the site needs: **Ultimate Addons for Elementor** (header/footer without Elementor Pro), **Contact Form 7**, and the **Hello Elementor** theme when the active theme is a block theme (block themes do not show Elementor headers/footers; classic themes are kept);
1. copies the bundled images into the Media Library (with ALT texts and thumbnails);
2. creates the services category, the menu and, if Contact Form 7 is active, a contact form whose shortcode replaces the `INSERIRE_ID` placeholder (mail sent to the site email);
3. creates the 5 pages with `_elementor_data`: each `esg-image://` becomes the attachment id + URL, nav-menu widgets point to the menu, internal links become absolute;
4. creates one article per service (category, featured image, excerpt, Yoast / Rank Math title and description);
5. creates the header and footer: with Elementor Pro as Theme Builder templates (display conditions included); **without Pro** as Ultimate Addons for Elementor templates shown on the entire site, converting the Pro-only widgets (Nav Menu → UAE Navigation Menu, Site Logo, Site Title). It also merges the kit's global colors/fonts into the active Elementor kit;
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
- **Zip files**: protected against zip‑slip (absolute paths, `..`, drive letters) and zip bombs (entry count and total uncompressed size).
- **AI HTML**: `<script>`, `<iframe>`, `on*` attributes and `javascript:` URLs are stripped from AI‑written HTML.
- **Network**: the server listens on `127.0.0.1` by default (`HOST`) and refuses cross‑origin write requests.
- **Login**: with `APP_PASSWORD` set, the whole app (UI, API, images, downloads) requires HTTP Basic Auth; repeated failed logins from one IP are blocked for 15 minutes. Use it only over HTTPS.
- **No third‑party calls**: the only external requests go to the AI provider you selected. Demo images referenced by a kit are never loaded by the UI.

---

## Decisions where the spec was open

- **Stack**: Node.js + Express backend, React + Vite + Tailwind frontend, SQLite through Node's built‑in `node:sqlite`. One `npm run dev` starts everything.
- **Images in templates** (manual import): images are referenced by the configurable base URL. When Elementor imports a template, it downloads each referenced image into the Media Library, so the images must be online at that URL first. `INSTRUCTIONS.md` explains this, including the duplicate images it creates. Images are **not** embedded in the kit, because neither kit format supports that reliably.
- **Demo values**: demo phones and emails are detected automatically. The kit's demo brand name and address can't be detected reliably, so you enter them in the Kit step.
- **ALT text generation** is text‑only: it uses the image role, the service name and the business data. No image is sent to the AI.
- **SEO data**: each page request also asks for `_seo.title` and `_seo.description`. Slugs come from the role or the service slug and are editable in the preview.
- **Mock provider**: an extra "Demo (offline mock)" provider for testing the workflow without keys.
- **Prompt**: one built-in prompt for every site (see above); earlier versions let you upload and choose prompts per page type.
- **Hero and subheader size**: the images placed in the Home hero and in the page subheaders are cropped to an exact size (default 1920×1080 and 1920×600, editable in the Images step) with sharp's *attention* strategy, which keeps the most interesting part of the photo. The crops are extra files (`<name>-hero.webp`, `<name>-subheader.webp`); the gallery keeps the full photo. Photos smaller than the target are enlarged, and the Images step warns about them.

## Known limitations

- **Dynamic content**: text driven by dynamic tags is left untouched (e.g. site title, ACF fields). So are nav menus, forms' backend settings, shortcodes and the HTML widget.
- **Third‑party widgets**: text in widgets from ElementsKit, JetElements and similar addons is detected heuristically, so a field may occasionally be missed or included by mistake. You can review every field in the preview.
- **Section removal** is manual (Kit step → Sections): the generator cannot know which kit section corresponds to "Perché sceglierci" or "Recensioni".
- **Service cards** are detected heuristically (image‑box / CTA / flip‑box, or image + heading + button). In legacy section layouts, extra cards are added as new rows.
- **Pages created by `wordpress-import.xml` are empty**: their Elementor content is inserted from `templates/*.json` (Elementor data is not embedded in the XML, for reliability).
- **Links** assume permalinks set to "Post name" (`/chi-siamo/`, `/<service>/`).
- **Text links** inside text-editor HTML written by the AI are not validated (button and list links are).
- **Header and footer without Elementor Pro** are shown by Ultimate Addons for Elementor (installed by the plugin; the host must allow installing plugins). The single post template still needs Pro: without it the theme shows the articles, with the service photo at the top. With the manual import, header and footer need Elementor Pro (Theme Builder).
- **The plugin overwrites**: running it again replaces the content of the pages and articles it created (and of existing ones with the same slug), so edit the site in the generator and re-export rather than in WordPress, or stop running the plugin once you start editing in WordPress.
- **Duplicate images (manual import only)**: Elementor's importer creates its own copy of each referenced image, so each image appears twice in the Media Library (see `INSTRUCTIONS.md`). The plugin does not have this problem.
- **Restarts**: a generation interrupted by a server restart is marked as failed and must be started again.
- **Single user**: one shared login (`APP_USER` / `APP_PASSWORD`), no user accounts.

## Possible future developments

- Direct publishing through the WordPress REST API (the plugin already does this work, but it has to be uploaded by hand).
- Vision models for ALT texts and for automatic image‑to‑slot matching.
- Rewriting internal links to the generated page slugs.
- Visual preview of the generated page (rendering the Elementor JSON).
- Multi‑user mode with authentication and PostgreSQL.
- Streaming progress (SSE) instead of polling, and parallel page generation with rate‑limit awareness.
