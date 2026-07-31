import { toExternalUrl } from '@/lib/utils';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Check } from 'lucide-react';
import { coursesApi } from '@/api/courses.api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { FileGallery } from '@/components/ui/file-gallery';
import { cn } from '@/lib/utils';

export default function StudentCourseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['course', id],
    queryFn: () => coursesApi.get(id!),
  });

  const course = data?.data.data.course;
  if (isLoading) return <div className="p-6 font-sans text-ink/50">טוען…</div>;
  if (!course) return <div className="p-6 font-sans text-coral">קורס לא נמצא</div>;

  const total = course.lessons.length;
  const done = course.lessons.filter((l) => l.completed).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="mx-auto max-w-2xl space-y-5" dir="rtl">
      <PageHeader
        title={course.name}
        meta={`${course.groupName} · ${course.year}`}
        back
        backLabel="חזרה"
      />
      {course.description && <p className="text-sm text-ink/70">{course.description}</p>}

      {/* Progress */}
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

      {/* Lesson tiles */}
      <Card accent="indigo">
        <CardHeader><h2 className="font-display text-base font-bold">שיעורים</h2></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {course.lessons.map((l, i) => (
              <button
                key={l.id}
                onClick={() => navigate(`/student/lessons/${l.id}`)}
                title={l.completed ? `${l.topic} (הושלם)` : l.topic}
                className={cn(
                  'lift relative grid size-14 place-items-center rounded-lg border border-rule font-display text-lg font-bold shadow-soft',
                  l.completed ? 'bg-sage text-sheet' : 'bg-sheet text-ink',
                )}
              >
                {l.completed && (
                  <span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-clay text-sheet">
                    <Check size={11} strokeWidth={3} />
                  </span>
                )}
                {i + 1}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Links */}
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

      {/* Files */}
      {course.files.length > 0 && (
        <Card>
          <CardHeader><h2 className="font-display text-base font-bold">חומרי עזר</h2></CardHeader>
          <CardContent>
            <FileGallery files={course.files} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
