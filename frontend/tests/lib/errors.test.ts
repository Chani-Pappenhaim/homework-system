import { describe, it, expect } from 'vitest';
import { getApiErrorMessage } from '@/lib/errors';

describe('getApiErrorMessage', () => {
  it('returns a friendly network message when the request never got a response', () => {
    const err = { isAxiosError: true, response: undefined };
    expect(getApiErrorMessage(err)).toContain('להתחבר לשרת');
  });

  it('blames a slow server, not the connection, when the request timed out', () => {
    for (const code of ['ECONNABORTED', 'ETIMEDOUT']) {
      const msg = getApiErrorMessage({ isAxiosError: true, code, response: undefined });
      expect(msg).toMatch(/השרת לא הגיב בזמן/);
      expect(msg).not.toMatch(/חיבור האינטרנט/);
    }
  });

  it('surfaces the server-provided message when present', () => {
    const err = { isAxiosError: true, response: { data: { error: 'אימייל כבר קיים' } } };
    expect(getApiErrorMessage(err)).toBe('אימייל כבר קיים');
  });

  it('uses the fallback when the server response has no message', () => {
    const err = { isAxiosError: true, response: { data: {} } };
    expect(getApiErrorMessage(err, 'שגיאה בשמירה')).toBe('שגיאה בשמירה');
  });

  it('uses the default generic message when no fallback is given', () => {
    const err = { isAxiosError: true, response: { data: {} } };
    expect(getApiErrorMessage(err)).toContain('אירעה שגיאה');
  });

  it('ignores a blank server message and falls back', () => {
    const err = { isAxiosError: true, response: { data: { error: '   ' } } };
    expect(getApiErrorMessage(err, 'גיבוי')).toBe('גיבוי');
  });

  it('handles a non-axios thrown value via the fallback', () => {
    expect(getApiErrorMessage(new Error('kaboom'), 'גיבוי')).toBe('גיבוי');
  });
});
