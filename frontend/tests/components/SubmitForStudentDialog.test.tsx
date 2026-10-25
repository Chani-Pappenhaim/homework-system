import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SubmitForStudentDialog } from '@/components/lesson/SubmitForStudentDialog';
import { renderWithProviders } from '../utils/render';

vi.mock('@/api/assignments.api', () => ({ assignmentsApi: { students: vi.fn(), submitForStudent: vi.fn() } }));
import { assignmentsApi } from '@/api/assignments.api';
const students = assignmentsApi.students as unknown as ReturnType<typeof vi.fn>;
const submitForStudent = assignmentsApi.submitForStudent as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  students.mockResolvedValue({ data: { success: true, data: { students: [
    { id: 's1', name: 'דינה', email: 'd@x.com', submitted: false },
    { id: 's2', name: 'רחל', email: 'r@x.com', submitted: true },
  ] } } });
});

describe('SubmitForStudentDialog', () => {
  it("submits a student's repo, marked late when the teacher says so", async () => {
    submitForStudent.mockResolvedValue({ data: { success: true, data: { submission: { id: 'new' } } } });
    const onSubmitted = vi.fn();
    renderWithProviders(<SubmitForStudentDialog assignmentId="a1" open onOpenChange={() => {}} onSubmitted={onSubmitted} />);
    const submit = screen.getByRole('button', { name: 'הגשה' });
    expect(submit).toBeDisabled();
    await userEvent.selectOptions(await screen.findByRole('combobox'), await screen.findByRole('option', { name: 'דינה' }));
    await userEvent.type(screen.getByPlaceholderText('https://github.com/user/repo'), 'hw1');
    await userEvent.click(screen.getByLabelText('לסמן כהגשה באיחור'));
    await userEvent.click(submit);
    await waitFor(() => expect(submitForStudent).toHaveBeenCalledWith('a1', { studentId: 's1', isLate: true, repo: 'hw1' }));
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith('new'));
  });

  it('says a new submission replaces the one a student already has', async () => {
    renderWithProviders(<SubmitForStudentDialog assignmentId="a1" open onOpenChange={() => {}} />);
    await userEvent.selectOptions(await screen.findByRole('combobox'), await screen.findByRole('option', { name: 'רחל (כבר הגישה)' }));
    expect(screen.getByText('ההגשה החדשה תחליף את ההגשה הקיימת שלה.')).toBeInTheDocument();
  });
});
