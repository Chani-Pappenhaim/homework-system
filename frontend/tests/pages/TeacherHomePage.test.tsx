import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TeacherHomePage from '@/pages/teacher/HomePage';
import { renderWithProviders, setAuthUser } from '../utils/render';

const navigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigate };
});

vi.mock('@/api/groups.api', () => ({ groupsApi: { list: vi.fn() } }));
vi.mock('@/api/courses.api', () => ({ coursesApi: { list: vi.fn() } }));
vi.mock('@/api/grades.api', () => ({ gradesApi: { pending: vi.fn(), report: vi.fn() } }));
vi.mock('@/api/aiUsage.api', () => ({ aiUsageApi: { summary: vi.fn() } }));
vi.mock('@/api/students.api', () => ({ studentsApi: { search: vi.fn() } }));

import { groupsApi } from '@/api/groups.api';
import { coursesApi } from '@/api/courses.api';
import { gradesApi } from '@/api/grades.api';
import { aiUsageApi } from '@/api/aiUsage.api';
import { studentsApi } from '@/api/students.api';
import useUiStore from '@/store/uiStore';

const groupsList = groupsApi.list as unknown as ReturnType<typeof vi.fn>;
const coursesList = coursesApi.list as unknown as ReturnType<typeof vi.fn>;
const pending = gradesApi.pending as unknown as ReturnType<typeof vi.fn>;
const report = gradesApi.report as unknown as ReturnType<typeof vi.fn>;
const summary = aiUsageApi.summary as unknown as ReturnType<typeof vi.fn>;
const searchStudents = studentsApi.search as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  setAuthUser({ name: 'שרה', role: 'ADMIN' });
  groupsList.mockResolvedValue({ data: { data: { groups: [] } } });
  coursesList.mockResolvedValue({ data: { data: { courses: [] } } });
  pending.mockResolvedValue({ data: { data: { count: 0 } } });
  report.mockResolvedValue({ data: { data: { report: [] } } });
  summary.mockResolvedValue({ data: { data: { totalCostUsd: 0 } } });
  searchStudents.mockResolvedValue({ data: { data: { students: [] } } });
  useUiStore.setState({ search: '' });
});

describe('TeacherHomePage', () => {
  it('greets the user by name', async () => {
    renderWithProviders(<TeacherHomePage />);
    expect(await screen.findByText(/שלום, שרה/)).toBeInTheDocument();
  });

  // The dashboard shows KPI tiles (counts), not the groups/courses lists themselves.
  it('renders group and course counts and pending grade count', async () => {
    groupsList.mockResolvedValue({ data: { data: { groups: [{ id: 'g1', name: 'קב', year: '2026', studentCount: 3, createdAt: '' }] } } });
    coursesList.mockResolvedValue({ data: { data: { courses: [{ id: 'c1', name: 'קורס', groupName: 'קב', lessonCount: 4, createdAt: '2026-07-01T00:00:00Z', hidden: false, groupId: 'g1' }] } } });
    pending.mockResolvedValue({ data: { data: { count: 5 } } });
    renderWithProviders(<TeacherHomePage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /קבוצות/ })).toHaveTextContent('1'));
    expect(screen.getByRole('button', { name: /קורסים/ })).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: /ממתינות לבדיקה/ })).toHaveTextContent('5');
  });

  it('shows the empty review-queue message when there is nothing pending', async () => {
    renderWithProviders(<TeacherHomePage />);
    expect(await screen.findByText('התור ריק — כל הכבוד')).toBeInTheDocument();
  });

  it('navigates to the groups and courses pages from the KPI tiles', async () => {
    renderWithProviders(<TeacherHomePage />);
    await screen.findByText(/שלום, שרה/);
    await userEvent.click(screen.getByRole('button', { name: /קבוצות/ }));
    expect(navigate).toHaveBeenCalledWith('/teacher/groups');
    await userEvent.click(screen.getByRole('button', { name: /קורסים/ }));
    expect(navigate).toHaveBeenCalledWith('/teacher/courses');
  });

  describe('top search', () => {
    it('finds a student who has nothing waiting for a grade, and opens her page', async () => {
      searchStudents.mockResolvedValue({ data: { data: { students: [
        { id: 'st1', name: 'מירי כהן', email: 'miri@x.com', groupNames: ['כיתה א'] },
      ] } } });
      useUiStore.setState({ search: 'מירי' });
      renderWithProviders(<TeacherHomePage />);
      const result = await screen.findByRole('button', { name: /מירי כהן/ });
      expect(searchStudents).toHaveBeenCalledWith('מירי');
      expect(result).toHaveTextContent('כיתה א');
      await userEvent.click(result);
      expect(navigate).toHaveBeenCalledWith('/teacher/students/st1');
    });

    it('says when no student matches', async () => {
      useUiStore.setState({ search: 'אין כזו' });
      renderWithProviders(<TeacherHomePage />);
      expect(await screen.findByText('לא נמצאה תלמידה בשם או במייל "אין כזו"')).toBeInTheDocument();
    });

    it('does not search the directory for a single letter or an empty box', async () => {
      useUiStore.setState({ search: 'מ' });
      renderWithProviders(<TeacherHomePage />);
      expect(await screen.findByText(/שלום, שרה/)).toBeInTheDocument();
      expect(searchStudents).not.toHaveBeenCalled();
      expect(screen.queryByRole('region', { name: 'תלמידות שנמצאו' })).not.toBeInTheDocument();
    });
  });
});
