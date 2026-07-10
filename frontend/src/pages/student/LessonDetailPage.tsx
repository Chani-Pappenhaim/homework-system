import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Github, Paperclip, CheckCircle, Clock, Bot } from 'lucide-react';
import { lessonsApi } from '@/api/lessons.api';
import { submissionsApi } from '@/api/submissions.api';
import Card, { CardBody, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import FileUpload from '@/components/ui/FileUpload';
import Input from '@/components/ui/Input';
import { formatDate, formatDateTime, isOverdue } from '@/lib/utils';
import type { AssignmentDTO } from '@/types';

export default function StudentLessonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

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

  if (isLoading) return <div className="p-6 text-[#9CA3AF]">טוען...</div>;
  if (!lesson) return <div className="p-6 text-red-500">שיעור לא נמצא</div>;

  return (
    <div className="max-w-2xl space-y-5" dir="rtl">
      <div>
        <h1 className="text-xl font-bold">{lesson.topic}</h1>
        {lesson.lessonDate && <p className="text-[#6B7280] text-sm mt-0.5">{formatDate(lesson.lessonDate)}</p>}
      </div>

      {/* Content */}
      {lesson.contentMd && (
        <Card>
          <CardBody>
            <MarkdownRenderer content={lesson.contentMd} />
          </CardBody>
        </Card>
      )}

      {/* GitHub */}
      {lesson.githubUrl && (
        <a href={lesson.githubUrl} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-2 text-sm border border-[#EEEBF5] rounded-input px-4 py-2 text-[#1A1830] hover:bg-[#F8F7FC] transition">
          <Github size={14} /> קוד השיעור ב-GitHub
        </a>
      )}

      {/* Files */}
      {lesson.files.length > 0 && (
        <Card>
          <CardHeader><h2 className="text-sm font-semibold">קבצים</h2></CardHeader>
          <CardBody className="space-y-2">
            {lesson.files.map((f) => (
              <a key={f.id} href={f.url} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 text-sm text-primary hover:underline">
                <Paperclip size={12} /> {f.name}
              </a>
            ))}
          </CardBody>
        </Card>
      )}

      {/* Quiz button */}
      <button
        onClick={() => navigate(`/student/quiz/${lesson.id}`)}
        className="w-full py-3 gradient-primary text-white rounded-card text-sm font-medium hover:opacity-90 transition"
      >
        ✦ פתחי חידון לשיעור זה
      </button>

      {/* Assignments */}
      {lesson.assignments.map((a) => {
        const sub = submitted.find((s) => s.assignmentTitle === a.title);
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
            <Badge variant="green"><CheckCircle size={10} className="ml-1" /> הוגש</Badge>
          ) : a.deadline && isOverdue(a.deadline) ? (
            <Badge variant="pink">פג תוקף</Badge>
          ) : (
            <Badge variant="amber"><Clock size={10} className="ml-1" /> ממתין</Badge>
          )}
        </div>
      </CardHeader>
      <CardBody className="space-y-3">
        {a.description && <p className="text-sm text-[#6B7280]">{a.description}</p>}
        {a.deadline && (
          <p className="text-xs text-[#9CA3AF]">מועד אחרון: <span className="font-medium">{formatDate(a.deadline)}</span></p>
        )}

        {/* Already submitted */}
        {sub ? (
          <div className="space-y-3">
            <div className="bg-[#F0FDF4] border border-[#BBF7D0] rounded-input p-3 text-sm space-y-1">
              <p className="text-[#065F46] font-medium">הגשתך התקבלה בהצלחה ✓</p>
              <p className="text-[#6B7280] text-xs">הוגש: {formatDateTime(sub.submittedAt)}</p>
              {sub.isLate && <Badge variant="amber">הוגש באיחור</Badge>}
              {sub.notes && <p className="text-xs text-[#6B7280]">הערה: {sub.notes}</p>}
              {sub.grade && (
                <div className="mt-2 space-y-1">
                  {sub.grade.score != null && <p className="font-semibold">ציון: {sub.grade.score}</p>}
                  {sub.grade.feedback && <MarkdownRenderer content={sub.grade.feedback} className="text-xs" />}
                  {sub.grade.checklist?.map((c: any) => (
                    <div key={c.id} className={`text-xs flex items-center gap-1 ${c.checked ? 'text-[#059669]' : 'text-[#9CA3AF]'}`}>
                      {c.checked ? '✓' : '✗'} {c.text}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* AI Review section */}
            {sub.githubUrl && (
              <div className="border border-[#E5E1F5] rounded-input p-3 text-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 font-medium text-[#1A1830]"><Bot size={14} /> בדיקת AI</span>
                  {sub.aiStatus === 'none' && (
                    <Button size="sm" variant="ghost" loading={aiReviewMutation.isPending}
                      onClick={() => aiReviewMutation.mutate()}>
                      בקשי בדיקה
                    </Button>
                  )}
                  {sub.aiStatus === 'pending' && <Badge variant="amber">בודק...</Badge>}
                  {sub.aiStatus === 'done' && !sub.aiApproved && <Badge variant="green">נבדק ✓</Badge>}
                  {sub.aiStatus === 'error' && <Badge variant="pink">שגיאה</Badge>}
                </div>
                {sub.aiStatus === 'done' && sub.aiApproved && (
                  <div className="space-y-2 pt-1">
                    <p className="font-semibold text-[#1A1830]">ציון: {sub.aiScore}</p>
                    <p className="text-[#6B7280] text-xs">{sub.aiVerbalReview}</p>
                    <button className="text-xs text-primary underline" onClick={() => setShowAiReview(!showAiReview)}>
                      {showAiReview ? 'הסתירי הערות קוד' : 'הצגי הערות קוד'}
                    </button>
                    {showAiReview && (
                      <pre className="text-xs bg-[#F8F7FC] rounded p-2 whitespace-pre-wrap">{sub.aiCodeReview}</pre>
                    )}
                  </div>
                )}
                {error && <p className="text-red-500 text-xs">{error}</p>}
              </div>
            )}
          </div>
        ) : (
          <>
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
                    variant="ghost"
                    loading={repoMutation.isPending}
                    onClick={() => repoMutation.mutate()}
                    disabled={!repoName.trim()}
                  >
                    הגש
                  </Button>
                </div>
                {githubPreview && (
                  <p className="text-xs text-[#9CA3AF] flex items-center gap-1">
                    <Github size={11} /> {githubPreview}
                  </p>
                )}
              </div>
            )}
            <textarea
              className="w-full border border-[#E5E1F5] rounded-input px-3 py-2 text-sm resize-none placeholder:text-[#9CA3AF] focus:outline-none focus:ring-1 focus:ring-primary"
              rows={2}
              placeholder="הערה למורה (אופציונלי)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            {error && <p className="text-red-500 text-xs">{error}</p>}
          </>
        )}
      </CardBody>
    </Card>
  );
}
