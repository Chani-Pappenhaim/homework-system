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

import { gradesApi } from '@/api/grades.api';
import { groupsApi } from '@/api/groups.api';
import { coursesApi } from '@/api/courses.api';

const report = gradesApi.report as unknown as ReturnType<typeof vi.fn>;
const groupsList = groupsApi.list as unknown as ReturnType<typeof vi.fn>;
const coursesList = coursesApi.list as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  groupsList.mockResolvedValue({ data: { data: { groups: [{ id: 'g1', name: 'קבוצה א', year: '2026', studentCount: 0, createdAt: '' }] } } });
  coursesList.mockResolvedValue({ data: { data: { courses: [{ id: 'c1', name: 'קורס א', groupId: 'g1', lessonCount: 0, hidden: false, createdAt: '' }] } } });
});

const rows = [
  { studentName: 'נועה', studentEmail: 'noa@x.com', groupName: 'קבוצה א', courseName: 'קורס א', lessonTopic: 'שיעור 1', assignmentTitle: 'מטלה 1', submittedAt: '2026-07-01T10:00:00Z', isLate: true, score: 88 },
];

describe('ReportsPage', () => {
  it('renders report rows returned by the api', async () => {
    report.mockResolvedValue({ data: { data: { report: rows } } });
    renderWithProviders(<ReportsPage />);
    expect(await screen.findByText('נועה')).toBeInTheDocument();
    expect(screen.getByText('88')).toBeInTheDocument();
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
    expect(await screen.findByRole('option', { name: 'קבוצה א' })).toBeInTheDocument();
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
});
