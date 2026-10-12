import { describe, it, expect } from 'vitest';
import { readJwtTimes } from '@/lib/jwt';

function token(payload: object): string {
  const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url('{"alg":"HS256"}')}.${b64url(JSON.stringify(payload))}.sig`;
}

describe('readJwtTimes', () => {
  it('reads iat and exp from the payload', () => {
    expect(readJwtTimes(token({ sub: 'u1', iat: 1000, exp: 1900 }))).toEqual({ iat: 1000, exp: 1900 });
  });

  it('decodes base64url without padding (- and _ characters)', () => {
    // '>>>' and '???' encode to '-' and '_' in base64url
    expect(readJwtTimes(token({ n: '>>>???', iat: 1, exp: 2 }))).toEqual({ iat: 1, exp: 2 });
  });

  it('leaves out times that are missing or not numbers', () => {
    expect(readJwtTimes(token({ exp: 'soon' }))).toEqual({ iat: undefined, exp: undefined });
  });

  it('returns null for something that is not a token', () => {
    expect(readJwtTimes('not-a-token')).toBeNull();
    expect(readJwtTimes('a.%%%.c')).toBeNull();
  });
});
