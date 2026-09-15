import jwt from 'jsonwebtoken';

// A missing or guessable secret lets anyone forge a valid login token (ADMIN
// included) — since jwt.sign/verify accept an empty string silently, this has
// to be checked explicitly rather than relying on `!` to catch it at runtime.
const PLACEHOLDER_VALUES = new Set(['secret', 'changeme', 'password', 'test', '123456']);

function requireStrongSecret(envVar: string): string {
  const value = process.env[envVar];
  if (!value || value.trim().length < 16 || PLACEHOLDER_VALUES.has(value.trim().toLowerCase())) {
    throw new Error(`${envVar} is missing or too weak — set a long random value before starting the server`);
  }
  return value;
}

const ACCESS_SECRET = requireStrongSecret('JWT_SECRET');
const REFRESH_SECRET = requireStrongSecret('JWT_REFRESH_SECRET');

export interface TokenPayload {
  userId: string;
  role: string;
}

export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: '15m' });
}

export function signRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: '7d' });
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, ACCESS_SECRET) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, REFRESH_SECRET) as TokenPayload;
}

export interface FileTokenPayload {
  fileId: string;
  kind: 'lesson' | 'course';
}

/**
 * A study-material download link carries this instead of the browser's normal
 * Authorization header (an <a>/<img>/<iframe> navigation can't send one), so it
 * has to be its own short-lived, single-file credential rather than a signed
 * Cloudinary URL that — once handed out — stays valid forever.
 */
export function signFileToken(payload: FileTokenPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: '15m' });
}

export function verifyFileToken(token: string): FileTokenPayload {
  return jwt.verify(token, ACCESS_SECRET) as FileTokenPayload;
}
