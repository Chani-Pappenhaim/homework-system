import { describe, it, expect } from 'vitest';
import { dayRangeQuery, dayRangeWhere } from '../../src/utils/date-range';

describe('dayRangeWhere', () => {
  it('covers whole days, the last one included', () => {
    expect(dayRangeWhere({ from: '2026-10-01', to: '2026-10-01' })).toEqual({
      gte: new Date('2026-10-01T00:00:00Z'), lt: new Date('2026-10-02T00:00:00Z'),
    });
  });

  it('leaves an end open when it is not given, and is nothing when both are', () => {
    expect(dayRangeWhere({ from: '2026-10-01' })).toEqual({ gte: new Date('2026-10-01T00:00:00Z') });
    expect(dayRangeWhere({ to: '2026-12-31' })).toEqual({ lt: new Date('2027-01-01T00:00:00Z') });
    expect(dayRangeWhere({})).toBeUndefined();
  });

  it('refuses a day that is not real, or a range that ends before it starts', () => {
    expect(() => dayRangeWhere({ from: '2026-02-30' })).toThrow(expect.objectContaining({ status: 400 }));
    expect(() => dayRangeWhere({ to: '1/10/2026' })).toThrow(expect.objectContaining({ status: 400 }));
    expect(() => dayRangeWhere({ from: '2026-10-02', to: '2026-10-01' })).toThrow(expect.objectContaining({ status: 400 }));
  });
});

describe('dayRangeQuery', () => {
  it('takes only non-empty text values', () => {
    expect(dayRangeQuery({ from: '2026-10-01', to: '' })).toEqual({ from: '2026-10-01', to: undefined });
    expect(dayRangeQuery({ from: ['a', 'b'] })).toEqual({ from: undefined, to: undefined });
  });
});
