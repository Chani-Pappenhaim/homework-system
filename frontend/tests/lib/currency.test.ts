import { describe, it, expect } from 'vitest';
import { formatUsd } from '@/lib/currency';

describe('formatUsd', () => {
  it('shows nothing billed as $0.00', () => {
    expect(formatUsd(0)).toBe('$0.00');
    expect(formatUsd(null)).toBe('$0.00');
    expect(formatUsd(undefined)).toBe('$0.00');
  });

  it('never rounds a real sub-cent cost down to $0.00', () => {
    expect(formatUsd(0.004)).toBe('<$0.01');
    expect(formatUsd(0.0000375)).toBe('<$0.01');
  });

  it('rounds to cents from one cent up', () => {
    expect(formatUsd(0.01)).toBe('$0.01');
    expect(formatUsd(1.956)).toBe('$1.96');
    expect(formatUsd(12)).toBe('$12.00');
  });
});
