import type { ComponentType, ReactNode } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { coursesApi } from '@/api/courses.api';
import { lessonsApi } from '@/api/lessons.api';
import { courseSlugs, lessonSegment, slugify } from '@/lib/slugs';

type Area = 'teacher' | 'student';

export interface LessonPageProps {
  lessonId: string;
  /** The lesson's position in its course as the viewer sees it, when known. */
  lessonNumber?: number;
}

export interface CoursePageProps {
  courseId: string;
  /** The course's address segment — its name, or its id when it has none. */
  courseSlug: string;
}

/** `/teacher/courses/תחביר-בסיסי` — a course page's address. */
export function coursePath(area: Area, courseSlug: string): string {
  return `/${area}/courses/${courseSlug}`;
}

/**
 * `/teacher/courses/תחביר-בסיסי/lessons/3-לולאות` — a lesson page's address:
 * its current number in the course and its topic.
 */
export function lessonPath(area: Area, courseSlug: string, lessonNumber: number, topic: string): string {
  return `${coursePath(area, courseSlug)}/lessons/${lessonSegment(lessonNumber, topic)}`;
}

/** The pathname as written, Hebrew included — browsers hand it over percent-encoded. */
function decodedPathname(pathname: string): string {
  try { return decodeURI(pathname); } catch { return pathname; }
}

const Loading = () => <div className="p-6 font-sans text-ink/50">טוען…</div>;

function useCourseList() {
  return useQuery({ queryKey: ['courses'], queryFn: () => coursesApi.list() });
}

/** Every course the viewer can see, keyed by id, with its address segment. */
function useCourseSlugs() {
  const query = useCourseList();
  const courses = query.data?.data.data.courses ?? [];
  return { slugs: courseSlugs(courses), isLoading: query.isLoading };
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
 * Resolves the course segment of any `/courses/:courseId/...` address — the
 * course's name, or its id in links that only know the id — and moves the
 * address to the name. A renamed course gets its new name in the address, so
 * links made before the rename keep working through the id they redirect from.
 */
export function CourseRoute({ area, children }: { area: Area; children: (course: CoursePageProps) => ReactNode }) {
  const { courseId: param = '' } = useParams<{ courseId: string }>();
  const location = useLocation();
  const { slugs, isLoading } = useCourseSlugs();

  if (isLoading) return <Loading />;
  let courseId: string | undefined;
  if (slugs.has(param)) courseId = param;
  else courseId = [...slugs].find(([, slug]) => slug === param)?.[0];

  if (!courseId) {
    // Not in the viewer's list — an id still opens the course (the server
    // decides whether the viewer may see it); an unknown name does not.
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(param)) return <>{children({ courseId: param, courseSlug: param })}</>;
    return (
      <div className="p-6 font-sans text-coral" dir="rtl">
        הקורס לא נמצא. <Navigate to={`/${area}/courses`} replace />
      </div>
    );
  }

  const courseSlug = slugs.get(courseId)!;
  if (param !== courseSlug) {
    const segments = decodedPathname(location.pathname).split('/');
    segments[segments.indexOf('courses') + 1] = courseSlug;
    return <Navigate to={`${segments.join('/')}${location.search}`} replace />;
  }
  return <>{children({ courseId, courseSlug })}</>;
}

/** A course page behind {@link CourseRoute}. */
export function CourseByName({ area, page: Page }: { area: Area; page: ComponentType<CoursePageProps> }) {
  return <CourseRoute area={area}>{(course) => <Page key={course.courseId} {...course} />}</CourseRoute>;
}

/**
 * Renders a lesson addressed by its number and topic. The topic identifies the
 * lesson, so when the order changed since the link was made (or the viewer
 * sees a different list, e.g. without hidden lessons) the address is corrected
 * to the lesson's current number; a bare number is looked up by position. The
 * number tells apart lessons that share a topic. Older addresses ending in the
 * start of the lesson's id still resolve.
 */
export function LessonByNumber({ area, page }: { area: Area; page: ComponentType<LessonPageProps> }) {
  return (
    <CourseRoute area={area}>
      {(course) => <LessonInCourse area={area} page={page} {...course} />}
    </CourseRoute>
  );
}

function LessonInCourse({ area, page: Page, courseId, courseSlug }: {
  area: Area; page: ComponentType<LessonPageProps>;
} & CoursePageProps) {
  const { lessonNumber: segment = '' } = useParams<{ lessonNumber: string }>();
  const location = useLocation();
  const { data, isLoading, isError } = useCourseLessons(courseId);
  const lessons = data?.data.data.course.lessons ?? [];

  if (isLoading) return <Loading />;
  const match = /^(\d+)(?:-(.+))?$/.exec(segment);
  const n = match ? Number(match[1]) : NaN;
  const rest = match?.[2]?.toLowerCase();
  let index = -1;
  if (rest) {
    const named = lessons.flatMap((l, i) => (slugify(l.topic ?? '') === rest ? [i] : []));
    index = named.includes(n - 1) ? n - 1 : named[0] ?? -1;
    if (index < 0) index = lessons.findIndex((l) => l.id.replace(/-/g, '').slice(0, 8) === rest);
  }
  // No topic matched — the lesson was renamed since the link was made, or it is
  // a bare number: go by position.
  if (index < 0 && n >= 1 && n <= lessons.length) {
    index = n - 1;
  }

  if (isError || index < 0) {
    return (
      <div className="p-6 font-sans text-coral" dir="rtl">
        השיעור לא נמצא. <Navigate to={coursePath(area, courseSlug)} replace />
      </div>
    );
  }
  const lesson = lessons[index];
  const canonical = lessonPath(area, courseSlug, index + 1, lesson.topic ?? '');
  if (decodedPathname(location.pathname) !== canonical) {
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
  const { slugs, isLoading: slugsLoading } = useCourseSlugs();

  if (lessonQuery.isLoading || (courseId && (courseQuery.isLoading || slugsLoading))) return <Loading />;
  const lessons = courseQuery.data?.data.data.course.lessons ?? [];
  const index = lessons.findIndex((l) => l.id === id);
  if (courseId && index >= 0) {
    const courseSlug = slugs.get(courseId) ?? courseId;
    return <Navigate to={`${lessonPath(area, courseSlug, index + 1, lessons[index].topic ?? '')}${location.search}`} replace />;
  }
  return <Page lessonId={id!} />;
}
