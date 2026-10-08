import { describe, it, expect } from 'vitest';
import { cn, formatDate, formatDateTime, isOverdue, formatBytes, toGematria, toHebrewDate, markdownToPlainText } from '@/lib/utils';

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('a', 'b')).toContain('a');
    expect(cn('a', 'b')).toContain('b');
  });
  it('dedupes conflicting tailwind classes (last wins)', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });
  it('drops falsy values', () => {
    expect(cn('a', false && 'b', undefined, null)).toBe('a');
  });
});

describe('formatDate', () => {
  it('returns an em dash for empty input', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
  });
  it('formats a date string', () => {
    const out = formatDate('2026-07-11T00:00:00Z');
    expect(out).not.toBe('—');
    expect(out).toContain('2026');
  });
});

describe('formatDateTime', () => {
  it('returns an em dash for empty input', () => {
    expect(formatDateTime(null)).toBe('—');
  });
  it('formats a datetime string', () => {
    expect(formatDateTime('2026-07-11T10:30:00Z')).not.toBe('—');
  });
});

describe('isOverdue', () => {
  it('is false when there is no deadline', () => {
    expect(isOverdue(null)).toBe(false);
    expect(isOverdue(undefined)).toBe(false);
  });
  it('is true for a past deadline', () => {
    expect(isOverdue('2000-01-01T00:00:00Z')).toBe(true);
  });
  it('is false for a future deadline', () => {
    expect(isOverdue('2999-01-01T00:00:00Z')).toBe(false);
  });
});

describe('formatBytes', () => {
  it('returns 0 B for empty', () => {
    expect(formatBytes(null)).toBe('0 B');
    expect(formatBytes(0)).toBe('0 B');
  });
  it('formats bytes', () => {
    expect(formatBytes(512)).toBe('512 B');
  });
  it('formats kilobytes', () => {
    expect(formatBytes(2048)).toBe('2.0 KB');
  });
  it('formats megabytes', () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
  it('accepts bigint input', () => {
    expect(formatBytes(1024n)).toBe('1.0 KB');
  });
});

describe('toGematria', () => {
  it('writes single letters with a geresh', () => {
    expect(toGematria(1)).toBe('א׳');
    expect(toGematria(20)).toBe('כ׳');
  });
  it('writes multi-letter numbers with gershayim before the last letter', () => {
    expect(toGematria(19)).toBe('י״ט');
    expect(toGematria(30)).toBe('ל׳');
    expect(toGematria(26)).toBe('כ״ו');
  });
  it('uses ט״ו / ט״ז for 15 and 16', () => {
    expect(toGematria(15)).toBe('ט״ו');
    expect(toGematria(16)).toBe('ט״ז');
  });
  it('drops the thousands of a Hebrew year', () => {
    expect(toGematria(5787)).toBe('תשפ״ז');
    expect(toGematria(5786)).toBe('תשפ״ו');
  });
});

describe('toHebrewDate', () => {
  it('writes the day and year in Hebrew letters', () => {
    expect(toHebrewDate('2026-09-01')).toBe('י״ט באלול תשפ״ו');
  });
  it('returns an empty string for a missing date', () => {
    expect(toHebrewDate(null)).toBe('');
    expect(toHebrewDate('')).toBe('');
  });
});

describe('markdownToPlainText', () => {
  it('strips Markdown syntax for a one-line preview', () => {
    expect(markdownToPlainText('# כותרת\n\n**חשוב:** ראי [קישור](https://x.com)\n- פריט')).toBe('כותרת חשוב: ראי קישור פריט');
  });
});
