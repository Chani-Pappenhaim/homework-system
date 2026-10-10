import { toExternalUrl, todayISO, cn } from '@/lib/utils';
import { lessonPath, type CoursePageProps } from '@/components/lesson/LessonRoute';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit, ExternalLink, Plus, Trash2, ClipboardCheck, ArrowUpDown, BookOpen, Users, Paperclip } from 'lucide-react';
import { LessonReorderList } from '@/components/lesson/LessonReorderList';
import { LessonCard } from '@/components/lesson/LessonCard';
import { CourseAccessPanel } from '@/components/lesson/CourseAccessPanel';
import { FileGallery } from '@/components/ui/file-gallery';
import { MultiUrlInput } from '@/components/ui/multi-url-input';
import { DateField } from '@/components/ui/date-field';
import { coursesApi } from '@/api/courses.api';
import { lessonsApi } from '@/api/lessons.api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MarkdownField } from '@/components/ui/markdown-field';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
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
import { usePageTitle } from '@/hooks/usePageTitle';
import { useTabParam } from '@/hooks/useTabParam';

const TABS = ['lessons', 'students', 'materials'] as const;

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-card border border-rule bg-sheet p-4">
      <p className="font-sans text-xs text-ink/50">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold tabular text-ink">{value}</p>
      {hint && <p className="mt-0.5 font-sans text-xs text-ink/50">{hint}</p>}
    </div>
  );
}

export default function CourseDetailPage(props: Partial<CoursePageProps>) {
  const params = useParams<{ id: string }>();
  const id = props.courseId ?? params.id;
  const courseSlug = props.courseSlug ?? id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [newLessonModal, setNewLessonModal] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [tab, setTab] = useTabParam(TABS, 'lessons');
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
  usePageTitle(course?.name);
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
            <p className="text-ink/70 text-sm mt-0.5">{course.groupName || course.year}</p>
            {course.description && <MarkdownRenderer content={course.description} className="mt-1 text-ink/70" />}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate(`/teacher/reports?courseId=${id}`)}>
              <ClipboardCheck size={13} /> בדיקת הגשות
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate(`/teacher/courses/${courseSlug}/edit`)}>
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

      {/* Stats */}
      {studentCount > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile label="תלמידות בקורס" value={String(studentCount)} />
          <StatTile label="שיעורים" value={String(course.lessons.length)} />
          <StatTile label="השלמה ממוצעת" value={`${completionPct}%`} hint="מכלל השיעורים" />
        </div>
      )}

      {/* One section at a time instead of one long scroll */}
      <div className="flex flex-wrap items-center gap-2">
        {([
          ['lessons', BookOpen, `שיעורים (${course.lessons.length})`],
          ['students', Users, 'תלמידות נוספות'],
          ['materials', Paperclip, `חומרי עזר וקישורים (${course.links.length + course.files.length})`],
        ] as const).map(([key, Icon, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border border-rule px-4 py-2 text-sm font-semibold transition-colors',
              tab === key ? 'bg-ink text-sheet shadow-soft' : 'bg-sheet text-ink-soft hover:bg-ground',
            )}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {/* Lessons */}
      {tab === 'lessons' && (
      <Card accent="indigo">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <h2 className="font-display text-base font-bold">שיעורים ({course.lessons.length})</h2>
          {course.lessons.length > 1 && !reordering && (
            <Button variant="outline" size="sm" onClick={() => setReordering(true)}>
              <ArrowUpDown size={13} /> סידור השיעורים
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {reordering ? (
            <LessonReorderList courseId={course.id} lessons={course.lessons} onDone={() => setReordering(false)} />
          ) : (
          <div className="flex flex-wrap gap-3">
            {course.lessons.map((l, i) => (
              <LessonCard
                key={l.id}
                lesson={l}
                number={i + 1}
                onClick={() => navigate(lessonPath('teacher', courseSlug!, i + 1, l.topic))}
                onMouseEnter={() => qc.prefetchQuery({ queryKey: ['lesson', l.id], queryFn: () => lessonsApi.get(l.id) })}
                onFocus={() => qc.prefetchQuery({ queryKey: ['lesson', l.id], queryFn: () => lessonsApi.get(l.id) })}
                className="lift hover:bg-butter/10"
              />
            ))}
            <button
              onClick={() => { setNewTopic(''); setNewDate(todayISO()); setNewContent(''); setNewGithubUrls(['']); setNewLessonModal(true); }}
              className="flex w-36 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-rule p-3 text-sm text-ink-soft transition-colors hover:border-clay/50 hover:text-clay"
            >
              <Plus size={16} /> שיעור חדש
            </button>
          </div>
          )}
        </CardContent>
      </Card>

      )}

      {tab === 'students' && <CourseAccessPanel courseId={course.id} />}

      {/* Links + Files — independent, equal-weight sections, side by side on wide screens */}
      {tab === 'materials' && (course.links.length > 0 || course.files.length > 0 ? (
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
      ) : (
        <Card>
          <CardContent className="flex items-center justify-between gap-3 text-sm text-ink/60">
            עדיין אין לקורס חומרי עזר או קישורים.
            <Button variant="outline" size="sm" onClick={() => navigate(`/teacher/courses/${courseSlug}/edit`)}>
              <Plus size={13} /> הוספה
            </Button>
          </CardContent>
        </Card>
      ))}

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
          <MarkdownField
            label="חומר הלימוד (אופציונלי)"
            value={newContent}
            onChange={setNewContent}
            placeholder={'# כותרת\n\nתוכן השיעור, הסברים, דוגמאות קוד...'}
          />
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
