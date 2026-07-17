import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
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
vi.mock('@/api/grades.api', () => ({ gradesApi: { pending: vi.fn() } }));
vi.mock('@/api/aiUsage.api', () => ({ aiUsageApi: { summary: vi.fn() } }));

import { groupsApi } from '@/api/groups.api';
import { coursesApi } from '@/api/courses.api';
import { gradesApi } from '@/api/grades.api';
import { aiUsageApi } from '@/api/aiUsage.api';

const groupsList = groupsApi.list as unknown as ReturnType<typeof vi.fn>;
const coursesList = coursesApi.list as unknown as ReturnType<typeof vi.fn>;
const pending = gradesApi.pending as unknown as ReturnType<typeof vi.fn>;
const summary = aiUsageApi.summary as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  setAuthUser({ name: 'שרה', role: 'ADMIN' });
  groupsList.mockResolvedValue({ data: { data: { groups: [] } } });
  coursesList.mockResolvedValue({ data: { data: { courses: [] } } });
  pending.mockResolvedValue({ data: { data: { count: 0 } } });
  summary.mockResolvedValue({ data: { data: { totalCostUsd: 0 } } });
});

describe('TeacherHomePage', () => {
  it('greets the user by name', async () => {
    renderWithProviders(<TeacherHomePage />);
    expect(await screen.findByText(/שלום, שרה/)).toBeInTheDocument();
  });

  it('renders group and course counts and pending grade count', async () => {
    groupsList.mockResolvedValue({ data: { data: { groups: [{ id: 'g1', name: 'קב', year: '2026', studentCount: 3, createdAt: '' }] } } });
    coursesList.mockResolvedValue({ data: { data: { courses: [{ id: 'c1', name: 'קורס', groupName: 'קב', lessonCount: 4, createdAt: '2026-07-01T00:00:00Z', hidden: false, groupId: 'g1' }] } } });
    pending.mockResolvedValue({ data: { data: { count: 5 } } });
    renderWithProviders(<TeacherHomePage />);
    expect(await screen.findByText('קורס')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument(); // pending count
  });

  it('shows empty states when there are no groups or courses', async () => {
    renderWithProviders(<TeacherHomePage />);
    expect(await screen.findByText('אין קבוצות עדיין')).toBeInTheDocument();
    expect(screen.getByText('אין קורסים עדיין')).toBeInTheDocument();
  });

  it('navigates to new-group and new-course from the header buttons', async () => {
    renderWithProviders(<TeacherHomePage />);
    await screen.findByText(/שלום, שרה/);
    await userEvent.click(screen.getByRole('button', { name: /קבוצה חדשה/ }));
    expect(navigate).toHaveBeenCalledWith('/teacher/groups/new');
    await userEvent.click(screen.getByRole('button', { name: /קורס חדש/ }));
    expect(navigate).toHaveBeenCalledWith('/teacher/courses/new');
  });
});
