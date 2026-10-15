import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StudentsImportPanel } from '@/components/teacher/StudentsImportPanel';
import { renderWithProviders } from '../utils/render';

vi.mock('@/api/groups.api', () => ({
  groupsApi: { importStudents: vi.fn(), downloadImportTemplate: vi.fn() },
}));

import { groupsApi } from '@/api/groups.api';
const importStudents = groupsApi.importStudents as unknown as ReturnType<typeof vi.fn>;

const reply = (data: object) => ({ data: { data: { dryRun: true, totalRows: 0, toAdd: 0, alreadyInGroup: 0, errors: [], ...data } } });

async function pickFile(container: HTMLElement) {
  const file = new File(['x'], 'students.xlsx');
  await userEvent.upload(container.querySelector('input[type="file"]') as HTMLInputElement, file);
  await userEvent.click(screen.getByText('העלה קובץ'));
  return file;
}

beforeEach(() => vi.clearAllMocks());

describe('StudentsImportPanel', () => {
  it('says which columns are required', () => {
    renderWithProviders(<StudentsImportPanel groupId="g1" onDone={() => {}} />);
    expect(screen.getAllByText('חובה')).toHaveLength(2);
    expect(screen.getByText('רשות')).toBeInTheDocument();
  });

  it('checks the file first and lists each row error without adding anything', async () => {
    importStudents.mockResolvedValueOnce(reply({ totalRows: 3, toAdd: 2, errors: ['שורה 3: חסרה כתובת אימייל'] }));
    const { container } = renderWithProviders(<StudentsImportPanel groupId="g1" onDone={() => {}} />);
    const file = await pickFile(container);

    expect(await screen.findByText('שורה 3: חסרה כתובת אימייל')).toBeInTheDocument();
    expect(importStudents).toHaveBeenCalledTimes(1);
    expect(importStudents).toHaveBeenCalledWith('g1', file, true);
    expect(screen.getByRole('button', { name: 'הוסיפי רק את 2 השורות התקינות' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'לא להוסיף - אתקן את הקובץ' })).toBeInTheDocument();
  });

  it('adds only the valid rows when the teacher confirms', async () => {
    const onDone = vi.fn();
    importStudents
      .mockResolvedValueOnce(reply({ totalRows: 3, toAdd: 2, errors: ['שורה 3: חסר שם'] }))
      .mockResolvedValueOnce(reply({ dryRun: false, totalRows: 3, toAdd: 2, errors: ['שורה 3: חסר שם'] }));
    const { container } = renderWithProviders(<StudentsImportPanel groupId="g1" onDone={onDone} />);
    const file = await pickFile(container);
    await userEvent.click(await screen.findByRole('button', { name: 'הוסיפי רק את 2 השורות התקינות' }));

    await waitFor(() => expect(importStudents).toHaveBeenLastCalledWith('g1', file));
    expect(await screen.findByText('נוספו 2 תלמידות', { selector: 'li' })).toBeInTheDocument();
  });

  it('adds nothing when the teacher chooses to fix the file', async () => {
    importStudents.mockResolvedValueOnce(reply({ totalRows: 2, toAdd: 1, errors: ['שורה 2: חסר שם'] }));
    const { container } = renderWithProviders(<StudentsImportPanel groupId="g1" onDone={() => {}} />);
    await pickFile(container);
    await userEvent.click(await screen.findByRole('button', { name: 'לא להוסיף - אתקן את הקובץ' }));

    expect(importStudents).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('שורה 2: חסר שם')).not.toBeInTheDocument();
    expect(container.querySelector('input[type="file"]')).toBeInTheDocument();
  });

  it('a clean file is added and the dialog closes', async () => {
    const onDone = vi.fn();
    importStudents
      .mockResolvedValueOnce(reply({ totalRows: 2, toAdd: 2 }))
      .mockResolvedValueOnce(reply({ dryRun: false, totalRows: 2, toAdd: 2 }));
    const { container } = renderWithProviders(<StudentsImportPanel groupId="g1" onDone={onDone} />);
    await pickFile(container);
    await userEvent.click(await screen.findByRole('button', { name: 'הוסיפי 2 תלמידות' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });
});
