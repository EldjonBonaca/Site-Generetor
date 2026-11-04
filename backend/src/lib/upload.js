/** Image upload handling shared by the project images and the Gallery library. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import sharp from 'sharp';
import { config } from '../config.js';
import { badRequest, notFound } from './util.js';
import { optimizeImage } from './optimize.js';

const ALLOWED_EXT = /\.(jpe?g|png|webp|svg)$/i;

export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxImageBytes, files: 40 },
  fileFilter: (req, file, cb) => cb(ALLOWED_EXT.test(file.originalname) ? null : badRequest(`Unsupported file type: ${file.originalname} (JPG, PNG, WEBP, SVG only)`), true),
});

/** A length of an SVG attribute in pixels ("120", "120px", "2.5in"…), null for "100%" / missing. */
function svgLength(value) {
  const m = /^\s*([\d.]+)\s*(px|pt|pc|mm|cm|in)?\s*$/i.exec(value || '');
  if (!m) return null;
  const px = { px: 1, pt: 4 / 3, pc: 16, mm: 96 / 25.4, cm: 96 / 2.54, in: 96 }[(m[2] || 'px').toLowerCase()];
  const n = Math.round(Number(m[1]) * px);
  return n > 0 ? n : null;
}

/** Size of an SVG from the width / height of its root element, else from its viewBox. */
export function svgSize(text) {
  const root = /<svg\b[^>]*>/i.exec(text)?.[0] || '';
  const attr = (name) => new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(root)?.[1];
  let width = svgLength(attr('width'));
  let height = svgLength(attr('height'));
  const box = (attr('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  if (box.length === 4 && box[2] > 0 && box[3] > 0) {
    if (!width && !height) [width, height] = [Math.round(box[2]), Math.round(box[3])];
    else if (!height) height = Math.round((width * box[3]) / box[2]);
    else if (!width) width = Math.round((height * box[2]) / box[3]);
  }
  return width && height ? { width, height } : { width: null, height: null };
}

/**
 * SVG cleaned of what editors add and a logo never needs (Illustrator / Inkscape data, comments,
 * DOCTYPE with entities, foreignObject fallbacks), then rejected if it still has active content.
 */
export function sanitizeSvg(buffer, originalName) {
  const text = buffer
    .toString('utf8')
    .replace(/^﻿/, '')
    .replace(/<!DOCTYPE[^[>]*(\[[\s\S]*?\])?\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<metadata\b[\s\S]*?<\/metadata>/gi, '')
    .replace(/<foreignObject\b[^>]*\/>/gi, '')
    .replace(/<foreignObject\b[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/<i:pgf\b[\s\S]*?<\/i:pgf>/gi, '')
    .trim();
  if (!/<svg[\s>]/i.test(text)) throw badRequest(`${originalName}: not a valid SVG file.`);
  if (/<script|<foreignObject|<iframe|<embed|<object|\son[a-z]+\s*=|(href|src)\s*=\s*["']\s*(javascript|data:text\/html)/i.test(text)) {
    throw badRequest(`${originalName}: SVG contains scripts or active content and was rejected.`);
  }
  return Buffer.from(text, 'utf8');
}

/** Validate content by magic bytes / parsing, never trust the extension or the browser MIME. */
export async function inspectImage(buffer, originalName) {
  const head = buffer.subarray(0, 2048).toString('utf8').replace(/^﻿/, '').trimStart();
  if (/\.svg$/i.test(originalName) || head.startsWith('<svg') || head.startsWith('<?xml') || head.startsWith('<!DOCTYPE svg')) {
    const clean = sanitizeSvg(buffer, originalName);
    return { mime: 'image/svg+xml', ext: '.svg', ...svgSize(clean.toString('utf8')), buffer: clean };
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

/**
 * An uploaded file ready to be stored: validated, and compressed below 1 MB when it is 1 MB or more.
 * @returns {Promise<{ buffer: Buffer, info: { mime, ext, width, height }, optimized: null | { name, from, to } }>}
 */
export async function prepareUpload(file) {
  const { buffer: cleaned, ...info } = await inspectImage(file.buffer, file.originalname);
  const buffer = cleaned || file.buffer; // an SVG is stored cleaned
  let out;
  try {
    out = await optimizeImage(buffer, info);
  } catch (err) {
    throw badRequest(`${file.originalname}: the image could not be compressed (${err.message}).`);
  }
  if (!out) return { buffer, info, optimized: null };
  if (out.buffer.length >= config.optimizeImageBytes) throw badRequest(`${file.originalname}: the image could not be compressed under ${+(config.optimizeImageBytes / 1e6).toFixed(2)} MB.`);
  return {
    buffer: out.buffer,
    info: { mime: out.mime, ext: out.ext, width: out.width ?? info.width, height: out.height ?? info.height },
    optimized: { name: file.originalname, from: file.buffer.length, to: out.buffer.length },
  };
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
