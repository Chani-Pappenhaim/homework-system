import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { makeQueryClient } from '../utils/render';

vi.mock('@/api/courses.api', () => ({ coursesApi: { get: vi.fn(), list: vi.fn() } }));
vi.mock('@/api/lessons.api', () => ({ lessonsApi: { get: vi.fn() } }));

import { coursesApi } from '@/api/courses.api';
import { lessonsApi } from '@/api/lessons.api';
import { CourseByName, LessonById, LessonByNumber, type CoursePageProps, type LessonPageProps } from '@/components/lesson/LessonRoute';
import { useTabParam } from '@/hooks/useTabParam';

const getCourse = coursesApi.get as unknown as ReturnType<typeof vi.fn>;
const listCourses = coursesApi.list as unknown as ReturnType<typeof vi.fn>;
const getLesson = lessonsApi.get as unknown as ReturnType<typeof vi.fn>;

const COURSE = '/teacher/courses/תחביר-בסיסי';

function Where() {
  const location = useLocation();
  return <p>at {decodeURI(location.pathname)}{location.search}</p>;
}

function FakeLessonPage({ lessonId, lessonNumber }: LessonPageProps) {
  const [tab, setTab] = useTabParam(['content', 'files'] as const, 'content');
  return (
    <div>
      <p>lesson {lessonId} #{lessonNumber ?? '-'} tab {tab}</p>
      <Where />
      <button onClick={() => setTab('files')}>files</button>
    </div>
  );
}

function FakeCoursePage({ courseId, courseSlug }: CoursePageProps) {
  return <div><p>course {courseId} slug {courseSlug}</p><Where /></div>;
}

function renderAt(url: string) {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/teacher/courses" element={<p>courses list</p>} />
          <Route path="/teacher/courses/:courseId/lessons/:lessonNumber" element={<LessonByNumber area="teacher" page={FakeLessonPage} />} />
          <Route path="/teacher/lessons/:id" element={<LessonById area="teacher" page={FakeLessonPage} />} />
          <Route path="/teacher/courses/:courseId" element={<CourseByName area="teacher" page={FakeCoursePage} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listCourses.mockResolvedValue({ data: { data: { courses: [
    { id: 'c1', name: 'תחביר בסיסי', createdAt: '2026-01-01' },
    { id: 'c2', name: 'תחביר בסיסי', groupName: 'כיתה ב', createdAt: '2026-02-01' },
    { id: 'c3', name: 'מבוא', createdAt: '2026-03-01' },
  ] } } });
  getCourse.mockResolvedValue({ data: { data: { course: { id: 'c1', lessons: [
    { id: 'l1', topic: 'מבוא' }, { id: 'l2', topic: 'לולאות ותנאים' },
  ] } } } });
  getLesson.mockResolvedValue({ data: { data: { lesson: { id: 'l2', courseId: 'c1' } } } });
});

describe('course routes', () => {
  it('opens a course by its name', async () => {
    renderAt(COURSE);
    expect(await screen.findByText('course c1 slug תחביר-בסיסי')).toBeInTheDocument();
  });

  it('tells a second course with the same name apart by its group', async () => {
    renderAt(`${COURSE}-כיתה-ב`);
    expect(await screen.findByText('course c2 slug תחביר-בסיסי-כיתה-ב')).toBeInTheDocument();
  });

  it('moves an older numbered address to the group one', async () => {
    renderAt(`${COURSE}-2`);
    expect(await screen.findByText(`at ${COURSE}-כיתה-ב`)).toBeInTheDocument();
  });

  it('moves an id address to the name', async () => {
    renderAt('/teacher/courses/c1?tab=links');
    expect(await screen.findByText(`at ${COURSE}?tab=links`)).toBeInTheDocument();
  });

  it('sends an unknown name back to the course list', async () => {
    renderAt('/teacher/courses/אין-כזה');
    expect(await screen.findByText('courses list')).toBeInTheDocument();
  });
});

describe('lesson routes', () => {
  it('opens the lesson at that position and adds its topic', async () => {
    renderAt(`${COURSE}/lessons/2`);
    expect(await screen.findByText('lesson l2 #2 tab content')).toBeInTheDocument();
    expect(screen.getByText(`at ${COURSE}/lessons/2-לולאות-ותנאים`)).toBeInTheDocument();
  });

  it('keeps the selected tab in the address', async () => {
    renderAt(`${COURSE}/lessons/2-לולאות-ותנאים?tab=files`);
    expect(await screen.findByText('lesson l2 #2 tab files')).toBeInTheDocument();
  });

  it('writes a tab change into the address', async () => {
    renderAt(`${COURSE}/lessons/1-מבוא`);
    await userEvent.click(await screen.findByRole('button', { name: 'files' }));
    expect(screen.getByText(`at ${COURSE}/lessons/1-מבוא?tab=files`)).toBeInTheDocument();
  });

  it('follows the topic after the lessons were reordered', async () => {
    renderAt(`${COURSE}/lessons/1-לולאות-ותנאים?tab=files`);
    expect(await screen.findByText('lesson l2 #2 tab files')).toBeInTheDocument();
    expect(screen.getByText(`at ${COURSE}/lessons/2-לולאות-ותנאים?tab=files`)).toBeInTheDocument();
  });

  it('falls back to the number after the lesson was renamed', async () => {
    renderAt(`${COURSE}/lessons/1-שם-ישן`);
    expect(await screen.findByText(`at ${COURSE}/lessons/1-מבוא`)).toBeInTheDocument();
  });

  it('still opens the older id-key addresses', async () => {
    renderAt('/teacher/courses/c1/lessons/1-l2');
    expect(await screen.findByText(`at ${COURSE}/lessons/2-לולאות-ותנאים`)).toBeInTheDocument();
  });

  it('sends a number past the end back to the course', async () => {
    renderAt(`${COURSE}/lessons/9`);
    expect(await screen.findByText('course c1 slug תחביר-בסיסי')).toBeInTheDocument();
  });

  it('moves the old id address to the named one, keeping its query', async () => {
    renderAt('/teacher/lessons/l2?assignmentId=a1');
    expect(await screen.findByText(`at ${COURSE}/lessons/2-לולאות-ותנאים?assignmentId=a1`)).toBeInTheDocument();
  });

  it('shows a lesson missing from the course list by its id', async () => {
    getLesson.mockResolvedValue({ data: { data: { lesson: { id: 'l7', courseId: 'c1' } } } });
    renderAt('/teacher/lessons/l7');
    expect(await screen.findByText('lesson l7 #- tab content')).toBeInTheDocument();
  });
});
