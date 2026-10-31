import { describe, it, expect } from 'vitest';
import { avatarColor, avatarFileProblem, initialsOf, MAX_AVATAR_BYTES } from '@/lib/avatar';

describe('initialsOf', () => {
  it('takes the first letter of the first two words', () => {
    expect(initialsOf('דינה כהן')).toBe('דכ');
    expect(initialsOf('Dina Ben David')).toBe('DB');
  });

  it('copes with one word, extra spaces and an empty name', () => {
    expect(initialsOf('עדי')).toBe('ע');
    expect(initialsOf('  דינה   כהן ')).toBe('דכ');
    expect(initialsOf('   ')).toBe('?');
  });
});

describe('avatarColor', () => {
  it('is always the same for the same name', () => {
    expect(avatarColor('דינה כהן')).toBe(avatarColor('דינה כהן'));
  });

  it('is one of the palette colors', () => {
    for (const name of ['א', 'ב', 'דינה כהן', 'Sara', '']) {
      expect(['bg-clay', 'bg-indigo', 'bg-sage', 'bg-coral']).toContain(avatarColor(name));
    }
  });

  it('is not the same for every name', () => {
    const colors = new Set(['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח'].map(avatarColor));
    expect(colors.size).toBeGreaterThan(1);
  });
});

describe('avatarFileProblem', () => {
  const file = (type: string, size = 10) => new File([new Uint8Array(size)], 'a', { type });

  it('accepts JPEG, PNG and WEBP within the size limit', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) expect(avatarFileProblem(file(type))).toBeNull();
    expect(avatarFileProblem(file('image/png', MAX_AVATAR_BYTES))).toBeNull();
  });

  it('refuses other types', () => {
    expect(avatarFileProblem(file('image/gif'))).toMatch(/JPG, PNG/);
    expect(avatarFileProblem(file('application/pdf'))).not.toBeNull();
  });

  it('refuses a file over the limit', () => {
    expect(avatarFileProblem(file('image/png', MAX_AVATAR_BYTES + 1))).toMatch(/גדולה מדי/);
  });
});
