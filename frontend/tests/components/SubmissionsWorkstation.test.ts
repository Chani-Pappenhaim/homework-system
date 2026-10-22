import { describe, it, expect } from 'vitest';
import { aiReviewPollInterval } from '@/components/lesson/SubmissionsWorkstation';

describe('aiReviewPollInterval', () => {
  it('keeps checking while an AI review is under way', () => {
    expect(aiReviewPollInterval([{ aiStatus: 'done' }, { aiStatus: 'pending' }])).toBe(5000);
  });

  it('stops once no review is running', () => {
    expect(aiReviewPollInterval([{ aiStatus: 'done' }, {}])).toBe(false);
    expect(aiReviewPollInterval([])).toBe(false);
  });
});
