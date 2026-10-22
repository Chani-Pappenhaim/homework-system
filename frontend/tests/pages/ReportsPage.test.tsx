import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReportsPage, { distinctLabels } from '@/pages/teacher/ReportsPage';
import { renderWithProviders } from '../utils/render';

vi.mock('@/api/grades.api', () => ({
  gradesApi: {
    report: vi.fn(),
    exportReport: vi.fn(),
  },
}));
vi.mock('@/lib/utils', async (importOriginal) => ({ ...(await importOriginal<object>()), downloadBlob: vi.fn() }));
vi.mock('@/api/groups.api', () => ({ groupsApi: { list: vi.fn(), get: vi.fn() } }));
vi.mock('@/api/students.api', () => ({ studentsApi: { overview: vi.fn(), search: vi.fn() } }));
vi.mock('@/api/courses.api', () => ({ coursesApi: { list: vi.fn() } }));
vi.mock('@/api/submissions.api', () => ({
  submissionsApi: { importSubmissions: vi.fn(), downloadImportTemplate: vi.fn() },
}));

import { gradesApi } from '@/api/grades.api';
import { groupsApi } from '@/api/groups.api';
import { coursesApi } from '@/api/courses.api';
import { submissionsApi } from '@/api/submissions.api';
import { studentsApi } from '@/api/students.api';
import { downloadBlob } from '@/lib/utils';

const report = gradesApi.report as unknown as ReturnType<typeof vi.fn>;
const groupsList = groupsApi.list as unknown as ReturnType<typeof vi.fn>;
const coursesList = coursesApi.list as unknown as ReturnType<typeof vi.fn>;
const groupGet = groupsApi.get as unknown as ReturnType<typeof vi.fn>;
const overview = studentsApi.overview as unknown as ReturnType<typeof vi.fn>;

const twoGroups = [
  { id: 'g1', name: 'קבוצה א', year: '2026', studentCount: 0, createdAt: '' },
  { id: 'g2', name: 'קבוצה ב', year: '2026', studentCount: 0, createdAt: '' },
];
const sameNameCourses = [
  { id: 'c1', name: 'React', groupId: 'g1', groupName: 'קבוצה א', lessonCount: 0, hidden: false, createdAt: '' },
  { id: 'c2', name: 'React', groupId: 'g2', groupName: 'קבוצה ב', lessonCount: 0, hidden: false, createdAt: '' },
  { id: 'c3', name: 'Node', groupId: 'g2', groupName: 'קבוצה ב', lessonCount: 0, hidden: false, createdAt: '' },
];
const optionNames = (select: HTMLElement) => Array.from(select.querySelectorAll('option')).map((o) => o.textContent);

beforeEach(() => {
  vi.clearAllMocks();
  groupsList.mockResolvedValue({ data: { data: { groups: [{ id: 'g1', name: 'קבוצה א', year: '2026', studentCount: 0, createdAt: '' }] } } });
  coursesList.mockResolvedValue({ data: { data: { courses: [{ id: 'c1', name: 'קורס א', groupId: 'g1', lessonCount: 0, hidden: false, createdAt: '' }] } } });
  overview.mockResolvedValue({ data: { data: { students: [] } } });
  report.mockResolvedValue({ data: { data: { report: [] } } });
});

describe('distinctLabels', () => {
  it('adds the detail only to names that repeat', () => {
    const items = [{ n: 'דנה', d: 'a@x' }, { n: 'דנה', d: 'b@x' }, { n: 'רחל', d: 'c@x' }];
    expect(distinctLabels(items, (i) => i.n, (i) => i.d)).toEqual(['דנה · a@x', 'דנה · b@x', 'רחל']);
  });
});

