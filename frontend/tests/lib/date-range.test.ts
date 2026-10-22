import { describe, it, expect } from 'vitest';
import { dayRangeLabel, dayRangeParams } from '@/lib/date-range';

describe('dayRangeLabel', () => {
  it('names both ends, one end or neither in day-month-year order', () => {
    expect(dayRangeLabel({ from: '2026-10-01', to: '2026-10-31' })).toBe('01.10.2026 עד 31.10.2026');
    expect(dayRangeLabel({ from: '2026-10-01' })).toBe('מ-01.10.2026');
    expect(dayRangeLabel({ to: '2026-10-31' })).toBe('עד 31.10.2026');
    expect(dayRangeLabel({})).toBe('');
  });
});

describe('dayRangeParams', () => {
  it('leaves out an end that was not chosen', () => {
    expect(dayRangeParams({ from: '', to: '2026-10-31' })).toEqual({ to: '2026-10-31' });
    expect(dayRangeParams({ from: '', to: '' })).toEqual({});
  });
});
