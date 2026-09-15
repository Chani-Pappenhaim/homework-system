import { toExternalUrl, todayISO, formatDate, cn } from '@/lib/utils';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit, Lock, ExternalLink, Plus, Trash2, ClipboardCheck, ChevronLeft, BookOpen } from 'lucide-react';
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

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-card border border-rule bg-sheet p-4">
      <p className="font-sans text-xs text-ink/50">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold tabular text-ink">{value}</p>
      {hint && <p className="mt-0.5 font-sans text-xs text-ink/50">{hint}</p>}
    </div>
  );
}

export default function CourseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<'content' | 'access'>('content');
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
      const lessonId = res.data.data.lesson.id;
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

  const studentCount = course.lessons.find((l) => l.groupStudentCount != null)?.groupStudentCount ?? 0;
  const completionPct = studentCount > 0 && course.lessons.length > 0
    ? Math.round(
        (course.lessons.reduce((s, l) => s + (l.completedCount ?? 0), 0) / (studentCount * course.lessons.length)) * 100,
      )
    : 0;

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <Card>
        <CardContent className="flex items-start justify-between">
          <div>
            <BackLink className="mb-2" />
            <h1 className="font-display text-2xl font-black text-ink md:text-3xl">{course.name}</h1>
            <p className="text-ink/70 text-sm mt-0.5">{course.groupName} · {course.year}</p>
            {course.description && <p className="text-ink/70 text-sm mt-1">{course.description}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate(`/teacher/reports?courseId=${id}`)}>
              <ClipboardCheck size={13} /> בדיקת הגשות
            </Button>
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
        </CardContent>
      </Card>

      {/* Content / Access — tab toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setTab('content')}
          className={cn(
            'flex items-center gap-1.5 rounded-lg border border-rule px-4 py-2 text-sm font-semibold transition-colors',
            tab === 'content' ? 'bg-ink text-sheet shadow-soft' : 'bg-sheet text-ink-soft hover:bg-ground',
          )}
        >
          <BookOpen size={15} /> תוכן קורס
        </button>
        <button
          onClick={() => setTab('access')}
          className={cn(
            'flex items-center gap-1.5 rounded-lg border border-rule px-4 py-2 text-sm font-semibold transition-colors',
            tab === 'access' ? 'bg-ink text-sheet shadow-soft' : 'bg-sheet text-ink-soft hover:bg-ground',
          )}
        >
          <Lock size={15} /> הרשאות גישה
        </button>
      </div>

      {tab === 'content' && (
      <div className="space-y-5">
      {/* Stats */}
      {studentCount > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile label="תלמידות בקורס" value={String(studentCount)} />
          <StatTile label="שיעורים" value={String(course.lessons.length)} />
          <StatTile label="השלמה ממוצעת" value={`${completionPct}%`} hint="מכלל השיעורים" />
        </div>
      )}

      {/* Lessons */}
      <Card accent="indigo">
        <CardHeader>
          <h2 className="font-display text-base font-bold">שיעורים ({course.lessons.length})</h2>
        </CardHeader>
        <CardContent className="space-y-2">
          {course.lessons.map((l, i) => (
            <button
              key={l.id}
              onClick={() => navigate(`/teacher/lessons/${l.id}`)}
              className={`flex w-full items-center gap-3 rounded-card border border-rule px-4 py-3 text-right transition-colors hover:bg-butter/10
                ${l.hidden ? 'bg-ground/40' : 'bg-sheet'}`}
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ground font-display text-sm font-bold tabular text-ink/60">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-sm font-bold text-ink">
                  {l.hidden && <Lock size={11} className="shrink-0 text-ink/40" />}
                  {l.topic}
                </p>
                <p className="mt-0.5 text-[11px] text-ink-soft">
                  {l.lessonDate ? formatDate(l.lessonDate) : 'ללא תאריך'}
                  {Boolean(l.groupStudentCount) && ` · ${l.completedCount ?? 0}/${l.groupStudentCount} סיימו`}
                </p>
              </div>
              <ChevronLeft size={14} className="shrink-0 text-ink-soft" />
            </button>
          ))}
          <button
            onClick={() => { setNewTopic(''); setNewDate(todayISO()); setNewContent(''); setNewGithubUrls(['']); setNewLessonModal(true); }}
            className="flex w-full items-center justify-center gap-1.5 rounded-card border border-dashed border-rule px-4 py-3 text-sm text-ink-soft transition-colors hover:border-clay/50 hover:text-clay"
          >
            <Plus size={16} /> שיעור חדש
          </button>
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
