import { describe, it, expect } from 'vitest';
import { groupDisplayName } from '../../src/utils/group-name';

describe('groupDisplayName', () => {
  it('joins seminar, class and year', () => {
    expect(groupDisplayName({ name: 'יד', seminar: 'סמינר מאיר', year: 'תשפ״ז' })).toBe('סמינר מאיר יד תשפ״ז');
  });

  it('drops missing or blank parts', () => {
    expect(groupDisplayName({ name: 'יד', seminar: null, year: ' ' })).toBe('יד');
  });

  it('returns an empty string without a group', () => {
    expect(groupDisplayName(undefined)).toBe('');
  });
});
