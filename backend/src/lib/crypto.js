/**
 * AES-256-GCM encryption for secrets (AI API keys).
 * Format of the stored string: base64(iv).base64(authTag).base64(ciphertext)
 */
import crypto from 'node:crypto';
import { config } from '../config.js';

// Accept a 64-char hex key directly; derive 32 bytes from any other string.
const KEY = /^[0-9a-f]{64}$/i.test(config.encryptionKey)
  ? Buffer.from(config.encryptionKey, 'hex')
  : crypto.createHash('sha256').update(config.encryptionKey).digest();

export function encrypt(plainText) {
  if (!plainText) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}

export function decrypt(payload) {
  if (!payload) return '';
  const [iv, tag, enc] = payload.split('.').map((p) => Buffer.from(p, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

/** Masked representation shown in the UI, e.g. "sk-...abcd". Never reveals the key. */
export function maskKey(key) {
  if (!key) return '';
  const prefix = (key.match(/^[a-zA-Z]+-/) || [''])[0];
  return `${prefix}...${key.slice(-4)}`;
}
