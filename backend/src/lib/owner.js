/**
 * Who sees what (several users, see lib/auth.js). Projects and images are shared by everyone.
 *  - AI providers (API keys): only their owner uses them.
 *  - Templates: their owner, or everyone when the owner shared them.
 * Rows without owner (created before users existed) belong to everyone. Without login
 * (user null, local use) everything is visible.
 */
import { get } from '../db/index.js';
import { HttpError, notFound } from './util.js';

const free = (row, user) => !user || row.owner == null || row.owner === user;

/** Can `user` use / edit this AI provider? */
export const canUseProvider = (row, user) => Boolean(row) && free(row, user);

/** Can `user` see and use this template (choose it, preview it)? */
export const canUseTemplate = (row, user) => Boolean(row) && (free(row, user) || row.shared === 1);

/** Can `user` change, share or delete this template? */
export const canEditTemplate = (row, user) => Boolean(row) && free(row, user);

/** Provider row usable by the user, or a readable error. */
export function requireOwnProvider(id, user, message = 'Select an AI provider (Settings → AI Providers to add one).') {
  const row = id ? get('SELECT * FROM ai_providers WHERE id = ?', Number(id)) : null;
  if (!row) throw new HttpError(400, message);
  if (!canUseProvider(row, user)) throw new HttpError(403, 'This AI provider belongs to another user: choose one of yours.');
  return row;
}

export const forbidden = (what) => new HttpError(403, `Only the user who created this ${what} can change it.`);
export { notFound };
