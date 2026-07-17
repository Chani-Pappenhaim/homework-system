import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StudentHomePage from '@/pages/student/HomePage';
import { renderWithProviders, setAuthUser } from '../utils/render';

const navigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigate };
});

vi.mock('@/api/courses.api', () => ({ coursesApi: { list: vi.fn() } }));
vi.mock('@/api/submissions.api', () => ({ submissionsApi: { mine: vi.fn() } }));

import { coursesApi } from '@/api/courses.api';
import { submissionsApi } from '@/api/submissions.api';
const coursesList = coursesApi.list as unknown as ReturnType<typeof vi.fn>;
const mine = submissionsApi.mine as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  setAuthUser({ name: 'אביגיל', role: 'STUDENT' });
  mine.mockResolvedValue({ data: { data: { pending: [] } } });
});

describe('StudentHomePage', () => {
  it('shows the empty state when not assigned to any course', async () => {
    coursesList.mockResolvedValue({ data: { data: { courses: [] } } });
    renderWithProviders(<StudentHomePage />);
    expect(await screen.findByText('לא שויכת לאף קורס עדיין')).toBeInTheDocument();
  });

  it('renders a card per course and navigates on click', async () => {
    coursesList.mockResolvedValue({ data: { data: { courses: [
      { id: 'c1', name: 'קורס א', lessonCount: 3, hidden: false, groupId: 'g1', createdAt: '' },
    ] } } });
    renderWithProviders(<StudentHomePage />);
    const card = await screen.findByText('קורס א');
    await userEvent.click(card);
    expect(navigate).toHaveBeenCalledWith('/student/courses/c1');
  });

  it('shows the pending-assignments badge and list', async () => {
    coursesList.mockResolvedValue({ data: { data: { courses: [] } } });
    mine.mockResolvedValue({ data: { data: { pending: [
      { assignmentId: 'a1', assignmentTitle: 'מטלה 1', courseName: 'קורס א', lessonTopic: 'שיעור 1', deadline: '2999-01-01T00:00:00Z' },
    ] } } });
    renderWithProviders(<StudentHomePage />);
    expect(await screen.findByText('1 מטלות ממתינות')).toBeInTheDocument();
    expect(screen.getByText('מטלה 1')).toBeInTheDocument();
  });
});
