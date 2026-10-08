import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { makeQueryClient } from '../utils/render';

vi.mock('@/api/courses.api', () => ({ coursesApi: { get: vi.fn() } }));
vi.mock('@/api/lessons.api', () => ({ lessonsApi: { get: vi.fn() } }));

import { coursesApi } from '@/api/courses.api';
import { lessonsApi } from '@/api/lessons.api';
import { LessonById, LessonByNumber, type LessonPageProps } from '@/components/lesson/LessonRoute';
import { useTabParam } from '@/hooks/useTabParam';

const getCourse = coursesApi.get as unknown as ReturnType<typeof vi.fn>;
const getLesson = lessonsApi.get as unknown as ReturnType<typeof vi.fn>;

function FakeLessonPage({ lessonId, lessonNumber }: LessonPageProps) {
  const [tab, setTab] = useTabParam(['content', 'files'] as const, 'content');
  const location = useLocation();
  return (
    <div>
      <p>lesson {lessonId} #{lessonNumber ?? '-'} tab {tab}</p>
      <p>at {location.pathname}{location.search}</p>
      <button onClick={() => setTab('files')}>files</button>
    </div>
  );
}

function renderAt(url: string) {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/teacher/courses/:courseId/lessons/:lessonNumber" element={<LessonByNumber area="teacher" page={FakeLessonPage} />} />
          <Route path="/teacher/lessons/:id" element={<LessonById area="teacher" page={FakeLessonPage} />} />
          <Route path="/teacher/courses/:id" element={<p>course page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getCourse.mockResolvedValue({ data: { data: { course: { id: 'c1', lessons: [{ id: 'l1' }, { id: 'l2' }] } } } });
  getLesson.mockResolvedValue({ data: { data: { lesson: { id: 'l2', courseId: 'c1' } } } });
});

describe('lesson routes', () => {
  it('opens the lesson at that position in the course', async () => {
    renderAt('/teacher/courses/c1/lessons/2');
    expect(await screen.findByText('lesson l2 #2 tab content')).toBeInTheDocument();
  });

  it('keeps the selected tab in the address', async () => {
    renderAt('/teacher/courses/c1/lessons/2?tab=files');
    expect(await screen.findByText('lesson l2 #2 tab files')).toBeInTheDocument();
  });

  it('writes a tab change into the address', async () => {
    renderAt('/teacher/courses/c1/lessons/1');
    await userEvent.click(await screen.findByRole('button', { name: 'files' }));
    expect(screen.getByText('at /teacher/courses/c1/lessons/1-l1?tab=files')).toBeInTheDocument();
  });

  it('adds the lesson key to a bare number', async () => {
    renderAt('/teacher/courses/c1/lessons/2?tab=files');
    expect(await screen.findByText('at /teacher/courses/c1/lessons/2-l2?tab=files')).toBeInTheDocument();
  });

  it('follows the key after the lessons were reordered', async () => {
    renderAt('/teacher/courses/c1/lessons/1-l2?tab=files');
    expect(await screen.findByText('lesson l2 #2 tab files')).toBeInTheDocument();
    expect(screen.getByText('at /teacher/courses/c1/lessons/2-l2?tab=files')).toBeInTheDocument();
  });

  it('sends a key of a deleted lesson back to the course', async () => {
    renderAt('/teacher/courses/c1/lessons/1-gone');
    expect(await screen.findByText('course page')).toBeInTheDocument();
  });

  it('sends a number past the end back to the course', async () => {
    renderAt('/teacher/courses/c1/lessons/9');
    expect(await screen.findByText('course page')).toBeInTheDocument();
  });

  it('moves the old id address to the numbered one, keeping its query', async () => {
    renderAt('/teacher/lessons/l2?assignmentId=a1');
    expect(await screen.findByText('at /teacher/courses/c1/lessons/2-l2?assignmentId=a1')).toBeInTheDocument();
  });

  it('shows a lesson missing from the course list by its id', async () => {
    getLesson.mockResolvedValue({ data: { data: { lesson: { id: 'l7', courseId: 'c1' } } } });
    renderAt('/teacher/lessons/l7');
    expect(await screen.findByText('lesson l7 #- tab content')).toBeInTheDocument();
  });
});
