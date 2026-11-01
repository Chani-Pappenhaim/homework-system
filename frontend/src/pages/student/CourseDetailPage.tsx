import { toExternalUrl } from '@/lib/utils';
import { lessonPath, type CoursePageProps } from '@/components/lesson/LessonRoute';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Check } from 'lucide-react';
import { coursesApi } from '@/api/courses.api';
import { lessonsApi } from '@/api/lessons.api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { FileGallery } from '@/components/ui/file-gallery';
import { cn } from '@/lib/utils';
import { usePageTitle } from '@/hooks/usePageTitle';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';

export default function StudentCourseDetailPage(props: Partial<CoursePageProps>) {
  const params = useParams<{ id: string }>();
  const id = props.courseId ?? params.id;
  const courseSlug = props.courseSlug ?? id;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['course', id],
    queryFn: () => coursesApi.get(id!),
  });

  function prefetchLesson(lessonId: string) {
    qc.prefetchQuery({ queryKey: ['lesson', lessonId], queryFn: () => lessonsApi.get(lessonId) });
  }

  const course = data?.data.data.course;
  usePageTitle(course?.name);
  if (isLoading) return <div className="p-6 font-sans text-ink/50">טוען…</div>;
  if (!course) return <div className="p-6 font-sans text-coral">קורס לא נמצא</div>;

  const total = course.lessons.length;
  const done = course.lessons.filter((l) => l.completed).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        title={course.name}
        meta={course.groupName || course.year}
        back
        backLabel="חזרה"
      />
      {course.description && <MarkdownRenderer content={course.description} className="text-ink/70" />}

      <Card accent="sage">
        <CardContent>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-ink">
              ההתקדמות שלך {pct === 100 && total > 0 && '🎉 כל הכבוד!'}
            </span>
            <span className="text-sm font-semibold text-sage tabular">{done}/{total} · {pct}%</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-ground">
            <div className="h-full rounded-full bg-sage transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </CardContent>
      </Card>

      <Card accent="indigo">
        <CardHeader><h2 className="font-display text-base font-bold">שיעורים</h2></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {course.lessons.map((l, i) => (
              <button
                key={l.id}
                onClick={() => navigate(lessonPath('student', courseSlug!, i + 1, l.topic))}
                onMouseEnter={() => prefetchLesson(l.id)}
                onFocus={() => prefetchLesson(l.id)}
                title={l.completed ? `${l.topic} (הושלם)` : l.topic}
                className="lift flex items-center gap-3 rounded-lg border border-rule bg-sheet p-2 text-start shadow-soft"
              >
                <span
                  className={cn(
                    'relative grid size-10 shrink-0 place-items-center rounded-lg border border-rule font-display text-base font-bold',
                    l.completed ? 'bg-sage text-sheet' : 'bg-ground text-ink',
                  )}
                >
                  {l.completed && (
                    <span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-clay text-sheet">
                      <Check size={11} strokeWidth={3} />
                    </span>
                  )}
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{l.topic}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Two independent lists, side by side on wide screens */}
      {(course.links.length > 0 || course.files.length > 0) && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {course.links.length > 0 && (
            <Card>
              <CardHeader><h2 className="font-display text-base font-bold">קישורים שימושיים</h2></CardHeader>
              <CardContent className="space-y-2">
                {course.links.map((l) => (
                  <a key={l.id} href={toExternalUrl(l.url)} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 text-sm text-clay hover:underline">
                    <ExternalLink size={13} /> {l.label}
                  </a>
                ))}
              </CardContent>
            </Card>
          )}

          {course.files.length > 0 && (
            <Card>
              <CardHeader><h2 className="font-display text-base font-bold">חומרי עזר</h2></CardHeader>
              <CardContent>
                <FileGallery source="course" files={course.files} />
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
