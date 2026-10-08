import type { ComponentType } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { coursesApi } from '@/api/courses.api';
import { lessonsApi } from '@/api/lessons.api';

type Area = 'teacher' | 'student';

export interface LessonPageProps {
  lessonId: string;
  /** The lesson's position in its course as the viewer sees it, when known. */
  lessonNumber?: number;
}

/** A short, permanent key for a lesson — the start of its id. */
function lessonKey(lessonId: string): string {
  return lessonId.replace(/-/g, '').slice(0, 8);
}

/**
 * `/teacher/courses/c1/lessons/3-1a2b3c4d` — the address a lesson page lives at:
 * its current number in the course, plus a permanent key that keeps old links
 * pointing at the same lesson after the lessons are reordered.
 */
export function lessonPath(area: Area, courseId: string, lessonNumber: number, lessonId: string): string {
  return `/${area}/courses/${courseId}/lessons/${lessonNumber}-${lessonKey(lessonId)}`;
}

function useCourseLessons(courseId: string | undefined) {
  return useQuery({
    queryKey: ['course', courseId],
    queryFn: () => coursesApi.get(courseId!),
    enabled: Boolean(courseId),
    retry: false,
  });
}

/**
 * Renders a lesson addressed by its number in the course — the number the
 * course page shows on the lesson's tile. The key after the number identifies
 * the lesson itself, so when the order changed since the link was made (or the
 * viewer sees a different list, e.g. without hidden lessons) the address is
 * corrected to the lesson's current number. A bare number is looked up by
 * position and gets its key added.
 */
export function LessonByNumber({ area, page: Page }: { area: Area; page: ComponentType<LessonPageProps> }) {
  const { courseId, lessonNumber } = useParams<{ courseId: string; lessonNumber: string }>();
  const location = useLocation();
  const { data, isLoading, isError } = useCourseLessons(courseId);
  const lessons = data?.data.data.course.lessons ?? [];

  if (isLoading) return <div className="p-6 font-sans text-ink/50">טוען…</div>;
  const match = /^(\d+)(?:-([0-9a-z]+))?$/i.exec(lessonNumber ?? '');
  const n = match ? Number(match[1]) : NaN;
  const key = match?.[2]?.toLowerCase();
  const index = key
    ? lessons.findIndex((l) => lessonKey(l.id) === key)
    : (n >= 1 && n <= lessons.length ? n - 1 : -1);

  if (isError || !courseId || index < 0) {
    return (
      <div className="p-6 font-sans text-coral" dir="rtl">
        השיעור לא נמצא. <Navigate to={courseId ? `/${area}/courses/${courseId}` : `/${area}`} replace />
      </div>
    );
  }
  const lesson = lessons[index];
  const canonical = lessonPath(area, courseId, index + 1, lesson.id);
  if (location.pathname !== canonical) {
    return <Navigate to={`${canonical}${location.search}`} replace />;
  }
  return <Page key={lesson.id} lessonId={lesson.id} lessonNumber={index + 1} />;
}

/**
 * The older `/lessons/:id` address, still used by links that only know the
 * lesson (the assignments list, the home page, notification emails). It moves
 * to the numbered address once the lesson's place in its course is known, and
 * shows the lesson by id when it has none the viewer can see — a lesson opened
 * to one student privately, for instance.
 */
export function LessonById({ area, page: Page }: { area: Area; page: ComponentType<LessonPageProps> }) {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const lessonQuery = useQuery({
    queryKey: ['lesson', id],
    queryFn: () => lessonsApi.get(id!),
    enabled: Boolean(id),
  });
  const courseId = lessonQuery.data?.data.data.lesson.courseId;
  const courseQuery = useCourseLessons(courseId);

  if (lessonQuery.isLoading || (courseId && courseQuery.isLoading)) {
    return <div className="p-6 font-sans text-ink/50">טוען…</div>;
  }
  const index = courseQuery.data?.data.data.course.lessons.findIndex((l) => l.id === id) ?? -1;
  if (courseId && index >= 0) {
    return <Navigate to={`${lessonPath(area, courseId, index + 1, id!)}${location.search}`} replace />;
  }
  return <Page lessonId={id!} />;
}
