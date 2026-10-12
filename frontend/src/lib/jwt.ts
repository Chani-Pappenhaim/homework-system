/**
 * The issue and expiry times of a JWT, in seconds, read without verifying it —
 * only to decide when to refresh; the server still checks the signature.
 * null for anything that is not a readable token.
 */
export function readJwtTimes(token: string): { iat?: number; exp?: number } | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')));
    return {
      iat: typeof json.iat === 'number' ? json.iat : undefined,
      exp: typeof json.exp === 'number' ? json.exp : undefined,
    };
  } catch {
    return null;
  }
}
