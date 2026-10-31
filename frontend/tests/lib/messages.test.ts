import { describe, it, expect } from 'vitest';
import { replyCountLabel, threadTitle } from '@/lib/messages';
import { REACTION_EMOJIS } from '@/lib/reactions';
import { entry, listRow } from '../utils/messageFixtures';

describe('replyCountLabel', () => {
  it('says nothing for a thread without replies', () => {
    expect(replyCountLabel(0)).toBeNull();
    expect(replyCountLabel(-1)).toBeNull();
  });
  it('uses the singular for one reply and the plural from two', () => {
    expect(replyCountLabel(1)).toBe('תגובה אחת');
    expect(replyCountLabel(2)).toBe('2 תגובות');
    expect(replyCountLabel(12)).toBe('12 תגובות');
  });
});

describe('threadTitle', () => {
  it('prefers the subject', () => {
    const t = threadTitle(listRow({ id: 'a', subject: 'נושא', lastEntry: entry({ id: 'e', content: 'גוף' }) }));
    expect(t).toEqual({ text: 'נושא', isSubject: true });
  });
  it('falls back to the newest message as plain text', () => {
    const t = threadTitle(listRow({ id: 'a', lastEntry: entry({ id: 'e', content: '**מודגש** טקסט' }) }));
    expect(t.isSubject).toBe(false);
    expect(t.text).toContain('מודגש');
    expect(t.text).not.toContain('**');
  });
});

describe('REACTION_EMOJIS', () => {
  it('offers the six agreed emojis', () => {
    expect([...REACTION_EMOJIS]).toEqual(['👍', '❤️', '😂', '😮', '🙏', '✅']);
  });
});