describe('ReportsPage filters', () => {
  it('lists every student, from the uncapped overview, telling same-named students apart by email', async () => {
    overview.mockResolvedValue({ data: { data: { students: [
      { id: 's1', name: 'דנה', email: 'dana1@x.com', groupNames: [] },
      { id: 's2', name: 'דנה', email: 'dana2@x.com', groupNames: [] },
      { id: 's3', name: 'רחל', email: 'rachel@x.com', groupNames: [] },
    ] } } });
    renderWithProviders(<ReportsPage />);
    const students = screen.getByRole('combobox', { name: 'סינון לפי תלמידה' });
    await waitFor(() => expect(optionNames(students)).toEqual(['כל התלמידות', 'דנה · dana1@x.com', 'דנה · dana2@x.com', 'רחל']));
    expect(studentsApi.search).not.toHaveBeenCalled();
  });

  it('shows the group next to courses that share a name', async () => {
    coursesList.mockResolvedValue({ data: { data: { courses: sameNameCourses } } });
    renderWithProviders(<ReportsPage />);
    const courses = screen.getByRole('combobox', { name: 'סינון לפי קורס' });
    await waitFor(() => expect(optionNames(courses)).toEqual(['כל הקורסים', 'React · קבוצה א', 'React · קבוצה ב', 'Node']));
  });

  it("narrows the course list to the chosen group's courses", async () => {
    groupsList.mockResolvedValue({ data: { data: { groups: twoGroups } } });
    coursesList.mockResolvedValue({ data: { data: { courses: sameNameCourses } } });
    groupGet.mockResolvedValue({ data: { data: { group: { ...twoGroups[1], students: [], courses: [] } } } });
    renderWithProviders(<ReportsPage />);
    await screen.findByRole('option', { name: 'קבוצה ב 2026' });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'סינון לפי קבוצה' }), 'g2');
    expect(optionNames(screen.getByRole('combobox', { name: 'סינון לפי קורס' }))).toEqual(['כל הקורסים', 'React', 'Node']);
  });

  it('clears a chosen course that does not belong to the newly chosen group', async () => {
    groupsList.mockResolvedValue({ data: { data: { groups: twoGroups } } });
    coursesList.mockResolvedValue({ data: { data: { courses: sameNameCourses } } });
    groupGet.mockResolvedValue({ data: { data: { group: { ...twoGroups[0], students: [], courses: [] } } } });
    renderWithProviders(<ReportsPage />);
    await screen.findByRole('option', { name: 'Node' });
    const course = screen.getByRole('combobox', { name: 'סינון לפי קורס' });
    await userEvent.selectOptions(course, 'c3');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'סינון לפי קבוצה' }), 'g1');
    expect(course).toHaveValue('');
    await waitFor(() => expect(report).toHaveBeenLastCalledWith({ groupId: 'g1' }));
  });
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

describe('ReportsPage dates', () => {
  it('reports and exports only the work handed in on the chosen days, naming the file after them', async () => {
    (gradesApi.exportReport as any).mockResolvedValue({ data: new Blob(['x']) });
    renderWithProviders(<ReportsPage />, { initialEntries: ['/?courseId=c1&from=2026-10-01&to=2026-10-31'] });
    expect(screen.getByLabelText('הוגש מתאריך')).toHaveValue('2026-10-01');
    await waitFor(() => expect(report).toHaveBeenCalledWith({ courseId: 'c1', from: '2026-10-01', to: '2026-10-31' }));

    await userEvent.click(screen.getByRole('button', { name: /ייצוא Excel/ }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'ציונים 01.10.2026 עד 31.10.2026.xlsx'));
    expect(gradesApi.exportReport).toHaveBeenCalledWith({ courseId: 'c1', from: '2026-10-01', to: '2026-10-31' });
  });

  it('keeps a chosen day in the address and clears it with the other filters', async () => {
    renderWithProviders(<ReportsPage />);
    await screen.findByText('אין נתונים לפי הפילטרים הנבחרים');
    await userEvent.type(screen.getByLabelText('הוגש עד תאריך'), '2026-10-31');
    await waitFor(() => expect(report).toHaveBeenCalledWith({ to: '2026-10-31' }));
    await userEvent.click(screen.getByRole('button', { name: 'נקה פילטרים' }));
    expect(screen.getByLabelText('הוגש עד תאריך')).toHaveValue('');
  });

  it('leaves a backwards range out of the report and says why', async () => {
    renderWithProviders(<ReportsPage />, { initialEntries: ['/?from=2026-10-31&to=2026-10-01'] });
    expect(await screen.findByText(/הסינון לפי תאריכים לא הופעל/)).toBeInTheDocument();
    await waitFor(() => expect(report).toHaveBeenCalledWith({}));
  });

  it("shows the server's reason when the export is refused", async () => {
    const body = new Blob([JSON.stringify({ error: 'תאריך הסיום אינו תקין' })], { type: 'application/json' });
    (gradesApi.exportReport as any).mockRejectedValue({ isAxiosError: true, response: { status: 400, data: body } });
    renderWithProviders(<ReportsPage />);
    await userEvent.click(await screen.findByRole('button', { name: /ייצוא Excel/ }));
    expect(await screen.findByText('תאריך הסיום אינו תקין')).toBeInTheDocument();
  });
});
