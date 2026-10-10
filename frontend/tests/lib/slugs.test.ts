import { describe, it, expect } from 'vitest';
import { courseSlugs, lessonSegment, slugify } from '@/lib/slugs';

describe('slugify', () => {
  it('keeps Hebrew and joins words with dashes', () => {
    expect(slugify('תחביר בסיסי')).toBe('תחביר-בסיסי');
  });

  it('drops niqqud and punctuation', () => {
    expect(slugify('שִׁעוּר: "מבוא" (חלק א)')).toBe('שעור-מבוא-חלק-א');
  });

  it('lowercases English', () => {
    expect(slugify('Intro to C#')).toBe('intro-to-c');
  });
});

describe('courseSlugs', () => {
  it('numbers duplicates in creation order and avoids reserved words', () => {
    const slugs = courseSlugs([
      { id: 'b', name: 'מבוא', createdAt: '2026-02-01' },
      { id: 'a', name: 'מבוא', createdAt: '2026-01-01' },
      { id: 'n', name: 'New', createdAt: '2026-03-01' },
    ]);
    expect(slugs.get('a')).toBe('מבוא');
    expect(slugs.get('b')).toBe('מבוא-2');
    expect(slugs.get('n')).toBe('new-2');
  });
});

describe('courseSlugs with groups', () => {
  it('adds the group to a shared name, the year within one group, and a number after that', () => {
    const slugs = courseSlugs([
      { id: 'a', name: 'מבוא', groupName: 'כיתה א', year: '2025', createdAt: '2026-01-01' },
      { id: 'b', name: 'מבוא', groupName: 'כיתה ב', year: '2025', createdAt: '2026-01-02' },
      { id: 'c', name: 'מבוא', groupName: 'כיתה ב', year: '2026', createdAt: '2026-01-03' },
      { id: 'd', name: 'מבוא', groupName: 'כיתה ב', year: '2026', createdAt: '2026-01-04' },
      { id: 'u', name: 'יחיד', groupName: 'כיתה א', year: '2025', createdAt: '2026-01-05' },
    ]);
    expect(slugs.get('a')).toBe('מבוא-כיתה-א');
    expect(slugs.get('b')).toBe('מבוא-כיתה-ב-2025');
    expect(slugs.get('c')).toBe('מבוא-כיתה-ב-2026');
    expect(slugs.get('d')).toBe('מבוא-כיתה-ב-2026-2');
    expect(slugs.get('u')).toBe('יחיד');
  });

  it('never collides with another course whose name already reads that way', () => {
    const slugs = courseSlugs([
      { id: 'x', name: 'מבוא כיתה א', createdAt: '2026-01-01' },
      { id: 'a', name: 'מבוא', groupName: 'כיתה א', createdAt: '2026-01-02' },
      { id: 'b', name: 'מבוא', groupName: 'כיתה ב', createdAt: '2026-01-03' },
    ]);
    expect(new Set(slugs.values()).size).toBe(3);
    expect(slugs.get('a')).toBe('מבוא-כיתה-א-2');
  });
});

describe('lessonSegment', () => {
  it('puts the number before the topic', () => {
    expect(lessonSegment(3, 'לולאות')).toBe('3-לולאות');
  });

  it('is just the number for a topic without letters', () => {
    expect(lessonSegment(3, '???')).toBe('3');
  });
});
