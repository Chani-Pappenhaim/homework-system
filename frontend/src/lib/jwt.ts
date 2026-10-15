/**
 * The issue and expiry times of a JWT, in seconds, read without verifying it —
 * only to decide when to refresh; the server still checks the signature.
 * null for anything that is not a readable token.
 */
export function readJwtTimes(token: string): { iat?: number; exp?: number } | null {
  const json = readPayload(token);
  if (!json) return null;
  return {
    iat: typeof json.iat === 'number' ? json.iat : undefined,
    exp: typeof json.exp === 'number' ? json.exp : undefined,
  };
}

/** The user a JWT was issued to, read without verifying it; null if unreadable. */
export function readJwtUserId(token: string): string | null {
  const userId = readPayload(token)?.userId;
  return typeof userId === 'string' ? userId : null;
}

function readPayload(token: string): Record<string, unknown> | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')));
    return typeof json === 'object' && json !== null ? json : null;
  } catch {
    return null;
  }
}
