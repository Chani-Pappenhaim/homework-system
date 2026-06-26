import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { EyeOff, Edit, Lock, ExternalLink, Trash2, Plus, UserCheck } from 'lucide-react';
import { coursesApi } from '@/api/courses.api';
import Card, { CardBody, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import { useState } from 'react';

export default function CourseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [accessEmail, setAccessEmail] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['course', id],
    queryFn: () => coursesApi.get(id!),
  });

  const grantMutation = useMutation({
    mutationFn: (studentId: string) => coursesApi.grantAccess(id!, studentId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['course', id] }); setAccessEmail(''); },
  });

  const course = data?.data.data.course;
  if (isLoading) return <div className="p-6 text-[#9CA3AF]">טוען...</div>;
  if (!course) return <div className="p-6 text-red-500">קורס לא נמצא</div>;

  return (
    <div className="max-w-3xl space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1830]">{course.name}</h1>
          <p className="text-[#6B7280] text-sm mt-0.5">{course.groupName} · {course.year}</p>
          {course.description && <p className="text-[#6B7280] text-sm mt-1">{course.description}</p>}
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate(`/teacher/courses/${id}/edit`)}>
          <Edit size={13} /> ערוך קורס
        </Button>
      </div>

      {/* Lesson bubbles */}
      <Card accent="primary">
        <CardHeader>
          <h2 className="font-semibold text-sm">שיעורים ({course.lessons.length})</h2>
        </CardHeader>
        <CardBody>
          <div className="flex flex-wrap gap-3">
            {course.lessons.map((l, i) => (
              <button
                key={l.id}
                onClick={() => navigate(`/teacher/lessons/${l.id}`)}
                className={`relative flex flex-col items-center justify-center w-16 h-16 rounded-xl border-2 transition text-sm font-semibold
                  ${l.hidden
                    ? 'border-[#EEEBF5] bg-[#F8F7FC] text-[#9CA3AF]'
                    : 'border-primary/20 bg-[rgba(194,24,91,0.05)] text-primary hover:bg-[rgba(194,24,91,0.1)]'
                  }`}
              >
                <span>{i + 1}</span>
                {l.hidden && <Lock size={10} className="absolute top-1 left-1 text-[#9CA3AF]" />}
              </button>
            ))}
            <button
              onClick={() => navigate(`/teacher/courses/${id}/edit`)}
              className="flex items-center justify-center w-16 h-16 rounded-xl border-2 border-dashed border-[#EEEBF5] text-[#9CA3AF] hover:border-primary/40 hover:text-primary transition"
            >
              <Plus size={18} />
            </button>
          </div>
        </CardBody>
      </Card>

      {/* Links */}
      {course.links.length > 0 && (
        <Card>
          <CardHeader><h2 className="font-semibold text-sm">קישורים שימושיים</h2></CardHeader>
          <CardBody className="space-y-2">
            {course.links.map((l) => (
              <a key={l.id} href={l.url} target="_blank" rel="noreferrer"
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
                <ExternalLink size={13} /> {f.name}
              </a>
            ))}
          </CardBody>
        </Card>
      )}

      {/* Special access */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <UserCheck size={14} className="text-[#7C3AED]" />
            <h2 className="font-semibold text-sm">הרשאת גישה חריגה</h2>
          </div>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-xs text-[#9CA3AF]">הענקת גישה לתלמידה שאינה בקבוצה</p>
          <div className="flex gap-2">
            <Input
              placeholder="ID של התלמידה"
              value={accessEmail}
              onChange={(e) => setAccessEmail(e.target.value)}
              className="flex-1"
            />
            <Button size="sm" variant="violet" onClick={() => grantMutation.mutate(accessEmail)} disabled={!accessEmail}>
              הענק גישה
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
