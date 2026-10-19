import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AssignmentView } from '@/components/lesson/AssignmentView';
import { ToastProvider } from '@/components/ui/toast';
import { renderWithProviders } from '../utils/render';

vi.mock('@/components/lesson/SubmissionsWorkstation', () => ({ SubmissionsWorkstation: () => null }));
vi.mock('@/api/submissions.api', () => ({
  submissionsApi: { downloadAssignmentImportTemplate: vi.fn(), importAssignmentSubmissions: vi.fn() },
}));
import { submissionsApi } from '@/api/submissions.api';
const importSubs = submissionsApi.importAssignmentSubmissions as unknown as ReturnType<typeof vi.fn>;

const assignment = {
  id: 'a1', lessonId: 'l1', title: 'תרגיל useState', allowedTypes: [], allowGithub: true, allowFile: false,
};

function renderView() {
  return renderWithProviders(
    <ToastProvider>
      <AssignmentView
        assignment={assignment}
        section="submissions"
        onSectionChange={() => {}}
        selectedSubmissionId={undefined}
        onSelectSubmission={() => {}}
        onBack={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    </ToastProvider>,
  );
}

describe('AssignmentView - the link for the students', () => {
  it('copies the address students open the assignment at, not the teacher page', async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole('button', { name: /העתקת קישור לתלמידות/ }));
    await waitFor(async () =>
      expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/student/assignments?assignment=a1`));
    expect(await screen.findByText(/הקישור הועתק/)).toBeInTheDocument();
  });

  it('shows the link to copy by hand when the browser refuses the clipboard', async () => {
    const user = userEvent.setup();
    renderView();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('denied'));
    await user.click(screen.getByRole('button', { name: /העתקת קישור לתלמידות/ }));
    expect(await screen.findByText(/student\/assignments\?assignment=a1/)).toBeInTheDocument();
  });
});

describe('AssignmentView - importing its submissions from a sheet', () => {
  it('uploads the sheet for this assignment and reports what was saved and what was not', async () => {
    importSubs.mockResolvedValue({ data: { data: {
      imported: 2, unchanged: 1, empty: 4, errors: ['שורה 5: הריפו github.com/x/y לא נמצא (או שאינו ציבורי)'],
    } } });
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole('button', { name: /ייבוא הגשות מקובץ/ }));
    const dialog = await screen.findByRole('dialog');
    const file = new File(['x'], 'subs.xlsx');
    await user.upload(dialog.querySelector('input[type="file"]') as HTMLInputElement, file);
    await user.click(screen.getByRole('button', { name: 'העלה קובץ' }));

    expect(await screen.findByText(/נשמרו 2 הגשות/)).toBeInTheDocument();
    expect(screen.getByText(/4 בלי ריפו/)).toBeInTheDocument();
    expect(screen.getByText(/github.com\/x\/y לא נמצא/)).toBeInTheDocument();
    expect(importSubs).toHaveBeenCalledWith('a1', file);
  });
});
