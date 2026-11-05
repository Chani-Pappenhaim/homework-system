import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GradePanel } from '@/components/lesson/GradePanel';
import { ToastProvider } from '@/components/ui/toast';
import { renderWithProviders } from '../utils/render';
import type { AssignmentDTO, SubmissionDTO } from '@/types';

vi.mock('@/api/submissions.api', () => ({
  submissionsApi: { unapproveContent: vi.fn(), saveGrade: vi.fn(), approveContent: vi.fn() },
}));
import { submissionsApi } from '@/api/submissions.api';
const unapproveContent = submissionsApi.unapproveContent as unknown as ReturnType<typeof vi.fn>;

const assignment = { id: 'a1', title: 'תרגיל', type: 'CODE' } as unknown as AssignmentDTO;
const submission = (approved: boolean) => ({
  id: 'sub1', studentName: 'דינה', studentEmail: 'd@x.com', submittedAt: '2026-10-01T10:00:00Z', isLate: false,
  grade: { contentScore: 90, feedback: 'יפה', contentApproved: approved },
}) as unknown as SubmissionDTO;

const renderPanel = (approved: boolean) =>
  renderWithProviders(<ToastProvider><GradePanel submission={submission(approved)} assignment={assignment} /></ToastProvider>);

beforeEach(() => vi.clearAllMocks());

describe('GradePanel - hiding an approved grade', () => {
  it('offers to hide a grade the student can already see, and calls the server', async () => {
    unapproveContent.mockResolvedValue({ data: { success: true } });
    renderPanel(true);
    await userEvent.click(await screen.findByRole('button', { name: 'הסתירי את הציון מהתלמידה' }));
    await waitFor(() => expect(unapproveContent).toHaveBeenCalledWith('sub1'));
    expect(await screen.findByText('הציון הוסתר מהתלמידה')).toBeInTheDocument();
  });

  it('does not offer it while the grade is still hidden', async () => {
    renderPanel(false);
    await screen.findByText('שמור ציון');
    expect(screen.queryByRole('button', { name: 'הסתירי את הציון מהתלמידה' })).not.toBeInTheDocument();
  });
});
