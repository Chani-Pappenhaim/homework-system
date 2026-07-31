import { toExternalUrl, todayISO } from '@/lib/utils';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit, Lock, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { FileGallery } from '@/components/ui/file-gallery';
import { MultiUrlInput } from '@/components/ui/multi-url-input';
import { DateField } from '@/components/ui/date-field';
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
import { useToast } from '@/components/ui/toast';

export default function CourseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [newLessonModal, setNewLessonModal] = useState(false);
  const [newTopic, setNewTopic] = useState('');
  const [newDate, setNewDate] = useState(todayISO());
  const [newContent, setNewContent] = useState('');
  const [newGithubUrls, setNewGithubUrls] = useState<string[]>(['']);

  const createLessonMutation = useMutation({
    mutationFn: () => lessonsApi.create(id!, {
      topic: newTopic,
      lessonDate: newDate || undefined,
      contentMd: newContent || undefined,
      githubUrls: newGithubUrls.map((u) => u.trim()).filter(Boolean),
    }),
    onSuccess: (res) => {
      const lessonId = (res.data as any).data.lesson.id;
      qc.invalidateQueries({ queryKey: ['course', id] });
      toast.success('השיעור נוצר בהצלחה');
      navigate(`/teacher/lessons/${lessonId}`);
    },
  });

  const deleteCourseMutation = useMutation({
    mutationFn: () => coursesApi.delete(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['courses'] });
      toast.success('הקורס נמחק');
      navigate('/teacher/courses');
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
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-rule pb-3">
        <div>
          <BackLink className="mb-2" />
          <h1 className="font-display text-2xl font-bold text-ink md:text-3xl">{course.name}</h1>
          <p className="text-ink/70 text-sm mt-0.5">{course.groupName} · {course.year}</p>
          {course.description && <p className="text-ink/70 text-sm mt-1">{course.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate(`/teacher/courses/${id}/edit`)}>
            <Edit size={13} /> ערוך קורס
          </Button>
          <Button
            variant="destructive"
            size="sm"
            loading={deleteCourseMutation.isPending}
            onClick={() => {
              if (confirm(`למחוק את הקורס "${course.name}"? כל השיעורים, המטלות, ההגשות והקבצים של הקורס יימחקו לצמיתות.`)) {
                deleteCourseMutation.mutate();
              }
            }}
          >
            <Trash2 size={13} /> מחק קורס
          </Button>
        </div>
      </div>

      {/* Lesson bubbles */}
      <Card accent="indigo">
        <CardHeader>
          <h2 className="font-display text-base font-bold">שיעורים ({course.lessons.length})</h2>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {course.lessons.map((l, i) => (
              <div key={l.id} className="flex flex-col items-center gap-1">
                <button
                  onClick={() => navigate(`/teacher/lessons/${l.id}`)}
                  title={l.topic}
                  className={`lift relative grid size-16 place-items-center rounded-lg border border-rule font-display text-lg font-bold shadow-soft
                    ${l.hidden ? 'bg-ground/60 text-ink/40' : 'bg-sheet text-ink'}`}
                >
                  <span>{i + 1}</span>
                  {l.hidden && <Lock size={10} className="absolute top-1 left-1 text-ink/50" />}
                </button>
                {Boolean(l.groupStudentCount) && (
                  <span className="text-[10px] font-medium text-ink-soft tabular">
                    {l.completedCount ?? 0}/{l.groupStudentCount} סיימו
                  </span>
                )}
              </div>
            ))}
            <button
              onClick={() => { setNewTopic(''); setNewDate(todayISO()); setNewContent(''); setNewGithubUrls(['']); setNewLessonModal(true); }}
              className="grid size-16 place-items-center rounded-lg border border-dashed border-rule text-ink-soft transition-colors hover:border-clay/50 hover:text-clay"
            >
              <Plus size={18} />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Links + Files — independent, equal-weight sections, side by side on wide screens */}
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
                <FileGallery files={course.files} />
              </CardContent>
            </Card>
          )}
        </div>
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
          <DateField label="תאריך" value={newDate} onChange={setNewDate} />
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
          <MultiUrlInput label="קישורים לקוד ב-GitHub (אופציונלי)" values={newGithubUrls} onChange={setNewGithubUrls} placeholder="https://github.com/..." />
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
