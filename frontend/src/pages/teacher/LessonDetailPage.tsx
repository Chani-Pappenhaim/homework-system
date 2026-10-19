import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Github, Edit, Trash2, Plus, BookOpen, Lock, ClipboardList, Paperclip, ChevronRight, ChevronLeft, Sparkles, Copy } from 'lucide-react';
import { lessonsApi } from '@/api/lessons.api';
import { assignmentsApi } from '@/api/assignments.api';
import { quizzesApi } from '@/api/quizzes.api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BackLink } from '@/components/ui/back-link';
import { LinkExistingFile } from '@/components/teacher/LinkExistingFile';
import { FileUpload } from '@/components/ui/file-upload';
import { PreviewableTypes } from '@/components/ui/previewable-types';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
import { FileGallery } from '@/components/ui/file-gallery';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { LessonEditModal } from '@/components/lesson/LessonEditModal';
import { LessonCopyModal } from '@/components/lesson/LessonCopyModal';
import { AssignmentModal } from '@/components/lesson/AssignmentModal';
import { AssignmentView, ASSIGNMENT_SECTIONS, type AssignmentSection } from '@/components/lesson/AssignmentView';
import { LessonAccessPanel } from '@/components/lesson/LessonAccessPanel';
import { QuizResultsCard } from '@/components/lesson/QuizResultsCard';
import QuizPanel from '@/components/teacher/QuizPanel';
import QuizDashboard from '@/components/teacher/QuizDashboard';
import { cn, formatDateFull, toExternalUrl } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/errors';
import { useTabParam } from '@/hooks/useTabParam';
import { usePageTitle } from '@/hooks/usePageTitle';
import type { LessonPageProps } from '@/components/lesson/LessonRoute';
import type { AssignmentDTO, QuizResultsDTO } from '@/types';
import { useConfirm } from '@/components/ui/use-confirm';

const TABS = ['content', 'files', 'assignments', 'access', 'quiz'] as const;

