import { describe, it, expect } from 'vitest';
import { getApiErrorMessage, getDownloadErrorMessage } from '@/lib/errors';

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

describe('getDownloadErrorMessage', () => {
  const blobError = (text: string) => ({ isAxiosError: true, response: { status: 404, data: new Blob([text]) } });

  it("reads the server's message out of a file request's error body", async () => {
    expect(await getDownloadErrorMessage(blobError(JSON.stringify({ error: 'אין מפגשים בתאריכים שנבחרו' })))).toBe('אין מפגשים בתאריכים שנבחרו');
  });

  it('falls back when the body is not a message', async () => {
    expect(await getDownloadErrorMessage(blobError('<html>'), 'הייצוא נכשל')).toBe('הייצוא נכשל');
  });

  it('handles an error with no body like any other', async () => {
    expect(await getDownloadErrorMessage({ isAxiosError: true, response: undefined })).toContain('להתחבר לשרת');
  });
});
