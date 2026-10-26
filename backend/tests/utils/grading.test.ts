import { describe, it, expect } from 'vitest';
import { computeSubmissionScore, daysLate } from '../../src/utils/grading';

const deadline = new Date('2026-10-20T23:59:00Z');
const at = (iso: string) => new Date(iso);

describe('daysLate', () => {
  it('is 0 for a submission on time', () => {
    expect(daysLate(false, at('2026-10-25T10:00:00Z'), deadline)).toBe(0);
  });

  it('counts a started day as a whole one', () => {
    expect(daysLate(true, at('2026-10-21T00:05:00Z'), deadline)).toBe(1);
    expect(daysLate(true, at('2026-10-21T23:59:00Z'), deadline)).toBe(1);
    expect(daysLate(true, at('2026-10-22T00:00:00Z'), deadline)).toBe(2);
  });

  it('is one day for a submission the teacher marked late without a passed deadline', () => {
    expect(daysLate(true, at('2026-10-19T10:00:00Z'), deadline)).toBe(1);
    expect(daysLate(true, at('2026-10-19T10:00:00Z'), null)).toBe(1);
  });
});

describe('computeSubmissionScore', () => {
  it('docks the penalty for each day late, up to the maximum', () => {
    expect(computeSubmissionScore(0)).toBe(100);
    expect(computeSubmissionScore(3)).toBe(94);
    expect(computeSubmissionScore(30)).toBe(80);
    expect(computeSubmissionScore(3, undefined, { perDay: 10, max: 10 })).toBe(90);
    expect(computeSubmissionScore(3, undefined, { perDay: 0, max: 20 })).toBe(100);
  });

  it('also docks unchecked checklist items, never below 0', () => {
    expect(computeSubmissionScore(1, [{ checked: false }, { checked: true }])).toBe(93);
    expect(computeSubmissionScore(50, [{ checked: false }], { perDay: 100, max: 100 })).toBe(0);
  });
});
