import { toExternalUrl } from '@/lib/utils';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Edit, Lock, ExternalLink, Plus } from 'lucide-react';
import { coursesApi } from '@/api/courses.api';
import { lessonsApi } from '@/api/lessons.api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { BackLink } from '@/components/ui/back-link';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useState } from 'react';

export default function CourseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [newLessonModal, setNewLessonModal] = useState(false);
  const [newTopic, setNewTopic] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newGithub, setNewGithub] = useState('');

  const createLessonMutation = useMutation({
    mutationFn: () => lessonsApi.create(id!, {
      topic: newTopic,
      lessonDate: newDate || undefined,
      contentMd: newContent || undefined,
      githubUrl: newGithub || undefined,
    }),
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
  if (isLoading) return <div className="p-6 text-ink/50">טוען...</div>;
  if (!course) return <div className="p-6 text-coral">קורס לא נמצא</div>;

  return (
    <div className="max-w-3xl space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-rule pb-3">
        <div>
          <BackLink className="mb-2" />
          <h1 className="font-display text-2xl font-black text-ink md:text-3xl">{course.name}</h1>
          <p className="text-ink/70 text-sm mt-0.5">{course.groupName} · {course.year}</p>
          {course.description && <p className="text-ink/70 text-sm mt-1">{course.description}</p>}
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate(`/teacher/courses/${id}/edit`)}>
          <Edit size={13} /> ערוך קורס
        </Button>
      </div>

      {/* Lesson bubbles */}
      <Card accent="indigo">
        <CardHeader>
          <h2 className="font-semibold text-sm">שיעורים ({course.lessons.length})</h2>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {course.lessons.map((l, i) => (
              <button
                key={l.id}
                onClick={() => navigate(`/teacher/lessons/${l.id}`)}
                className={`relative grid size-16 place-items-center border border-rule font-display text-lg font-black shadow-soft transition-all duration-150 ease-linear hover:-translate-x-0.5 hover:-translate-y-0.5
                  ${l.hidden ? 'bg-ground/60 text-ink/40' : 'bg-sheet text-ink'}`}
              >
                <span>{i + 1}</span>
                {l.hidden && <Lock size={10} className="absolute top-1 left-1 text-ink/50" />}
              </button>
            ))}
            <button
              onClick={() => { setNewTopic(''); setNewDate(''); setNewContent(''); setNewGithub(''); setNewLessonModal(true); }}
              className="flex items-center justify-center w-16 h-16 rounded-xl border border-dashed border-rule/20 text-ink/50 hover:border-primary/40 hover:text-primary transition"
            >
              <Plus size={18} />
            </button>
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
                <ExternalLink size={13} /> {f.name}
              </a>
            ))}
          </CardContent>
        </Card>
      )}

      {/* New lesson modal */}
      <Dialog open={newLessonModal} onOpenChange={setNewLessonModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>שיעור חדש</DialogTitle>
          </DialogHeader>
          <DialogBody>
        <div className="space-y-3">
          <Input label="נושא השיעור *" value={newTopic} onChange={(e) => setNewTopic(e.target.value)} placeholder="React Hooks" />
          <Input label="תאריך (אופציונלי)" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">חומר הלימוד (אופציונלי, Markdown)</label>
            <Textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              rows={5}
              className="resize-y font-sans"
              placeholder="# כותרת&#10;&#10;תוכן השיעור, הסברים, דוגמאות קוד..."
            />
          </div>
          <Input label="קישור לקוד ב-GitHub (אופציונלי)" value={newGithub} onChange={(e) => setNewGithub(e.target.value)} placeholder="https://github.com/..." />
          <p className="text-xs text-ink/50">קבצים מצורפים אפשר להעלות אחרי היצירה, בתוך דף השיעור.</p>
          <Button
            loading={createLessonMutation.isPending}
            onClick={() => createLessonMutation.mutate()}
            disabled={!newTopic.trim()}
            className="w-full"
          >
            צור שיעור
          </Button>
        </div>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}
