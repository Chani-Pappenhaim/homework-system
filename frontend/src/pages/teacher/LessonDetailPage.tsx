import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Github, Edit, Trash2, Plus, BookOpen, Lock } from 'lucide-react';
import { lessonsApi } from '@/api/lessons.api';
import { assignmentsApi } from '@/api/assignments.api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BackLink } from '@/components/ui/back-link';
import { FileUpload } from '@/components/ui/file-upload';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
import { FileGallery } from '@/components/ui/file-gallery';
import { useToast } from '@/components/ui/toast';
import { LessonEditModal } from '@/components/lesson/LessonEditModal';
import { AssignmentModal } from '@/components/lesson/AssignmentModal';
import { AssignmentSubmissionsTable } from '@/components/lesson/AssignmentSubmissionsTable';
import { GradeModal } from '@/components/lesson/GradeModal';
import { LessonAccessPanel } from '@/components/lesson/LessonAccessPanel';
import { QuizResultsCard } from '@/components/lesson/QuizResultsCard';
import { cn, formatDate, toExternalUrl } from '@/lib/utils';
import type { AssignmentDTO, SubmissionDTO } from '@/types';

export default function LessonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
  const toast = useToast();
  const [selectedAssignment, setSelectedAssignment] = useState(0);
  const [gradeModal, setGradeModal] = useState<SubmissionDTO | null>(null);
  const [assignmentModal, setAssignmentModal] = useState<AssignmentDTO | null | 'new'>(null);
  const [lessonEditOpen, setLessonEditOpen] = useState(false);
  const [tab, setTab] = useState<'content' | 'access'>('content');

  const { data: lessonData, isLoading } = useQuery({
    queryKey: ['lesson', id],
    queryFn: () => lessonsApi.get(id!),
  });

  const lesson = lessonData?.data.data.lesson;
  const assignment = lesson?.assignments[selectedAssignment];

  // Deep-link from the grades report ("open for review"): land straight on the
  // right assignment tab instead of making the teacher hunt for it manually.
  const targetAssignmentId = searchParams.get('assignmentId');
  const targetSubmissionId = searchParams.get('submissionId') ?? undefined;
  useEffect(() => {
    if (!lesson || !targetAssignmentId) return;
    const i = lesson.assignments.findIndex((a) => a.id === targetAssignmentId);
    if (i >= 0) setSelectedAssignment(i);
  }, [lesson, targetAssignmentId]);

  const uploadFileMutation = useMutation({
    mutationFn: (vars: { file: File; name?: string }) => lessonsApi.uploadFile(id!, vars.file, vars.name),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lesson', id] }); toast.success('הקובץ הועלה'); },
  });

  const deleteLessonMutation = useMutation({
    mutationFn: () => lessonsApi.delete(id!),
    onSuccess: () => {
      const courseId = lesson?.courseId;
      qc.invalidateQueries({ queryKey: ['course', courseId] });
      qc.invalidateQueries({ queryKey: ['courses'] });
      toast.success('השיעור נמחק');
      navigate(courseId ? `/teacher/courses/${courseId}` : '/teacher/courses');
    },
  });

  const deleteFileMutation = useMutation({
    mutationFn: (fileId: string) => lessonsApi.deleteFile(id!, fileId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lesson', id] }),
  });

  const renameFileMutation = useMutation({
    mutationFn: ({ fileId, name }: { fileId: string; name: string }) => lessonsApi.renameFile(id!, fileId, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lesson', id] }),
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: (aId: string) => assignmentsApi.delete(aId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lesson', id] }); toast.success('המטלה נמחקה'); },
  });

  if (isLoading) return <div className="p-6 text-ink/50">טוען...</div>;
  if (!lesson) return <div className="p-6 text-coral">שיעור לא נמצא</div>;

  return (
    <div className="space-y-5" dir="rtl">
      <div className="border-b border-rule pb-3">
        <BackLink to={`/teacher/courses/${lesson.courseId}`} label="חזרה לקורס" className="mb-2" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-black text-ink md:text-3xl">{lesson.topic}</h1>
            {lesson.lessonDate && <p className="mt-1 text-sm text-ink/70">{formatDate(lesson.lessonDate)}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {lesson.hidden && <Badge variant="warning">מוסתר</Badge>}
            <Button size="sm" variant="outline" onClick={() => setLessonEditOpen(true)}>
              <Edit size={12} /> ערוך שיעור
            </Button>
            <Button
              size="sm"
              variant="destructive"
              loading={deleteLessonMutation.isPending}
              onClick={() => {
                if (confirm(`למחוק את השיעור "${lesson.topic}"? כל המטלות, ההגשות והקבצים של השיעור יימחקו לצמיתות.`)) {
                  deleteLessonMutation.mutate();
                }
              }}
            >
              <Trash2 size={12} /> מחק שיעור
            </Button>
          </div>
        </div>
      </div>

      {/* Content / Access — tab toggle on wide screens instead of a permanent 3-col split */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setTab('content')}
          className={cn(
            'flex items-center gap-1.5 rounded-lg border border-rule px-4 py-2 text-sm font-semibold transition-colors',
            tab === 'content' ? 'bg-ink text-sheet shadow-soft' : 'bg-sheet text-ink-soft hover:bg-ground',
          )}
        >
          <BookOpen size={15} /> תוכן שיעור
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

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:items-start">
      {tab === 'content' && (
      <div className="space-y-5 lg:col-span-3">
      {/* Lesson content */}
      <Card>
        <CardContent className="space-y-4">
          {lesson.contentMd
            ? <MarkdownRenderer content={lesson.contentMd} />
            : <p className="text-sm text-ink/50">אין תוכן לשיעור עדיין — לחצי על "ערוך שיעור" כדי להוסיף חומר לימוד.</p>}
          {lesson.githubUrls.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {lesson.githubUrls.map((url, i) => (
                <a key={i} href={toExternalUrl(url)} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-ink border border-rule/20 rounded-input px-3 py-1.5 hover:bg-ground/60 transition">
                  <Github size={14} /> {lesson.githubUrls.length > 1 ? `קוד השיעור #${i + 1}` : 'קוד השיעור ב-GitHub'}
                </a>
              ))}
            </div>
          )}

          {/* Files management */}
          <div className="space-y-2 pt-2 border-t border-rule/20">
            <p className="text-xs text-ink/50 font-medium">קבצים מצורפים</p>
            <FileGallery files={lesson.files} onDelete={(fileId) => deleteFileMutation.mutate(fileId)} onRename={(fileId, name) => renameFileMutation.mutate({ fileId, name })} />
            {lesson.files.length === 0 && (
              <p className="text-xs text-ink/50">אין קבצים מצורפים</p>
            )}
            <FileUpload
              withName
              onFile={(file, name) => uploadFileMutation.mutate({ file, name })}
              label={uploadFileMutation.isPending ? 'מעלה...' : 'גרור קובץ להעלאה או לחצי לבחירה'}
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* Assignments + submissions */}
      <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex gap-2 flex-wrap">
                {lesson.assignments.map((a, i) => (
                  <button key={a.id} onClick={() => setSelectedAssignment(i)}
                    className={`rounded-input border px-3 py-1.5 text-sm font-bold transition-colors ${i === selectedAssignment ? 'border-rule bg-ink text-sheet' : 'border-rule/30 text-ink/70 hover:border-rule hover:bg-ground/60'}`}>
                    {a.title}
                  </button>
                ))}
                {lesson.assignments.length === 0 && (
                  <span className="text-sm text-ink/50">אין מטלות עדיין</span>
                )}
              </div>
              <Button size="sm" variant="secondary" onClick={() => setAssignmentModal('new')}>
                <Plus size={13} /> מטלה חדשה
              </Button>
            </div>
          </CardHeader>

          {assignment && (
            <div>
              {/* Assignment info */}
              <div className="px-5 py-3 bg-ground/60 border-b border-rule/20">
                <div className="flex items-start justify-between gap-2">
                  <dl className="grid flex-1 grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
                    {assignment.description && (
                      <>
                        <dt className="text-xs font-medium text-ink/50">תיאור</dt>
                        <dd className="text-ink/80">{assignment.description}</dd>
                      </>
                    )}
                    {assignment.deadline && (
                      <>
                        <dt className="text-xs font-medium text-ink/50">מועד אחרון</dt>
                        <dd className="font-medium text-ink">{formatDate(assignment.deadline)}</dd>
                      </>
                    )}
                    {assignment.aiInstructions && (
                      <>
                        <dt className="text-xs font-medium text-ink/50">הנחיות AI</dt>
                        <dd className="text-xs text-ink/60">{assignment.aiInstructions}</dd>
                      </>
                    )}
                  </dl>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => setAssignmentModal(assignment)}>
                      <Edit size={12} />
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => {
                      if (confirm('למחוק מטלה זו?')) deleteAssignmentMutation.mutate(assignment.id);
                    }}>
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </div>
              </div>

              <AssignmentSubmissionsTable
                assignmentId={assignment.id}
                onGrade={setGradeModal}
                autoOpenSubmissionId={assignment.id === targetAssignmentId ? targetSubmissionId : undefined}
                onAutoOpenHandled={() => setSearchParams((p) => { p.delete('assignmentId'); p.delete('submissionId'); return p; }, { replace: true })}
              />
            </div>
          )}
        </Card>

        <QuizResultsCard lesson={lesson} />
      </div>
      )}

      {tab === 'access' && (
      <div className="lg:col-span-3">
        <LessonAccessPanel lessonId={lesson.id} />
      </div>
      )}
      </div>

      <LessonEditModal lesson={lesson} open={lessonEditOpen} onClose={() => setLessonEditOpen(false)} />
      <AssignmentModal lessonId={lesson.id} value={assignmentModal} onClose={() => setAssignmentModal(null)} />
      <GradeModal submission={gradeModal} assignment={assignment} onClose={() => setGradeModal(null)} />
    </div>
  );
}
