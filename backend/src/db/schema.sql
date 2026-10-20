-- SQLite schema. Kept close to standard SQL so it can be ported to PostgreSQL
-- (INTEGER PRIMARY KEY AUTOINCREMENT -> SERIAL/IDENTITY, TEXT JSON -> JSONB).

-- Templates: categories (e.g. Plumbers, Restaurants) and the templates generated for them.
-- A template is a design spec (colors, fonts, layout variants, icons, tone, sample texts) that
-- templates/builder.js turns into the Elementor documents of each site.
CREATE TABLE IF NOT EXISTS template_categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL COLLATE NOCASE UNIQUE,
  description TEXT NOT NULL DEFAULT '',     -- what the businesses of the category do (sent to the AI)
  profile_json TEXT,                        -- industry analysis of the category by the AI (templates/industry.js)
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS site_templates (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id  INTEGER NOT NULL REFERENCES template_categories(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  instructions TEXT NOT NULL DEFAULT '',    -- style instructions given when it was generated
  language     TEXT NOT NULL DEFAULT 'it',  -- language of the sample texts
  spec_json    TEXT NOT NULL DEFAULT '{}',
  generated_by TEXT NOT NULL DEFAULT '',    -- provider · model
  tokens_used  INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  site_name      TEXT NOT NULL DEFAULT '',
  phone          TEXT NOT NULL DEFAULT '',
  phone2         TEXT NOT NULL DEFAULT '',   -- second phone number (optional)
  email          TEXT NOT NULL DEFAULT '',
  address        TEXT NOT NULL DEFAULT '',
  google_business_url TEXT NOT NULL DEFAULT '', -- Google Business Profile link (optional): map of the Contact page
  map_resolved_url    TEXT NOT NULL DEFAULT '', -- the same link with a short link (maps.app.goo.gl…) expanded
  city           TEXT NOT NULL DEFAULT '',
  industry       TEXT NOT NULL DEFAULT '',
  language       TEXT NOT NULL DEFAULT 'en',
  notes          TEXT NOT NULL DEFAULT '',
  image_base_url TEXT NOT NULL DEFAULT '',
  copyright      TEXT NOT NULL DEFAULT '',
  template_id    INTEGER REFERENCES site_templates(id) ON DELETE SET NULL,
  settings_json  TEXT NOT NULL DEFAULT '{}', -- image options, contact form, menu, generation choices
  status         TEXT NOT NULL DEFAULT 'draft', -- draft | generated
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS services (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  slug        TEXT NOT NULL DEFAULT '',
  position    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS images (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id    INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_path     TEXT NOT NULL,            -- stored file (relative to storage dir)
  file_name     TEXT NOT NULL,            -- name used in the export (editable / SEO rename)
  original_name TEXT NOT NULL DEFAULT '',
  mime          TEXT NOT NULL DEFAULT '',
  width         INTEGER,
  height        INTEGER,
  size          INTEGER NOT NULL DEFAULT 0,
  role          TEXT NOT NULL DEFAULT '', -- '' | hero_home | subheader | service | logo | gallery
  service_id    INTEGER REFERENCES services(id) ON DELETE SET NULL,
  target_page   TEXT,                     -- subheader per page (optional): page role, e.g. 'about'
  alt_text      TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_providers (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  type              TEXT NOT NULL,          -- adapter type (anthropic | openai | gemini | openai-compatible | mock)
  name              TEXT NOT NULL,
  encrypted_api_key TEXT NOT NULL DEFAULT '',
  key_hint          TEXT NOT NULL DEFAULT '', -- masked key, e.g. sk-...abcd
  base_url          TEXT NOT NULL DEFAULT '',
  model             TEXT NOT NULL DEFAULT '',
  models_json       TEXT NOT NULL DEFAULT '[]', -- user-editable list of model names
  temperature       REAL NOT NULL DEFAULT 0.7,
  max_tokens        INTEGER NOT NULL DEFAULT 8192,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS generations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider_id INTEGER REFERENCES ai_providers(id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'queued', -- queued | running | completed | failed
  progress    REAL NOT NULL DEFAULT 0,
  config_json TEXT NOT NULL DEFAULT '{}',
  log_json    TEXT NOT NULL DEFAULT '[]',
  output_json TEXT NOT NULL DEFAULT '{}',
  output_file TEXT,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  error       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_services_project ON services(project_id);
CREATE INDEX IF NOT EXISTS idx_images_project ON images(project_id);
CREATE INDEX IF NOT EXISTS idx_generations_project ON generations(project_id);
CREATE INDEX IF NOT EXISTS idx_site_templates_category ON site_templates(category_id);

-- Gallery: reusable image library organized by categories, shared by all projects.
-- Images picked for a project are copied into `images` (library_image_id keeps the link).
CREATE TABLE IF NOT EXISTS library_categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS library_images (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id   INTEGER REFERENCES library_categories(id) ON DELETE SET NULL, -- NULL = uncategorized
  file_path     TEXT NOT NULL,            -- stored file (relative to storage dir)
  file_name     TEXT NOT NULL,            -- name given to the image when added to a project
  original_name TEXT NOT NULL DEFAULT '',
  mime          TEXT NOT NULL DEFAULT '',
  width         INTEGER,
  height        INTEGER,
  size          INTEGER NOT NULL DEFAULT 0,
  alt_text      TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_library_images_category ON library_images(category_id);

-- Template Kits: Elementor Template Kits (zip) uploaded by the users, shared by every project.
-- A project uses either a category template (projects.template_id) or a kit (projects.template_kit_id):
-- the kit pages keep their design and structure, the AI rewrites every text and the project images
-- replace every image (kits/site.js).
CREATE TABLE IF NOT EXISTS template_kits (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  file_name     TEXT NOT NULL DEFAULT '',   -- uploaded zip
  dir           TEXT NOT NULL DEFAULT '',   -- extracted kit (relative to storage dir)
  format        TEXT NOT NULL DEFAULT '',   -- template-kit | website-kit | loose
  info_json     TEXT NOT NULL DEFAULT '{}', -- structure read from the zip (kits/read.js)
  analysis_json TEXT,                       -- AI analysis: design, role of each template, sections (kits/analysis.js)
  roles_json    TEXT NOT NULL DEFAULT '{}', -- role of each template chosen by the user (overrides the analysis)
  analyzed_by   TEXT NOT NULL DEFAULT '',   -- provider · model
  tokens_used   INTEGER NOT NULL DEFAULT 0,
  uploaded_by   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
