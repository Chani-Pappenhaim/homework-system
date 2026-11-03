import { describe, it, expect } from 'vitest';
import { awaitingReview, teacherChecked } from '../../src/utils/grade-status';

const grade = (over = {}) => ({ gradedById: null, contentScore: null, feedback: null, contentApproved: false, ...over });

describe('awaitingReview', () => {
  it('is true with no grade or only the automatic submission score', () => {
    expect(awaitingReview(null)).toBe(true);
    expect(awaitingReview(grade())).toBe(true);
  });

  it('is true again after a resubmit, even though the old score and feedback remain', () => {
    expect(awaitingReview(grade({ contentScore: 80, feedback: 'fix X' }))).toBe(true);
  });

  it('is false once the teacher graded it, with feedback alone too', () => {
    expect(awaitingReview(grade({ gradedById: 't1', feedback: 'good' }))).toBe(false);
  });

  it('is false once the content score is approved', () => {
    expect(awaitingReview(grade({ contentApproved: true }))).toBe(false);
  });
});

describe('teacherChecked', () => {
  it('locks on any teacher input, but not on the automatic score', () => {
    expect(teacherChecked(null)).toBe(false);
    expect(teacherChecked(grade())).toBe(false);
    expect(teacherChecked(grade({ feedback: 'x' }))).toBe(true);
    expect(teacherChecked(grade({ gradedById: 't1' }))).toBe(true);
  });
});
