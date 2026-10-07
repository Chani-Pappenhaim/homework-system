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

/** `/teacher/courses/c1/lessons/3` — the address a lesson page lives at. */
export function lessonPath(area: Area, courseId: string, lessonNumber: number): string {
  return `/${area}/courses/${courseId}/lessons/${lessonNumber}`;
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
 * Renders a lesson addressed by its number in the course. The number is the
 * one the course page shows on the lesson's tile (its position in the list the
 * viewer sees), so it reads naturally in the address bar.
 */
export function LessonByNumber({ area, page: Page }: { area: Area; page: ComponentType<LessonPageProps> }) {
  const { courseId, lessonNumber } = useParams<{ courseId: string; lessonNumber: string }>();
  const { data, isLoading, isError } = useCourseLessons(courseId);
  const n = Number(lessonNumber);
  const lessons = data?.data.data.course.lessons;

  if (isLoading) return <div className="p-6 font-sans text-ink/50">טוען…</div>;
  const lesson = Number.isInteger(n) && n >= 1 ? lessons?.[n - 1] : undefined;
  if (isError || !lesson) {
    return (
      <div className="p-6 font-sans text-coral" dir="rtl">
        השיעור לא נמצא. <Navigate to={courseId ? `/${area}/courses/${courseId}` : `/${area}`} replace />
      </div>
    );
  }
  return <Page key={lesson.id} lessonId={lesson.id} lessonNumber={n} />;
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
    return <Navigate to={`${lessonPath(area, courseId, index + 1)}${location.search}`} replace />;
  }
  return <Page lessonId={id!} />;
}
