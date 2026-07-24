import { toExternalUrl } from '@/lib/utils';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Paperclip, Check } from 'lucide-react';
import { coursesApi } from '@/api/courses.api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
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
    <div className="max-w-2xl space-y-5" dir="rtl">
      <PageHeader
        title={course.name}
        meta={`${course.groupName} · ${course.year}`}
        back
        backLabel="חזרה"
      />
      {course.description && <p className="text-sm text-ink/70">{course.description}</p>}

      {/* Progress — measuring tape */}
      <Card accent="sage">
        <CardContent>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-bold text-ink">
              ההתקדמות שלך {pct === 100 && total > 0 && '🎉 כל הכבוד!'}
            </span>
            <span className="font-sans text-sm font-bold text-sage tabular">{done}/{total} · {pct}%</span>
          </div>
          <div className="h-4 border border-rule bg-sheet">
            <div className="h-full bg-sage transition-all duration-500" style={{ width: `${pct}%` }} />
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
                title={l.completed ? 'הושלם' : l.topic}
                className={cn(
                  'relative grid size-16 place-items-center border border-rule font-display text-lg font-black shadow-soft transition-all duration-150 ease-linear hover:-translate-x-0.5 hover:-translate-y-0.5',
                  l.completed ? 'bg-sage text-sheet' : 'bg-sheet text-ink',
                )}
              >
                {l.completed && (
                  <span className="absolute -right-2 -top-2 grid size-5 place-items-center rounded-full border border-rule bg-butter text-ink">
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
          <CardHeader><h2 className="font-semibold text-sm">קישורים שימושיים</h2></CardHeader>
          <CardContent className="space-y-2">
            {course.links.map((l) => (
              <a key={l.id} href={toExternalUrl(l.url)} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 text-sm text-primary hover:underline">
                <ExternalLink size={13} /> {l.label}
              </a>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Files */}
      {course.files.length > 0 && (
        <Card>
          <CardHeader><h2 className="font-semibold text-sm">קבצים</h2></CardHeader>
          <CardContent className="space-y-2">
            {course.files.map((f) => (
              <a key={f.id} href={f.url} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 text-sm text-ink hover:text-primary">
                <Paperclip size={13} /> {f.name}
              </a>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
