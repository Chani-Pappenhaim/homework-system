import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CourseDetailPage from '@/pages/teacher/CourseDetailPage';
import { renderWithProviders } from '../utils/render';

const navigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigate };
});

vi.mock('@/api/courses.api', () => ({ coursesApi: { get: vi.fn() } }));
vi.mock('@/api/lessons.api', () => ({ lessonsApi: { create: vi.fn() } }));

import { coursesApi } from '@/api/courses.api';
import { lessonsApi } from '@/api/lessons.api';
const getCourse = coursesApi.get as unknown as ReturnType<typeof vi.fn>;
const createLesson = lessonsApi.create as unknown as ReturnType<typeof vi.fn>;

const course = {
  id: 'c1', name: 'קורס React', groupName: 'קבוצה א', year: '2026', description: 'תיאור הקורס',
  hidden: false, groupId: 'g1', lessonCount: 2, createdAt: '',
  lessons: [
    { id: 'l1', topic: 'שיעור ראשון', hidden: false, order: 0 },
    { id: 'l2', topic: 'שיעור שני', hidden: true, order: 1 },
  ],
  links: [{ id: 'lk1', label: 'תיעוד', url: 'https://x.com', order: 0 }],
  files: [{ id: 'f1', name: 'קובץ.pdf', url: 'https://x.com/f', uploadedAt: '' }],
};

function renderPage() {
  return renderWithProviders(<CourseDetailPage />, {
    path: '/teacher/courses/:id',
    initialEntries: ['/teacher/courses/c1'],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getCourse.mockResolvedValue({ data: { data: { course } } });
});

describe('TeacherCourseDetailPage', () => {
  it('renders the course header, links and files', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'קורס React' })).toBeInTheDocument();
    expect(screen.getByText('תיאור הקורס')).toBeInTheDocument();
    expect(screen.getByText('תיעוד')).toBeInTheDocument();
    expect(screen.getByText('קובץ.pdf')).toBeInTheDocument();
    expect(screen.getByText('שיעורים (2)')).toBeInTheDocument();
  });

  it('navigates to a lesson when its bubble is clicked', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'קורס React' });
    // Lesson bubbles are numbered buttons 1..n
    await userEvent.click(screen.getByRole('button', { name: '1' }));
    expect(navigate).toHaveBeenCalledWith('/teacher/lessons/l1');
  });

  it('opens the new-lesson modal and creates a lesson', async () => {
    createLesson.mockResolvedValue({ data: { data: { lesson: { id: 'l99' } } } });
    renderPage();
    await screen.findByRole('heading', { name: 'קורס React' });
    // The "+" add button has no accessible name; it's the last bubble button.
    const bubbleButtons = screen.getAllByRole('button');
    await userEvent.click(bubbleButtons[bubbleButtons.length - 1]);
    const topicInput = await screen.findByPlaceholderText('React Hooks');
    await userEvent.type(topicInput, 'נושא חדש');
    await userEvent.click(screen.getByRole('button', { name: 'צור שיעור' }));
    await waitFor(() => expect(createLesson).toHaveBeenCalledWith('c1', { topic: 'נושא חדש', lessonDate: undefined }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/teacher/lessons/l99'));
  });

  it('shows a not-found message when the course is missing', async () => {
    getCourse.mockResolvedValue({ data: { data: { course: null } } });
    renderPage();
    expect(await screen.findByText('קורס לא נמצא')).toBeInTheDocument();
  });
});
