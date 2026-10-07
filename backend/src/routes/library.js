/**
 * Gallery: a reusable image library organized by categories. Images are uploaded once here and
 * then picked in any project (POST /projects/:id/images/from-library copies them in).
 */
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { all, get, run } from '../db/index.js';
import { config } from '../config.js';
import { badRequest, notFound, slugify } from '../lib/util.js';
import { imageUpload, inspectImage, sendImage, storedName } from '../lib/upload.js';

const router = Router();

const CATEGORIES_SQL = `
  SELECT c.*, (SELECT COUNT(*) FROM library_images i WHERE i.category_id = c.id) AS image_count
  FROM library_categories c ORDER BY c.name COLLATE NOCASE`;

const requireCategory = (id) => {
  const row = get('SELECT * FROM library_categories WHERE id = ?', id);
  if (!row) throw notFound('Category');
  return row;
};

const requireImage = (id) => {
  const row = get('SELECT * FROM library_images WHERE id = ?', id);
  if (!row) throw notFound('Image');
  return row;
};

/** Category name from the request body: trimmed, non-empty, unique (case-insensitive). */
function categoryName(body, exceptId = null) {
  const name = String(body?.name ?? '').trim().slice(0, 80);
  if (!name) throw badRequest('Enter a category name.');
  if (get('SELECT id FROM library_categories WHERE name = ? AND id IS NOT ?', name, exceptId)) throw badRequest(`The category "${name}" already exists.`);
  return name;
}

/** `category_id` from a request: null (uncategorized) or an existing category. */
function categoryId(value) {
  if (value === undefined || value === null || value === '' || value === 'none') return null;
  return requireCategory(Number(value)).id;
}

router.get('/library/categories', (req, res) => {
  res.json({
    categories: all(CATEGORIES_SQL),
    total: get('SELECT COUNT(*) AS n FROM library_images').n,
    uncategorized: get('SELECT COUNT(*) AS n FROM library_images WHERE category_id IS NULL').n,
  });
});

router.post('/library/categories', (req, res) => {
  const { lastInsertRowid } = run('INSERT INTO library_categories (name) VALUES (?)', categoryName(req.body));
  res.status(201).json(all(CATEGORIES_SQL).find((c) => c.id === Number(lastInsertRowid)));
});

router.patch('/library/categories/:cid', (req, res) => {
  const cat = requireCategory(req.params.cid);
  run('UPDATE library_categories SET name = ? WHERE id = ?', categoryName(req.body, cat.id), cat.id);
  res.json(all(CATEGORIES_SQL).find((c) => c.id === cat.id));
});

/** Delete a category: its images are kept and become uncategorized. */
router.delete('/library/categories/:cid', (req, res) => {
  const cat = requireCategory(req.params.cid);
  run('DELETE FROM library_categories WHERE id = ?', cat.id);
  res.status(204).end();
});

/** All library images, or only one category (?category=<id>) / the uncategorized ones (?category=none). */
router.get('/library/images', (req, res) => {
  const { category } = req.query;
  if (category === 'none') return res.json(all('SELECT * FROM library_images WHERE category_id IS NULL ORDER BY id DESC'));
  if (category) return res.json(all('SELECT * FROM library_images WHERE category_id = ? ORDER BY id DESC', Number(category)));
  res.json(all('SELECT * FROM library_images ORDER BY id DESC'));
});

router.post('/library/images', imageUpload.array('files'), async (req, res) => {
  if (!req.files?.length) throw badRequest('No files uploaded.');
  const catId = categoryId(req.body?.category_id);
  const created = [];
  const errors = [];
  for (const file of req.files) {
    try {
      const info = await inspectImage(file.buffer, file.originalname);
      const stored = storedName(info.ext);
      fs.writeFileSync(path.join(config.libraryDir, stored), file.buffer);
      const fileName = `${slugify(path.parse(file.originalname).name) || 'image'}${info.ext}`;
      const { lastInsertRowid } = run(
        `INSERT INTO library_images (category_id, file_path, file_name, original_name, mime, width, height, size)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        catId, `library/${stored}`, fileName, file.originalname.slice(0, 255), info.mime, info.width, info.height, file.size
      );
      created.push(requireImage(lastInsertRowid));
    } catch (err) {
      errors.push(err.message);
    }
  }
  if (!created.length) throw badRequest(errors.join(' '));
  res.status(201).json({ created, errors });
});

router.get('/library/images/:lid/file', (req, res) => sendImage(res, requireImage(req.params.lid)));

/** Change the category, the ALT text or the file name. */
router.patch('/library/images/:lid', (req, res) => {
  const img = requireImage(req.params.lid);
  const b = req.body || {};
  const next = { category_id: img.category_id, alt_text: img.alt_text, file_name: img.file_name };
  if (b.category_id !== undefined) next.category_id = categoryId(b.category_id);
  if (b.alt_text !== undefined) next.alt_text = String(b.alt_text).slice(0, 300);
  if (b.file_name !== undefined) {
    const base = slugify(path.parse(String(b.file_name)).name);
    if (!base) throw badRequest('Invalid file name');
    next.file_name = `${base}${path.extname(img.file_path)}`;
  }
  run('UPDATE library_images SET category_id = ?, alt_text = ?, file_name = ? WHERE id = ?', next.category_id, next.alt_text, next.file_name, img.id);
  res.json(requireImage(img.id));
});

/** Delete from the Gallery. Projects that already use the image keep their own copy. */
router.delete('/library/images/:lid', (req, res) => {
  const img = requireImage(req.params.lid);
  run('DELETE FROM library_images WHERE id = ?', img.id);
  fs.rmSync(path.join(config.storageDir, img.file_path), { force: true });
  res.status(204).end();
});

export default router;
