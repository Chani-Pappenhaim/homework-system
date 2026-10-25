import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SubmissionsWorkstation } from '@/components/lesson/SubmissionsWorkstation';
import { renderWithProviders } from '../utils/render';
import type { AssignmentDTO } from '@/types';

vi.mock('@/api/assignments.api', () => ({ assignmentsApi: { getSubmissions: vi.fn() } }));
vi.mock('@/api/submissions.api', () => ({ submissionsApi: { deleteAsTeacher: vi.fn(), bulkApproveContent: vi.fn() } }));
vi.mock('@/components/lesson/GradePanel', () => ({ GradePanel: () => <div>grade panel</div> }));

import { assignmentsApi } from '@/api/assignments.api';
import { submissionsApi } from '@/api/submissions.api';
const getSubmissions = assignmentsApi.getSubmissions as unknown as ReturnType<typeof vi.fn>;
const deleteAsTeacher = submissionsApi.deleteAsTeacher as unknown as ReturnType<typeof vi.fn>;

const assignment = { id: 'a1', title: 'תרגיל' } as AssignmentDTO;

beforeEach(() => {
  vi.clearAllMocks();
  getSubmissions.mockResolvedValue({ data: { success: true, data: { submissions: [
    { id: 'sub1', studentName: 'דינה', studentEmail: 'd@x.com', submittedAt: '2026-10-01T10:00:00Z', isLate: false, grade: { contentScore: 90 } },
  ] } } });
});

describe('SubmissionsWorkstation - deleting a submission', () => {
  it('deletes the open submission once the teacher confirms', async () => {
    deleteAsTeacher.mockResolvedValue({});
    renderWithProviders(<SubmissionsWorkstation assignment={assignment} selectedId="sub1" onSelect={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: 'מחיקת ההגשה' }));
    expect(await screen.findByText('למחוק את ההגשה של דינה?')).toBeInTheDocument();
    expect(deleteAsTeacher).not.toHaveBeenCalled();
    const buttons = screen.getAllByRole('button', { name: 'מחיקת ההגשה' });
    await userEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(deleteAsTeacher).toHaveBeenCalledWith('sub1'));
  });
});
