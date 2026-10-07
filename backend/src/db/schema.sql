-- SQLite schema. Kept close to standard SQL so it can be ported to PostgreSQL
-- (INTEGER PRIMARY KEY AUTOINCREMENT -> SERIAL/IDENTITY, TEXT JSON -> JSONB).

CREATE TABLE IF NOT EXISTS kits (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  file_path      TEXT NOT NULL,           -- original uploaded zip (never modified)
  extracted_path TEXT NOT NULL,           -- safe extraction folder
  format         TEXT NOT NULL,           -- template-kit | website-kit | loose
  manifest_json  TEXT NOT NULL DEFAULT '{}',
  templates_json TEXT NOT NULL DEFAULT '[]', -- parsed template summary
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  site_name      TEXT NOT NULL DEFAULT '',
  phone          TEXT NOT NULL DEFAULT '',
  email          TEXT NOT NULL DEFAULT '',
  address        TEXT NOT NULL DEFAULT '',
  city           TEXT NOT NULL DEFAULT '',
  industry       TEXT NOT NULL DEFAULT '',
  language       TEXT NOT NULL DEFAULT 'en',
  notes          TEXT NOT NULL DEFAULT '',
  image_base_url TEXT NOT NULL DEFAULT '',
  copyright      TEXT NOT NULL DEFAULT '',
  kit_id         INTEGER REFERENCES kits(id) ON DELETE SET NULL,
  settings_json  TEXT NOT NULL DEFAULT '{}', -- image options, replacements, generation choices
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

CREATE TABLE IF NOT EXISTS kit_mappings (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id       INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kit_id           INTEGER NOT NULL REFERENCES kits(id) ON DELETE CASCADE,
  template_id      TEXT NOT NULL,
  page_role        TEXT NOT NULL DEFAULT 'ignore', -- home | service | services | about | gallery | contact | single_post | header | footer | other | ignore
  image_slots_json TEXT NOT NULL DEFAULT '{}',     -- { slotId: role } overrides
  options_json     TEXT NOT NULL DEFAULT '{}',     -- { removedSections: [elementId] }
  UNIQUE (project_id, kit_id, template_id)
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
