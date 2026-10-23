/** Premium WordPress plugins installed on every exported site (lib/bundled-plugins.js). */
import fs from 'node:fs';
import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { badRequest } from '../lib/util.js';
import { addBundledPlugin, listBundledPlugins, removeBundledPlugin } from '../lib/bundled-plugins.js';

const router = Router();

const upload = multer({
  dest: config.tmpDir,
  limits: { fileSize: 60 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => cb(/\.zip$/i.test(file.originalname) ? null : badRequest('Upload the .zip file of a WordPress plugin.'), true),
});

router.get('/bundled-plugins', (req, res) => res.json(listBundledPlugins()));

router.post('/bundled-plugins', upload.single('file'), (req, res) => {
  if (!req.file) throw badRequest('No file uploaded.');
  try {
    res.status(201).json(addBundledPlugin(req.file.path, req.user));
  } finally {
    fs.rmSync(req.file.path, { force: true });
  }
});

router.delete('/bundled-plugins/:zip', (req, res) => {
  removeBundledPlugin(String(req.params.zip));
  res.status(204).end();
});

export default router;
