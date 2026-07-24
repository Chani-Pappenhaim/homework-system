import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Github, Paperclip, CheckCircle, Clock, Bot, Check } from 'lucide-react';
import { lessonsApi } from '@/api/lessons.api';
import { submissionsApi } from '@/api/submissions.api';
import { messagesApi } from '@/api/messages.api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
import { FileUpload } from '@/components/ui/file-upload';
import { Input } from '@/components/ui/input';
import { BackLink } from '@/components/ui/back-link';
import { cn, formatDate, formatDateTime, isOverdue, toExternalUrl } from '@/lib/utils';
import type { AssignmentDTO } from '@/types';

export default function StudentLessonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['lesson', id],
    queryFn: () => lessonsApi.get(id!),
  });

  const { data: mineData } = useQuery({
    queryKey: ['mine'],
    queryFn: () => submissionsApi.mine(),
  });

  const lesson = data?.data.data.lesson;
  const submitted: any[] = (mineData?.data as any)?.data?.submitted ?? [];

  const progressMutation = useMutation({
    mutationFn: (completed: boolean) => lessonsApi.setProgress(id!, completed),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lesson', id] });
      qc.invalidateQueries({ queryKey: ['courses'] });
      qc.invalidateQueries({ queryKey: ['course'] });
    },
  });

  if (isLoading) return <div className="p-6 text-ink/50">טוען...</div>;
  if (!lesson) return <div className="p-6 text-coral">שיעור לא נמצא</div>;

  return (
    <div className="max-w-2xl space-y-5" dir="rtl">
      <div className="border-b border-rule pb-3">
        <BackLink to={`/student/courses/${lesson.courseId}`} label="חזרה לקורס" className="mb-2" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-black text-ink md:text-3xl">{lesson.topic}</h1>
            {lesson.lessonDate && (
              <p className="mt-1 font-sans text-xs text-ink/60">{formatDate(lesson.lessonDate)}</p>
            )}
          </div>
          <button
            onClick={() => progressMutation.mutate(!lesson.completed)}
            disabled={progressMutation.isPending}
            className={cn(
              'flex shrink-0 items-center gap-1.5 border border-rule px-3 py-2 text-sm font-bold shadow-soft transition-all duration-150 ease-linear hover:-translate-x-0.5 hover:-translate-y-0.5 disabled:opacity-50',
              lesson.completed ? 'bg-sage text-sheet' : 'bg-butter text-ink',
            )}
          >
            <Check size={15} strokeWidth={3} />
            {lesson.completed ? 'הושלם — בטלי סימון' : 'סיימתי את השיעור'}
          </button>
        </div>
      </div>

      {/* Content */}
      {lesson.contentMd && (
        <Card>
          <CardContent>
            <MarkdownRenderer content={lesson.contentMd} />
          </CardContent>
        </Card>
      )}

      {/* GitHub */}
      {lesson.githubUrl && (
        <a href={toExternalUrl(lesson.githubUrl)} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-2 text-sm border border-rule/20 rounded-input px-4 py-2 text-ink hover:bg-ground/60 transition">
          <Github size={14} /> קוד השיעור ב-GitHub
        </a>
      )}

      {/* Files */}
      {lesson.files.length > 0 && (
        <Card>
          <CardHeader><h2 className="text-sm font-semibold">קבצים</h2></CardHeader>
          <CardContent className="space-y-2">
            {lesson.files.map((f) => (
              <a key={f.id} href={f.url} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 text-sm text-primary hover:underline">
                <Paperclip size={12} /> {f.name}
              </a>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Quiz button */}
      <button
        onClick={() => navigate(`/student/quiz/${lesson.id}`)}
        className="w-full border border-rule bg-butter py-3 text-sm font-bold text-ink shadow-sheet transition-all duration-150 ease-linear hover:-translate-x-0.5 hover:-translate-y-0.5"
      >
        פתחי חידון לשיעור זה ←
      </button>

      {/* Assignments */}
      {lesson.assignments.map((a) => {
        const sub = submitted.find((s) => s.assignmentId === a.id);
        return <AssignmentCard key={a.id} assignment={a} submission={sub} />;
      })}
    </div>
  );
}

function AssignmentCard({ assignment: a, submission: sub }: {
  assignment: AssignmentDTO; submission: any;
}) {
  const qc = useQueryClient();
  const [repoName, setRepoName] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [showAiReview, setShowAiReview] = useState(false);
  const [lateFormOpen, setLateFormOpen] = useState(false);
  const [lateReason, setLateReason] = useState('');
  const [lateRequestSent, setLateRequestSent] = useState(false);

  const lateRequestMutation = useMutation({
    mutationFn: () => messagesApi.send(
      `בקשת הגשה מאוחרת עבור "${a.title}"${lateReason.trim() ? `: ${lateReason.trim()}` : ''}`
    ),
    onSuccess: () => { setLateRequestSent(true); setLateFormOpen(false); setLateReason(''); setError(''); },
    onError: (e: any) => setError(e.response?.data?.error ?? 'שגיאה בשליחת הבקשה'),
  });

  const aiReviewMutation = useMutation({
    mutationFn: () => submissionsApi.requestAiReview(sub?.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mine'] }),
    onError: (e: any) => setError(e.response?.data?.error ?? 'שגיאה בבקשת בדיקה'),
  });

  const fileMutation = useMutation({
    mutationFn: (file: File) => submissionsApi.submitFile(a.id, file, notes || undefined),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mine'] }); setError(''); setNotes(''); },
    onError: (e: any) => setError(e.response?.data?.error ?? 'שגיאה בהגשה'),
  });

  const repoMutation = useMutation({
    mutationFn: () => submissionsApi.submitRepo(a.id, repoName, notes || undefined),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mine'] }); setRepoName(''); setNotes(''); setError(''); },
    onError: (e: any) => setError(e.response?.data?.error ?? 'שגיאה בהגשה'),
  });

  const githubPreview = repoName ? `https://github.com/[username]/${repoName}` : '';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">{a.title}</h3>
          {sub ? (
            <Badge variant="success"><CheckCircle size={10} className="ml-1" /> הוגש</Badge>
          ) : a.deadline && isOverdue(a.deadline) ? (
            <Badge variant="default">פג תוקף</Badge>
          ) : (
            <Badge variant="warning"><Clock size={10} className="ml-1" /> ממתין</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {a.description && <p className="text-sm text-ink/70">{a.description}</p>}
        {a.deadline && (
          <p className="text-xs text-ink/50">מועד אחרון: <span className="font-medium">{formatDate(a.deadline)}</span></p>
        )}

        {/* Already submitted */}
        {sub ? (
          <div className="space-y-3">
            <div className="bg-sage/10 border border-sage/30 rounded-input p-3 text-sm space-y-1">
              <p className="text-sage font-medium">הגשתך התקבלה בהצלחה ✓</p>
              <p className="text-ink/70 text-xs">הוגש: {formatDateTime(sub.submittedAt)}</p>
              {sub.isLate && <Badge variant="warning">הוגש באיחור</Badge>}
              {sub.notes && <p className="text-xs text-ink/70">הערה: {sub.notes}</p>}
              {sub.grade && (
                <div className="mt-2 space-y-1">
                  {sub.grade.submissionScore != null && <p className="font-semibold">ציון הגשה: {sub.grade.submissionScore}</p>}
                  {sub.grade.contentScore != null && <p className="font-semibold">ציון תוכן: {sub.grade.contentScore}</p>}
                  {sub.grade.feedback && <MarkdownRenderer content={sub.grade.feedback} className="text-xs" />}
                  {sub.grade.checklist?.map((c: any) => (
                    <div key={c.id} className={`text-xs flex items-center gap-1 ${c.checked ? 'text-sage' : 'text-ink/50'}`}>
                      {c.checked ? '✓' : '✗'} {c.text}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* AI Review section */}
            {sub.githubUrl && (
              <div className="border border-rule/15 rounded-input p-3 text-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 font-medium text-ink"><Bot size={14} /> בדיקת AI</span>
                  {sub.aiStatus === 'none' && (
                    <Button size="sm" variant="outline" loading={aiReviewMutation.isPending}
                      onClick={() => aiReviewMutation.mutate()}>
                      בקשי בדיקה
                    </Button>
                  )}
                  {sub.aiStatus === 'pending' && <Badge variant="warning">בודק...</Badge>}
                  {sub.aiStatus === 'done' && !sub.aiApproved && <Badge variant="success">נבדק ✓</Badge>}
                  {sub.aiStatus === 'error' && <Badge variant="default">שגיאה</Badge>}
                </div>
                {sub.aiStatus === 'done' && sub.aiApproved && (
                  <div className="space-y-2 pt-1">
                    <p className="font-semibold text-ink">ציון: {sub.aiScore}</p>
                    <p className="text-ink/70 text-xs">{sub.aiVerbalReview}</p>
                    <button className="text-xs text-primary underline" onClick={() => setShowAiReview(!showAiReview)}>
                      {showAiReview ? 'הסתירי הערות קוד' : 'הצגי הערות קוד'}
                    </button>
                    {showAiReview && (
                      <pre className="text-xs bg-ground/60 rounded p-2 whitespace-pre-wrap">{sub.aiCodeReview}</pre>
                    )}
                  </div>
                )}
                {error && <p className="text-coral text-xs">{error}</p>}
              </div>
            )}
          </div>
        ) : (
          <>
            {a.deadline && isOverdue(a.deadline) && (
              <div className="space-y-2">
                {lateRequestSent ? (
                  <p className="text-xs text-sage font-medium">הבקשה נשלחה למורה ✓</p>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setLateFormOpen(!lateFormOpen)}
                  >
                    בקשי אישור הגשה מאוחרת
                  </Button>
                )}
                {lateFormOpen && !lateRequestSent && (
                  <div className="space-y-2">
                    <Textarea
                      className="resize-none"
                      rows={2}
                      placeholder="סיבת האיחור (אופציונלי)"
                      value={lateReason}
                      onChange={(e) => setLateReason(e.target.value)}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        loading={lateRequestMutation.isPending}
                        onClick={() => lateRequestMutation.mutate()}
                      >
                        שלחי בקשה
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setLateFormOpen(false); setLateReason(''); }}>
                        ביטול
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {a.allowFile && (
              <FileUpload
                accept={a.allowedTypes.length ? a.allowedTypes.map((t) => `.${t}`).join(',') : undefined}
                onFile={(file) => fileMutation.mutate(file)}
                label={a.allowedTypes.length ? `קבצים מורשים: ${a.allowedTypes.join(', ')}` : 'גרור קובץ לכאן'}
              />
            )}
            {a.allowGithub && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="שם הפרויקט ב-GitHub"
                    value={repoName}
                    onChange={(e) => setRepoName(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    loading={repoMutation.isPending}
                    onClick={() => repoMutation.mutate()}
                    disabled={!repoName.trim()}
                  >
                    הגש
                  </Button>
                </div>
                {githubPreview && (
                  <p className="text-xs text-ink/50 flex items-center gap-1">
                    <Github size={11} /> {githubPreview}
                  </p>
                )}
              </div>
            )}
            <Textarea
              className="resize-none"
              rows={2}
              placeholder="הערה למורה (אופציונלי)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            {error && <p className="text-coral text-xs">{error}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
