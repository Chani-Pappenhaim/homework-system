import crypto from 'crypto';

/** SHA-256 of a mailed one-time token; only the hash is stored, so a leaked DB row can't be used as a link. */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
