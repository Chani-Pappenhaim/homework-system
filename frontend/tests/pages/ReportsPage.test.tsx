import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReportsPage from '@/pages/teacher/ReportsPage';
import { renderWithProviders } from '../utils/render';

vi.mock('@/api/grades.api', () => ({
  gradesApi: {
    report: vi.fn(),
    exportUrl: vi.fn(() => '/api/grades/report/export'),
  },
}));
vi.mock('@/api/groups.api', () => ({ groupsApi: { list: vi.fn() } }));
vi.mock('@/api/courses.api', () => ({ coursesApi: { list: vi.fn() } }));
vi.mock('@/api/submissions.api', () => ({
  submissionsApi: { importSubmissions: vi.fn(), downloadImportTemplate: vi.fn() },
}));

import { gradesApi } from '@/api/grades.api';
import { groupsApi } from '@/api/groups.api';
import { coursesApi } from '@/api/courses.api';
import { submissionsApi } from '@/api/submissions.api';

const report = gradesApi.report as unknown as ReturnType<typeof vi.fn>;
const groupsList = groupsApi.list as unknown as ReturnType<typeof vi.fn>;
const coursesList = coursesApi.list as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  groupsList.mockResolvedValue({ data: { data: { groups: [{ id: 'g1', name: 'קבוצה א', year: '2026', studentCount: 0, createdAt: '' }] } } });
  coursesList.mockResolvedValue({ data: { data: { courses: [{ id: 'c1', name: 'קורס א', groupId: 'g1', lessonCount: 0, hidden: false, createdAt: '' }] } } });
});

const rows = [
  { studentName: 'נועה', studentEmail: 'noa@x.com', groupName: 'קבוצה א', courseName: 'קורס א', lessonTopic: 'שיעור 1', assignmentTitle: 'מטלה 1', submittedAt: '2026-07-01T10:00:00Z', isLate: true, submissionScore: 88, contentScore: 74 },
];

describe('ReportsPage', () => {
  it('renders report rows with both submission and content scores', async () => {
    report.mockResolvedValue({ data: { data: { report: rows } } });
    renderWithProviders(<ReportsPage />);
    expect(await screen.findByText('נועה')).toBeInTheDocument();
    expect(screen.getByText('88')).toBeInTheDocument();
    expect(screen.getByText('74')).toBeInTheDocument();
    expect(screen.getByText('ציון הגשה')).toBeInTheDocument();
    expect(screen.getByText('ציון תוכן')).toBeInTheDocument();
    expect(screen.getByText('תוצאות (1)')).toBeInTheDocument();
  });

  it('shows the empty state when there are no rows', async () => {
    report.mockResolvedValue({ data: { data: { report: [] } } });
    renderWithProviders(<ReportsPage />);
    expect(await screen.findByText('אין נתונים לפי הפילטרים הנבחרים')).toBeInTheDocument();
  });

  it('populates the group and course filter dropdowns', async () => {
    report.mockResolvedValue({ data: { data: { report: [] } } });
    renderWithProviders(<ReportsPage />);
    expect(await screen.findByRole('option', { name: 'קבוצה א 2026' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'קורס א' })).toBeInTheDocument();
  });

  it('shows a clear-filters button after selecting a group and refetches', async () => {
    report.mockResolvedValue({ data: { data: { report: [] } } });
    renderWithProviders(<ReportsPage />);
    await screen.findByText('אין נתונים לפי הפילטרים הנבחרים');
    const groupSelect = screen.getAllByRole('combobox')[0];
    await userEvent.selectOptions(groupSelect, 'g1');
    expect(await screen.findByRole('button', { name: 'נקה פילטרים' })).toBeInTheDocument();
    await waitFor(() => expect(report).toHaveBeenCalledWith({ groupId: 'g1' }));
  });

  it('imports submissions from Excel and lists the rows that were not imported', async () => {
    report.mockResolvedValue({ data: { data: { report: [] } } });
    (submissionsApi.importSubmissions as any).mockResolvedValue({
      data: { data: { imported: 2, skipped: 1, errors: ['שורה 4: הריפו github.com/dina/x לא נמצא (או שאינו ציבורי)'] } },
    });
    renderWithProviders(<ReportsPage />);
    await userEvent.click(await screen.findByRole('button', { name: /ייבוא הגשות/ }));
    expect(await screen.findByText('ייבוא הגשות מ-Excel')).toBeInTheDocument();

    const input = document.body.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, new File(['x'], 'subs.xlsx'));
    await userEvent.click(screen.getByRole('button', { name: 'העלה קובץ' }));

    expect(await screen.findByText(/יובאו 2/)).toBeInTheDocument();
    expect(screen.getByText(/שורה 4: הריפו/)).toBeInTheDocument();
    expect(submissionsApi.importSubmissions).toHaveBeenCalledWith(expect.any(File));
  });

  it('downloads the submissions import template', async () => {
    report.mockResolvedValue({ data: { data: { report: [] } } });
    (submissionsApi.downloadImportTemplate as any).mockResolvedValue({ data: new Blob(['x']) });
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    renderWithProviders(<ReportsPage />);
    await userEvent.click(await screen.findByRole('button', { name: /ייבוא הגשות/ }));
    await userEvent.click(await screen.findByRole('button', { name: /הורדת קובץ לדוגמא/ }));
    await waitFor(() => expect(submissionsApi.downloadImportTemplate).toHaveBeenCalled());
  });
});
