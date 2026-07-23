import { toExternalUrl } from '@/lib/utils';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Paperclip, Check } from 'lucide-react';
import { coursesApi } from '@/api/courses.api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export default function StudentCourseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['course', id],
    queryFn: () => coursesApi.get(id!),
  });

  const course = data?.data.data.course;
  if (isLoading) return <div className="p-6 text-[#9CA3AF]">טוען...</div>;
  if (!course) return <div className="p-6 text-red-500">קורס לא נמצא</div>;

  const total = course.lessons.length;
  const done = course.lessons.filter((l) => l.completed).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="max-w-2xl space-y-5" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold">{course.name}</h1>
        <p className="text-[#6B7280] text-sm mt-0.5">{course.groupName} · {course.year}</p>
        {course.description && <p className="text-[#6B7280] text-sm mt-1">{course.description}</p>}
      </div>

      {/* Progress meter */}
      <Card>
        <CardContent>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-[#1A1830]">
              ההתקדמות שלך {pct === 100 && total > 0 && '🎉 כל הכבוד!'}
            </span>
            <span className="text-sm font-bold text-primary">{done}/{total} · {pct}%</span>
          </div>
          <div className="h-2.5 bg-[#EEEBF5] rounded-full overflow-hidden">
            <div className="h-full gradient-progress rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </CardContent>
      </Card>

      {/* Lesson bubbles */}
      <Card accent="cobalt">
        <CardHeader><h2 className="font-semibold text-sm">שיעורים</h2></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {course.lessons.map((l, i) => (
              <button
                key={l.id}
                onClick={() => navigate(`/student/lessons/${l.id}`)}
                title={l.completed ? 'הושלם' : l.topic}
                className={`relative flex flex-col items-center justify-center w-16 h-16 rounded-xl border-2 transition text-sm font-semibold ${
                  l.completed
                    ? 'border-[#34D399] bg-[#ECFDF5] text-[#059669] hover:bg-[#D1FAE5]'
                    : 'border-primary/20 bg-[rgba(194,24,91,0.05)] text-primary hover:bg-[rgba(194,24,91,0.1)]'
                }`}
              >
                {l.completed && (
                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#34D399] flex items-center justify-center text-white">
                    <Check size={12} strokeWidth={3} />
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
                className="flex items-center gap-2 text-sm text-[#1A1830] hover:text-primary">
                <Paperclip size={13} /> {f.name}
              </a>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
