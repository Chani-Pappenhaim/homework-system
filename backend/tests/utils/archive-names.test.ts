import { describe, it, expect } from 'vitest';
import { safeSegment, createNameAllocator } from '../../src/utils/archive-names';

describe('safeSegment', () => {
  it('keeps Hebrew names as they are', () => {
    expect(safeSegment('רחל כהן')).toBe('רחל כהן');
    expect(safeSegment('תרגיל מסכם.pdf')).toBe('תרגיל מסכם.pdf');
  });

  it('replaces path separators and characters Windows forbids', () => {
    expect(safeSegment('a/b\\c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j');
  });

  it('cannot climb out of its folder', () => {
    expect(safeSegment('../../etc/passwd')).toBe('_.._etc_passwd');
    expect(safeSegment('..')).toBe('file');
  });

  it('drops control and bidi-override characters', () => {
    expect(safeSegment('a\u0000b‮c‏d')).toBe('abcd');
  });

  it('trims surrounding dots and spaces, which Windows removes anyway', () => {
    expect(safeSegment('  name. ')).toBe('name');
  });

  it('collapses runs of whitespace', () => {
    expect(safeSegment('a   \t b')).toBe('a b');
  });

  it('uses the fallback when nothing is left', () => {
    expect(safeSegment('')).toBe('file');
    expect(safeSegment('...')).toBe('file');
    expect(safeSegment('\u0001', 'תלמידה')).toBe('תלמידה');
  });

  it('prefixes names Windows reserves', () => {
    expect(safeSegment('CON')).toBe('_CON');
    expect(safeSegment('nul.txt')).toBe('_nul.txt');
    expect(safeSegment('console')).toBe('console');
  });

  it('shortens a long name but keeps its extension', () => {
    const out = safeSegment(`${'א'.repeat(200)}.pdf`);
    expect(out.length).toBe(80);
    expect(out.endsWith('.pdf')).toBe(true);
  });

  it('shortens a long name that has no extension', () => {
    expect(safeSegment('ב'.repeat(200)).length).toBe(80);
  });
});

describe('createNameAllocator', () => {
  it('returns a name unchanged the first time', () => {
    const allocate = createNameAllocator();
    expect(allocate('רחל כהן')).toBe('רחל כהן');
  });

  it('numbers a repeated name', () => {
    const allocate = createNameAllocator();
    expect(allocate('רחל')).toBe('רחל');
    expect(allocate('רחל')).toBe('רחל (2)');
    expect(allocate('רחל')).toBe('רחל (3)');
  });

  it('numbers before the extension', () => {
    const allocate = createNameAllocator();
    allocate('report.pdf');
    expect(allocate('report.pdf')).toBe('report (2).pdf');
  });

  it('treats names that differ only in case as the same', () => {
    const allocate = createNameAllocator();
    allocate('Dana');
    expect(allocate('dana')).toBe('dana (2)');
  });

  it('does not hand out a number that is already taken', () => {
    const allocate = createNameAllocator();
    allocate('x (2)');
    allocate('x');
    expect(allocate('x')).toBe('x (3)');
  });
});
