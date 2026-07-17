import { toExternalUrl } from '@/lib/utils';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Paperclip } from 'lucide-react';
import { coursesApi } from '@/api/courses.api';
import Card, { CardBody, CardHeader } from '@/components/ui/Card';

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

  return (
    <div className="max-w-2xl space-y-5" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold">{course.name}</h1>
        <p className="text-[#6B7280] text-sm mt-0.5">{course.groupName} · {course.year}</p>
        {course.description && <p className="text-[#6B7280] text-sm mt-1">{course.description}</p>}
      </div>

      {/* Lesson bubbles */}
      <Card accent="primary">
        <CardHeader><h2 className="font-semibold text-sm">שיעורים</h2></CardHeader>
        <CardBody>
          <div className="flex flex-wrap gap-3">
            {course.lessons.map((l, i) => (
              <button
                key={l.id}
                onClick={() => navigate(`/student/lessons/${l.id}`)}
                className="flex flex-col items-center justify-center w-16 h-16 rounded-xl border-2 border-primary/20 bg-[rgba(194,24,91,0.05)] text-primary hover:bg-[rgba(194,24,91,0.1)] transition text-sm font-semibold"
              >
                {i + 1}
              </button>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Links */}
      {course.links.length > 0 && (
        <Card>
          <CardHeader><h2 className="font-semibold text-sm">קישורים שימושיים</h2></CardHeader>
          <CardBody className="space-y-2">
            {course.links.map((l) => (
              <a key={l.id} href={toExternalUrl(l.url)} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 text-sm text-primary hover:underline">
                <ExternalLink size={13} /> {l.label}
              </a>
            ))}
          </CardBody>
        </Card>
      )}

      {/* Files */}
      {course.files.length > 0 && (
        <Card>
          <CardHeader><h2 className="font-semibold text-sm">קבצים</h2></CardHeader>
          <CardBody className="space-y-2">
            {course.files.map((f) => (
              <a key={f.id} href={f.url} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 text-sm text-[#1A1830] hover:text-primary">
                <Paperclip size={13} /> {f.name}
              </a>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
