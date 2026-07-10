import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Edit, Lock, ExternalLink, Plus } from 'lucide-react';
import { coursesApi } from '@/api/courses.api';
import { lessonsApi } from '@/api/lessons.api';
import Card, { CardBody, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { useState } from 'react';

export default function CourseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [newLessonModal, setNewLessonModal] = useState(false);
  const [newTopic, setNewTopic] = useState('');
  const [newDate, setNewDate] = useState('');

  const createLessonMutation = useMutation({
    mutationFn: () => lessonsApi.create(id!, { topic: newTopic, lessonDate: newDate || undefined }),
    onSuccess: (res) => {
      const lessonId = (res.data as any).data.lesson.id;
      navigate(`/teacher/lessons/${lessonId}`);
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ['course', id],
    queryFn: () => coursesApi.get(id!),
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
              onClick={() => { setNewTopic(''); setNewDate(''); setNewLessonModal(true); }}
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

      {/* New lesson modal */}
      <Modal open={newLessonModal} onClose={() => setNewLessonModal(false)} title="שיעור חדש">
        <div className="space-y-3">
          <Input label="נושא השיעור *" value={newTopic} onChange={(e) => setNewTopic(e.target.value)} placeholder="React Hooks" />
          <Input label="תאריך (אופציונלי)" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          <Button
            loading={createLessonMutation.isPending}
            onClick={() => createLessonMutation.mutate()}
            disabled={!newTopic.trim()}
            className="w-full"
          >
            צור שיעור
          </Button>
        </div>
      </Modal>
    </div>
  );
}
