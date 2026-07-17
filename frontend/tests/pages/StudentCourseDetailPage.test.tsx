import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StudentCourseDetailPage from '@/pages/student/CourseDetailPage';
import { renderWithProviders } from '../utils/render';

const navigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigate };
});

vi.mock('@/api/courses.api', () => ({ coursesApi: { get: vi.fn() } }));
import { coursesApi } from '@/api/courses.api';
const getCourse = coursesApi.get as unknown as ReturnType<typeof vi.fn>;

const course = {
  id: 'c1', name: 'קורס פייתון', groupName: 'קבוצה א', year: '2026', description: 'תיאור',
  hidden: false, groupId: 'g1', lessonCount: 2, createdAt: '',
  lessons: [{ id: 'l1', topic: 'a', hidden: false, order: 0 }, { id: 'l2', topic: 'b', hidden: false, order: 1 }],
  links: [{ id: 'lk1', label: 'מדריך', url: 'https://x.com', order: 0 }],
  files: [{ id: 'f1', name: 'סילבוס.pdf', url: 'https://x.com/f', uploadedAt: '' }],
};

function renderPage() {
  return renderWithProviders(<StudentCourseDetailPage />, {
    path: '/student/courses/:id',
    initialEntries: ['/student/courses/c1'],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getCourse.mockResolvedValue({ data: { data: { course } } });
});

describe('StudentCourseDetailPage', () => {
  it('renders the course name, links and files', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'קורס פייתון' })).toBeInTheDocument();
    expect(screen.getByText('מדריך')).toBeInTheDocument();
    expect(screen.getByText('סילבוס.pdf')).toBeInTheDocument();
  });

  it('navigates to a lesson when its numbered bubble is clicked', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'קורס פייתון' });
    await userEvent.click(screen.getByRole('button', { name: '2' }));
    expect(navigate).toHaveBeenCalledWith('/student/lessons/l2');
  });

  it('shows a not-found message when the course is missing', async () => {
    getCourse.mockResolvedValue({ data: { data: { course: null } } });
    renderPage();
    expect(await screen.findByText('קורס לא נמצא')).toBeInTheDocument();
  });
});
