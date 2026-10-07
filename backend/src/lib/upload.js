/** Image upload handling shared by the project images and the Gallery library. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import sharp from 'sharp';
import { config } from '../config.js';
import { badRequest, notFound } from './util.js';

const ALLOWED_EXT = /\.(jpe?g|png|webp|svg)$/i;

export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxImageBytes, files: 40 },
  fileFilter: (req, file, cb) => cb(ALLOWED_EXT.test(file.originalname) ? null : badRequest(`Unsupported file type: ${file.originalname} (JPG, PNG, WEBP, SVG only)`), true),
});

/** Validate content by magic bytes / parsing, never trust the extension or the browser MIME. */
export async function inspectImage(buffer, originalName) {
  const head = buffer.subarray(0, 2048).toString('utf8').trimStart();
  if (/\.svg$/i.test(originalName) || head.startsWith('<svg') || head.startsWith('<?xml')) {
    const text = buffer.toString('utf8');
    if (!/<svg[\s>]/i.test(text)) throw badRequest(`${originalName}: not a valid SVG file.`);
    if (/<script|\son\w+\s*=|javascript:|<foreignObject|<iframe|<embed/i.test(text)) {
      throw badRequest(`${originalName}: SVG contains scripts or active content and was rejected.`);
    }
    return { mime: 'image/svg+xml', ext: '.svg', width: null, height: null };
  }
  let meta;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    throw badRequest(`${originalName}: the file is not a valid image.`);
  }
  const map = { jpeg: ['image/jpeg', '.jpg'], png: ['image/png', '.png'], webp: ['image/webp', '.webp'] };
  if (!map[meta.format]) throw badRequest(`${originalName}: format "${meta.format}" not allowed.`);
  return { mime: map[meta.format][0], ext: map[meta.format][1], width: meta.width, height: meta.height };
}

/** Random stored file name, e.g. "1760000000000-a1b2c3d4.jpg". */
export const storedName = (ext) => `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;

/** Send a stored image. Sandboxed CSP so an SVG can never run scripts in the app origin. */
export function sendImage(res, row) {
  const file = path.join(config.storageDir, row.file_path);
  if (!fs.existsSync(file)) throw notFound('File');
  res.set({
    'Content-Type': row.mime,
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, max-age=3600',
  });
  res.sendFile(file);
}
