import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GradesImportDialog } from '@/components/lesson/GradesImportDialog';
import { renderWithProviders } from '../utils/render';

vi.mock('@/api/grades.api', () => ({
  gradesApi: { downloadImportTemplate: vi.fn(), previewImport: vi.fn(), importGrades: vi.fn() },
}));
vi.mock('@/lib/utils', async (importOriginal) => ({ ...(await importOriginal<object>()), downloadBlob: vi.fn() }));
import { gradesApi } from '@/api/grades.api';
import { downloadBlob } from '@/lib/utils';

const template = gradesApi.downloadImportTemplate as unknown as ReturnType<typeof vi.fn>;
const previewImport = gradesApi.previewImport as unknown as ReturnType<typeof vi.fn>;
const importGrades = gradesApi.importGrades as unknown as ReturnType<typeof vi.fn>;

const update = (over = {}) => ({
  rowNumber: 2, submissionId: 's1', studentName: 'רחל', email: 'r@x.com', contentScore: 90, publishable: true, ...over,
});
const preview = (over = {}) => ({ data: { data: { updates: [update()], unchanged: 0, empty: 0, errors: [], ...over } } });

async function pickFile(file = new File(['x'], 'grades.xlsx')) {
  const user = userEvent.setup();
  renderWithProviders(<GradesImportDialog assignmentId="a1" open onOpenChange={() => {}} />);
  const dialog = await screen.findByRole('dialog');
  await user.upload(dialog.querySelector('input[type="file"]') as HTMLInputElement, file);
  await user.click(screen.getByRole('button', { name: 'העלה קובץ' }));
  return { user, file };
}

beforeEach(() => vi.clearAllMocks());

describe('GradesImportDialog', () => {
  it('downloads the template for this assignment', async () => {
    template.mockResolvedValue({ data: new Blob(['x']) });
    renderWithProviders(<GradesImportDialog assignmentId="a1" open onOpenChange={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /הורדת הקובץ עם התלמידות/ }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'assignment-grades.xlsx'));
    expect(template).toHaveBeenCalledWith('a1');
  });

  it('previews what the file changes before anything is saved', async () => {
    previewImport.mockResolvedValue(preview({ unchanged: 2, empty: 1 }));
    const { file } = await pickFile();

    expect(await screen.findByText(/1 ציונים ישתנו/)).toBeInTheDocument();
    expect(screen.getByText(/2 זהים למה ששמור/)).toBeInTheDocument();
    expect(screen.getByText(/1 בלי ציון/)).toBeInTheDocument();
    expect(screen.getByText(/ציון תוכן 90/)).toBeInTheDocument();
    expect(previewImport).toHaveBeenCalledWith('a1', file);
    expect(importGrades).not.toHaveBeenCalled();
  });

  it('saves the same file, without publishing, when the box is left unticked', async () => {
    previewImport.mockResolvedValue(preview());
    importGrades.mockResolvedValue({ data: { data: { updated: 1, unchanged: 0, empty: 0, published: 0 } } });
    const { user, file } = await pickFile();

    await user.click(await screen.findByRole('button', { name: 'שמירת הציונים' }));
    expect(await screen.findByText(/נשמרו 1 ציונים/)).toBeInTheDocument();
    expect(importGrades).toHaveBeenCalledWith('a1', file, false);
  });

  it('publishes to the students when the teacher ticks the box', async () => {
    previewImport.mockResolvedValue(preview());
    importGrades.mockResolvedValue({ data: { data: { updated: 1, unchanged: 0, empty: 0, published: 1 } } });
    const { user, file } = await pickFile();

    await user.click(await screen.findByRole('checkbox', { name: /להציג את ציוני התוכן לתלמידות/ }));
    await user.click(screen.getByRole('button', { name: 'שמירת הציונים' }));
    expect(await screen.findByText(/1 ציוני תוכן הוצגו לתלמידות/)).toBeInTheDocument();
    expect(importGrades).toHaveBeenCalledWith('a1', file, true);
  });

  it('offers no publish choice when nothing could be published', async () => {
    previewImport.mockResolvedValue(preview({ updates: [update({ publishable: false, contentScore: undefined, feedback: 'יפה' })] }));
    await pickFile();
    await screen.findByText(/1 ציונים ישתנו/);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('lists the errors and will not save a file that has any', async () => {
    previewImport.mockResolvedValue(preview({ errors: ['שורה 3: ציון ההגשה "101" אינו מספר בין 0 ל-100', 'שורה 4: x@x.com אינה תלמידה בקורס של המטלה'] }));
    await pickFile();

    expect(await screen.findByText(/שורה 3: ציון ההגשה "101"/)).toBeInTheDocument();
    expect(screen.getByText(/שורה 4: x@x.com/)).toBeInTheDocument();
    expect(screen.getByText(/2 שגיאות/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'שמירת הציונים' })).toBeDisabled();
  });

  it('will not save a file that changes nothing', async () => {
    previewImport.mockResolvedValue(preview({ updates: [], unchanged: 3 }));
    await pickFile();
    await screen.findByText(/0 ציונים ישתנו/);
    expect(screen.getByRole('button', { name: 'שמירת הציונים' })).toBeDisabled();
  });

  it('shows the server message when the file cannot be read', async () => {
    previewImport.mockRejectedValue({ response: { data: { error: 'הקובץ אינו תבנית הציונים' } } });
    await pickFile();
    expect(await screen.findByText('הקובץ אינו תבנית הציונים')).toBeInTheDocument();
  });

  it('shows the server message when the save is refused, keeping the preview', async () => {
    previewImport.mockResolvedValue(preview());
    importGrades.mockRejectedValue({ response: { data: { error: 'בקובץ יש 1 שגיאות. יש לתקן אותן ולהעלות שוב' } } });
    const { user } = await pickFile();
    await user.click(await screen.findByRole('button', { name: 'שמירת הציונים' }));
    expect(await screen.findByText(/בקובץ יש 1 שגיאות/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'שמירת הציונים' })).toBeEnabled();
  });
});
