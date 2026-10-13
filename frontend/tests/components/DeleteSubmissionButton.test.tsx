import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeleteSubmissionButton } from '@/components/student/DeleteSubmissionButton';
import { renderWithProviders } from '../utils/render';
import type { MySubmission } from '@/types';

vi.mock('@/api/submissions.api', () => ({ submissionsApi: { deleteMine: vi.fn() } }));

import { submissionsApi } from '@/api/submissions.api';
const deleteMine = submissionsApi.deleteMine as unknown as ReturnType<typeof vi.fn>;

const sub = (over: Partial<MySubmission> = {}): MySubmission => ({
  submissionId: 'sub1', id: 'sub1', assignmentId: 'a1', assignmentTitle: 'תרגיל 1',
  lessonTopic: 'שיעור', courseName: 'קורס', submittedAt: '2026-10-01T10:00:00Z', isLate: false,
  grade: null, deleteBlockedReason: null, ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('DeleteSubmissionButton', () => {
  it('deletes after the student confirms', async () => {
    const onDeleted = vi.fn();
    deleteMine.mockResolvedValue({});
    renderWithProviders(<DeleteSubmissionButton submission={sub()} onDeleted={onDeleted} />);
    await userEvent.click(screen.getByRole('button', { name: /מחיקת ההגשה/ }));
    expect(deleteMine).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'מחיקה' }));
    await waitFor(() => expect(deleteMine).toHaveBeenCalledWith('sub1'));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
  });

  it('shows why instead of a button once deleting is blocked', () => {
    renderWithProviders(<DeleteSubmissionButton submission={sub({ deleteBlockedReason: 'המורה כבר בדקה את ההגשה' })} />);
    expect(screen.queryByRole('button', { name: /מחיקת ההגשה/ })).not.toBeInTheDocument();
    expect(screen.getByText('המורה כבר בדקה את ההגשה')).toBeInTheDocument();
  });
});
