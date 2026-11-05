import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AssignmentsImportDialog } from '@/components/lesson/AssignmentsImportDialog';
import { renderWithProviders } from '../utils/render';

vi.mock('@/api/assignments.api', () => ({
  assignmentsApi: { downloadImportTemplate: vi.fn(), importForCourse: vi.fn() },
}));
vi.mock('@/lib/utils', async (importOriginal) => ({ ...(await importOriginal<object>()), downloadBlob: vi.fn() }));

import { assignmentsApi } from '@/api/assignments.api';
import { downloadBlob } from '@/lib/utils';
const downloadTemplate = assignmentsApi.downloadImportTemplate as unknown as ReturnType<typeof vi.fn>;
const importForCourse = assignmentsApi.importForCourse as unknown as ReturnType<typeof vi.fn>;

function renderDialog() {
  return renderWithProviders(<AssignmentsImportDialog courseId="c1" open onOpenChange={vi.fn()} />);
}

/** The drop zone stages the chosen file and waits for an explicit confirmation. */
async function pickFile() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await userEvent.upload(input, new File(['x'], 'assignments.xlsx'));
  await userEvent.click(screen.getByRole('button', { name: 'העלה קובץ' }));
}

beforeEach(() => vi.clearAllMocks());

describe('AssignmentsImportDialog', () => {
  it('downloads the template of the course', async () => {
    downloadTemplate.mockResolvedValue({ data: new Blob(['x']) });
    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: /הורדת קובץ התבנית/ }));
    await waitFor(() => expect(downloadTemplate).toHaveBeenCalledWith('c1'));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'assignments-template.xlsx'));
  });

  it('uploads the file and shows how many were created, skipped and the rows that failed', async () => {
    importForCourse.mockResolvedValue({ data: { data: { imported: 3, skipped: 2, errors: ['שורה 5: חסר תיאור'] } } });
    renderDialog();
    await pickFile();
    await waitFor(() => expect(importForCourse).toHaveBeenCalledWith('c1', expect.any(File)));
    expect(await screen.findByText(/נוצרו 3 מטלות/)).toBeInTheDocument();
    expect(screen.getByText(/2 שורות ריקות - דולגו/)).toBeInTheDocument();
    expect(screen.getByText(/1 שורות לא נשמרו/)).toBeInTheDocument();
    expect(screen.getByText('שורה 5: חסר תיאור')).toBeInTheDocument();
  });

  it('shows the error when the import fails', async () => {
    importForCourse.mockRejectedValue(new Error('boom'));
    renderDialog();
    await pickFile();
    expect(await screen.findByText('הייבוא נכשל')).toBeInTheDocument();
  });
});
