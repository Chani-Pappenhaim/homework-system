import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AttendancePage from '@/pages/student/AttendancePage';
import { renderWithProviders } from '../utils/render';

vi.mock('@/api/attendance.api', () => ({ attendanceApi: { getMine: vi.fn() } }));
import { attendanceApi } from '@/api/attendance.api';
const getMine = attendanceApi.getMine as unknown as ReturnType<typeof vi.fn>;

const courses = [
  {
    courseId: 'c1', courseName: 'React',
    summary: { present: 3, absent: 1, excused: 1, sessions: 5 },
    sessions: [
      { id: 'a1', date: '2026-10-05T00:00:00.000Z', title: 'Hooks', status: 'ABSENT', homework: [{ id: 'h1', title: 'תרגיל', kind: 'site', done: true }] },
      { id: 'a2', date: '2026-10-12T00:00:00.000Z', title: null, status: null, homework: [] },
    ],
  },
  { courseId: 'c2', courseName: 'Node', summary: { present: 0, absent: 0, excused: 0, sessions: 0 }, sessions: [] },
];

beforeEach(() => {
  vi.clearAllMocks();
  getMine.mockResolvedValue({ data: { data: { courses } } });
});

describe('Student AttendancePage', () => {
  it('shows the rate, each meeting\'s status and the homework she did', async () => {
    renderWithProviders(<AttendancePage />);
    expect(await screen.findByText('75%')).toBeInTheDocument();
    expect(screen.getByText('Hooks')).toBeInTheDocument();
    expect(screen.getAllByText('חסרה').length).toBeGreaterThan(0);
    expect(screen.getByText('טרם סומן')).toBeInTheDocument();
    expect(screen.getByText('תרגיל').closest('li')).toHaveTextContent('בוצע');
  });

  it('switches between courses', async () => {
    renderWithProviders(<AttendancePage />);
    await userEvent.click(await screen.findByRole('tab', { name: 'Node' }));
    expect(screen.getByText('עוד לא נרשמה נוכחות בקורס הזה.')).toBeInTheDocument();
  });

  it('says so when nothing was recorded anywhere', async () => {
    getMine.mockResolvedValue({ data: { data: { courses: [] } } });
    renderWithProviders(<AttendancePage />);
    expect(await screen.findByText('עוד לא נרשמה נוכחות באף קורס.')).toBeInTheDocument();
  });
});