export default function LessonDetailPage({ lessonId, lessonNumber }: Partial<LessonPageProps> = {}) {
  const params = useParams<{ id: string }>();
  const id = lessonId ?? params.id;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
  const toast = useToast();
  const [confirmDialog, ask] = useConfirm();
  const [assignmentModal, setAssignmentModal] = useState<AssignmentDTO | null | 'new'>(null);
  const [lessonEditOpen, setLessonEditOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [tab, setTab] = useTabParam(TABS, 'content');

  const { data: lessonData, isLoading } = useQuery({
    queryKey: ['lesson', id],
    queryFn: () => lessonsApi.get(id!),
  });

  const lesson = lessonData?.data.data.lesson;

  // The open assignment and the quiz-management view live in the URL
  // (`?tab=assignments&assignmentId=…`, `?tab=quiz&view=manage`), so a refresh
  // or a shared link lands on the same screen and "back" returns to the list.
  const targetAssignmentId = searchParams.get('assignmentId');
  const targetSubmissionId = searchParams.get('submissionId') ?? undefined;
  const assignment = targetAssignmentId ? lesson?.assignments.find((a) => a.id === targetAssignmentId) : undefined;
  const viewingAssignment = Boolean(assignment);
  const viewingQuiz = searchParams.get('view') === 'manage';
  const rawSection = searchParams.get('section');
  const assignmentSection: AssignmentSection = ASSIGNMENT_SECTIONS.includes(rawSection as AssignmentSection)
    ? rawSection as AssignmentSection
    : 'submissions';

  const openAssignment = (assignmentId: string) => setSearchParams((p) => {
    const next = new URLSearchParams(p);
    next.set('tab', 'assignments');
    next.set('assignmentId', assignmentId);
    next.delete('submissionId');
    next.delete('section');
    return next;
  });
  const closeAssignment = () => setSearchParams((p) => {
    const next = new URLSearchParams(p);
    next.delete('assignmentId');
    next.delete('submissionId');
    next.delete('section');
    return next;
  }, { replace: true });
  // Leaving the open assignment with a grade still unsaved asks first, the
  // same as switching to another student does inside it.
  const gradeDirtyRef = useRef(false);
  const onGradeDirtyChange = useCallback((dirty: boolean) => { gradeDirtyRef.current = dirty; }, []);
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  const leaveAssignment = (leave: () => void) => {
    if (gradeDirtyRef.current) setPendingLeave(() => leave);
    else leave();
  };
  // Leaving the assignments tab closes the open assignment in the same update —
  // otherwise the deep-link effect below sees it still in the URL and pulls the
  // page straight back to the assignments tab.
  const switchTab = (next: typeof TABS[number]) => {
    if (next === 'assignments' || !targetAssignmentId) { setTab(next); return; }
    leaveAssignment(() => setSearchParams((p) => {
      const params = new URLSearchParams(p);
      if (next === 'content') params.delete('tab'); else params.set('tab', next);
      params.delete('assignmentId');
      params.delete('submissionId');
      params.delete('section');
      return params;
    }, { replace: true }));
  };
  // The assignment's tab and the student being graded replace the history
  // entry, so "back" leaves the assignment rather than replaying every click.
  const setAssignmentSection = (section: AssignmentSection) => setSearchParams((p) => {
    const next = new URLSearchParams(p);
    if (section === 'submissions') next.delete('section'); else next.set('section', section);
    return next;
  }, { replace: true });
  const selectSubmission = useCallback((submissionId: string) => setSearchParams((p) => {
    const next = new URLSearchParams(p);
    next.set('submissionId', submissionId);
    return next;
  }, { replace: true }), [setSearchParams]);
  const setViewingQuiz = (open: boolean) => setSearchParams((p) => {
    const next = new URLSearchParams(p);
    if (open) next.set('view', 'manage'); else next.delete('view');
    return next;
  }, { replace: !open });
  usePageTitle(lesson?.topic, lessonNumber ? `שיעור ${lessonNumber}` : null);

  const { data: quizResultsData } = useQuery({
    queryKey: ['quiz-results', id],
    queryFn: () => quizzesApi.results(id!),
    enabled: Boolean(id) && viewingQuiz,
    retry: false,
  });
  const quizResults = (quizResultsData?.data as any)?.data as QuizResultsDTO | undefined;

  // Deep-link from the grades report ("open for review") may name only the
  // assignment: show it on the assignments tab.
  useEffect(() => {
    if (assignment && tab !== 'assignments') setTab('assignments');
  }, [assignment, tab, setTab]);

  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const uploadFileMutation = useMutation({
    mutationFn: (vars: { file: File; name?: string }) => {
      setUploadProgress(0);
      return lessonsApi.uploadFile(id!, vars.file, vars.name, setUploadProgress);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lesson', id] }); toast.success('הקובץ הועלה'); },
    onError: (e: any) => toast.error(getApiErrorMessage(e, 'העלאת הקובץ נכשלה')),
    onSettled: () => setUploadProgress(null),
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

  const requiredFileMutation = useMutation({
    mutationFn: ({ fileId, required }: { fileId: string; required: boolean }) => lessonsApi.setFileRequired(id!, fileId, required),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lesson', id] }),
  });

  const hiddenFileMutation = useMutation({
    mutationFn: ({ fileId, hidden }: { fileId: string; hidden: boolean }) => lessonsApi.setFileHidden(id!, fileId, hidden),
    onSuccess: (_, { hidden }) => {
      qc.invalidateQueries({ queryKey: ['lesson', id] });
      toast.success(hidden ? 'הקובץ הוסתר מהתלמידות' : 'הקובץ מוצג לתלמידות');
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'שגיאה בעדכון הקובץ')),
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: (aId: string) => assignmentsApi.delete(aId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lesson', id] }); toast.success('המטלה נמחקה'); },
    onError: (err) => toast.error(getApiErrorMessage(err, 'שגיאה במחיקת המטלה')),
  });

  // Deleting an assignment cascades to its submissions and grades, so the confirm says so explicitly
  const confirmDeleteAssignment = async (a: { id: string; title: string }) => {
    if (!(await ask({ title: `למחוק את המטלה "${a.title}"?`, description: 'כל ההגשות והציונים של המטלה יימחקו לצמיתות.' }))) return;
    deleteAssignmentMutation.mutate(a.id);
    if (assignment?.id === a.id) closeAssignment();
  };

  if (isLoading) return <div className="p-6 text-ink/50">טוען...</div>;
  if (!lesson) return <div className="p-6 text-coral">שיעור לא נמצא</div>;

  return (
    <div className="space-y-5" dir="rtl">
      <div className="border-b border-rule pb-3">
        <BackLink to={`/teacher/courses/${lesson.courseId}`} label="חזרה לקורס" className="mb-2" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-black text-ink md:text-3xl">{lesson.topic}</h1>
            {(lessonNumber || lesson.lessonDate) && (
              <p className="mt-1 text-sm text-ink/70">
                {[lessonNumber && `שיעור ${lessonNumber}`, lesson.lessonDate && formatDateFull(lesson.lessonDate)].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {lesson.hidden && <Badge variant="warning">מוסתר</Badge>}
            <Button size="sm" variant="outline" onClick={() => setLessonEditOpen(true)}>
              <Edit size={12} /> ערוך שיעור
            </Button>
            <Button size="sm" variant="outline" onClick={() => setCopyOpen(true)}>
              <Copy size={12} /> שכפול / העתקה
            </Button>
            <Button
              size="sm"
              variant="destructive"
              loading={deleteLessonMutation.isPending}
              onClick={async () => {
                if (await ask({ title: `למחוק את השיעור "${lesson.topic}"?`, description: 'כל המטלות, ההגשות והקבצים של השיעור יימחקו לצמיתות.' })) {
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
          onClick={() => switchTab('content')}
          className={cn(
            'flex items-center gap-1.5 rounded-lg border border-rule px-4 py-2 text-sm font-semibold transition-colors',
            tab === 'content' ? 'bg-ink text-sheet shadow-soft' : 'bg-sheet text-ink-soft hover:bg-ground',
          )}
        >
          <BookOpen size={15} /> תוכן שיעור
        </button>
        <button
          onClick={() => switchTab('files')}
          className={cn(
            'flex items-center gap-1.5 rounded-lg border border-rule px-4 py-2 text-sm font-semibold transition-colors',
            tab === 'files' ? 'bg-ink text-sheet shadow-soft' : 'bg-sheet text-ink-soft hover:bg-ground',
          )}
        >
          <Paperclip size={15} /> קבצים מצורפים
        </button>
        <button
          onClick={() => switchTab('assignments')}
          className={cn(
            'flex items-center gap-1.5 rounded-lg border border-rule px-4 py-2 text-sm font-semibold transition-colors',
            tab === 'assignments' ? 'bg-ink text-sheet shadow-soft' : 'bg-sheet text-ink-soft hover:bg-ground',
          )}
        >
          <ClipboardList size={15} /> מטלות
        </button>
        <button
          onClick={() => switchTab('access')}
          className={cn(
            'flex items-center gap-1.5 rounded-lg border border-rule px-4 py-2 text-sm font-semibold transition-colors',
            tab === 'access' ? 'bg-ink text-sheet shadow-soft' : 'bg-sheet text-ink-soft hover:bg-ground',
          )}
        >
          <Lock size={15} /> הרשאות
        </button>
        <button
          onClick={() => switchTab('quiz')}
          className={cn(
            'flex items-center gap-1.5 rounded-lg border border-rule px-4 py-2 text-sm font-semibold transition-colors',
            tab === 'quiz' ? 'bg-ink text-sheet shadow-soft' : 'bg-sheet text-ink-soft hover:bg-ground',
          )}
        >
          <Sparkles size={15} /> חידון AI
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:items-start">
      {tab === 'files' && (
      <div className="lg:col-span-3">
      {/* Files management — its own tab, so it stays reachable even when the lesson content is long */}
      <Card>
        <CardHeader>
          <h2 className="font-display text-base font-bold">קבצים מצורפים</h2>
        </CardHeader>
        <CardContent className="space-y-2">
          <FileUpload
            withName
            hint={<PreviewableTypes className="mt-1.5" />}
            onFile={(file, name) => uploadFileMutation.mutate({ file, name })}
            label={uploadFileMutation.isPending ? `מעלה... ${uploadProgress ?? 0}%` : 'גרור קובץ להעלאה או לחצי לבחירה'}
          />
          <LinkExistingFile target="lesson" targetId={lesson.id} onLinked={() => qc.invalidateQueries({ queryKey: ['lesson', id] })} />
          <FileGallery source="lesson"
            files={lesson.files}
            onDelete={(fileId) => deleteFileMutation.mutate(fileId)}
            onRename={(fileId, name) => renameFileMutation.mutate({ fileId, name })}
            onToggleRequired={(fileId, required) => requiredFileMutation.mutate({ fileId, required })}
            onToggleHidden={(fileId, hidden) => hiddenFileMutation.mutate({ fileId, hidden })}
            className="mt-1"
          />
          {lesson.files.length === 0 && (
            <p className="text-xs text-ink/50">אין קבצים מצורפים</p>
          )}
        </CardContent>
      </Card>
      </div>
      )}

      {tab === 'content' && (
      <div className="space-y-5 lg:col-span-3">
      {/* Lesson content */}
      <Card>
        <CardContent className="space-y-4">
          {lesson.contentMd
            ? <MarkdownRenderer content={lesson.contentMd} />
            : <p className="text-sm text-ink/50">אין תוכן לשיעור עדיין - לחצי על "ערוך שיעור" כדי להוסיף חומר לימוד.</p>}
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
        </CardContent>
      </Card>
      </div>
      )}

      {tab === 'assignments' && (
      <div className="lg:col-span-3">
      {/* Assignments + submissions: a compact clickable list, drilling into one assignment at a time */}
      {!viewingAssignment && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="font-display text-base font-bold">מטלות</h2>
              <Button size="sm" variant="secondary" onClick={() => setAssignmentModal('new')}>
                <Plus size={13} /> מטלה חדשה
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {lesson.assignments.length === 0 && (
              <p className="text-sm text-ink/50">אין מטלות עדיין</p>
            )}
            {lesson.assignments.map((a) => (
              <div
                key={a.id}
                className="flex w-full items-center gap-2 rounded-input border border-rule/30 pe-2 transition-colors hover:border-rule hover:bg-ground/60"
              >
                <button
                  onClick={() => openAssignment(a.id)}
                  className="flex flex-1 items-center justify-between gap-2 px-4 py-2.5 text-right"
                >
                  <span className="text-sm font-bold text-ink">{a.title}</span>
                  <ChevronLeft size={16} className="shrink-0 text-ink/40" />
                </button>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => setAssignmentModal(a)}>
                    <Edit size={12} /> עריכה
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => confirmDeleteAssignment(a)}>
                    <Trash2 size={12} /> מחיקה
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {viewingAssignment && assignment && (
        <AssignmentView
          assignment={assignment}
          section={assignmentSection}
          onSectionChange={setAssignmentSection}
          selectedSubmissionId={targetSubmissionId}
          onSelectSubmission={selectSubmission}
          onDirtyChange={onGradeDirtyChange}
          onBack={() => leaveAssignment(closeAssignment)}
          onEdit={() => setAssignmentModal(assignment)}
          onDelete={() => confirmDeleteAssignment(assignment)}
        />
      )}
      </div>
      )}

      {tab === 'access' && (
      <div className="space-y-5 lg:col-span-3">
        <LessonAccessPanel lessonId={lesson.id} />
      </div>
      )}

      {tab === 'quiz' && (
      <div className="space-y-5 lg:col-span-3">
        {!viewingQuiz && (
          <QuizResultsCard lesson={lesson} onManage={() => setViewingQuiz(true)} />
        )}

        {viewingQuiz && (
          <>
            <button
              onClick={() => setViewingQuiz(false)}
              className="flex items-center gap-1 text-sm font-semibold text-ink-soft hover:text-ink"
            >
              <ChevronRight size={15} /> חזרה לפרטי החידון
            </button>
            <QuizPanel
              lessonId={lesson.id}
              hasContent={Boolean(lesson.contentMd?.trim())}
              hasFiles={lesson.files.length > 0}
            />
            {quizResults && <QuizDashboard data={quizResults} />}
          </>
        )}
      </div>
      )}
      </div>

      <LessonEditModal lesson={lesson} open={lessonEditOpen} onClose={() => setLessonEditOpen(false)} />
      <LessonCopyModal lesson={lesson} open={copyOpen} onClose={() => setCopyOpen(false)} />
      <AssignmentModal lessonId={lesson.id} lessonDate={lesson.lessonDate} value={assignmentModal} onClose={() => setAssignmentModal(null)} />
      <ConfirmDialog
        open={Boolean(pendingLeave)}
        onOpenChange={(open) => { if (!open) setPendingLeave(null); }}
        title="לצאת בלי לשמור?"
        description="השינויים בציון עוד לא נשמרו, והם יאבדו ביציאה מהמטלה."
        confirmLabel="יציאה בלי לשמור"
        cancelLabel="הישארות"
        onConfirm={() => {
          const leave = pendingLeave;
          setPendingLeave(null);
          gradeDirtyRef.current = false;
          leave?.();
        }}
      />
      {confirmDialog}
    </div>
  );
}
