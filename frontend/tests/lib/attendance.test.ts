import { describe, it, expect } from 'vitest';
import { attendanceRate } from '@/lib/attendance';

describe('attendanceRate', () => {
  it('counts a partial attendance as half an absence', () => {
    expect(attendanceRate(3, 1, 1)).toBe(70);
    expect(attendanceRate(0, 0, 2)).toBe(50);
    expect(attendanceRate(4, 0, 0)).toBe(100);
  });

  it('has no rate before any meeting is marked', () => {
    expect(attendanceRate(0, 0, 0)).toBeNull();
  });
});
