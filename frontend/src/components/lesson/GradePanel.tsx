import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Github, Bot, RotateCcw, CheckCircle, Sparkles, RefreshCw, ChevronLeft } from 'lucide-react';
import { gradesApi } from '@/api/grades.api';
import { submissionsApi } from '@/api/submissions.api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { MarkdownField } from '@/components/ui/markdown-field';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
import { useToast } from '@/components/ui/toast';
import { getApiErrorMessage } from '@/lib/errors';
import { apiFileUrl } from '@/lib/config';
import { AI_AVAILABILITY_QUERY_KEY, useAiAvailability } from '@/hooks/useAiAvailability';
import type { AssignmentDTO, ChecklistResult, SubmissionDTO } from '@/types';

interface GradeForm {
  submissionScore: string;
  contentScore: string;
  feedback: string;
  checklist: ChecklistResult[];
}

type SaveMode = 'save' | 'approve' | 'next';

function initialForm(submission: SubmissionDTO, assignment: AssignmentDTO): GradeForm {
  const checklist = assignment.requirements?.map((r) => ({
    id: r.id, text: r.text,
    checked: submission.grade?.checklist?.find((c) => c.id === r.id)?.checked ?? false,
  })) ?? [];
  // Default suggestion: 100, minus 10 for a late submission, minus 5 per unchecked requirement.
  const unchecked = checklist.filter((c) => !c.checked).length;
  const suggested = Math.max(0, 100 - (submission.isLate ? 10 : 0) - unchecked * 5);
  return {
    submissionScore: String(submission.grade?.submissionScore ?? suggested),
    contentScore: submission.grade?.contentScore != null ? String(submission.grade.contentScore) : '',
    feedback: submission.grade?.feedback ?? '',
    checklist,
  };
}

const sameForm = (a: GradeForm, b: GradeForm) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Grading one submission, inline on the assignment page. Mount it with
 * `key={submission.id}`: the form is filled once per submission, so a background
 * refetch (e.g. returning to the window) never wipes what the teacher is typing.
 */
export function GradePanel({ submission, assignment, onDirtyChange, onNext }: {
  submission: SubmissionDTO;
  assignment: AssignmentDTO;
  /** Unsaved edits, so the page can ask before switching to another student. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Present when there is a next submission — adds "save and go to next". */
  onNext?: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [baseline, setBaseline] = useState(() => initialForm(submission, assignment));
  const [form, setForm] = useState(baseline);
  const [showAiCodeReview, setShowAiCodeReview] = useState(false);
  // Optimistic AI flags until the refetch brings the server's version.
  const [overrides, setOverrides] = useState<Partial<SubmissionDTO>>({});
  useEffect(() => setOverrides({}), [submission]);
  const local = { ...submission, ...overrides };

  const dirty = !sameForm(form, baseline);
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  // Once the panel is gone, nothing of it is left unsaved.
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  // Closing or reloading the page would drop what she typed: the browser asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const setField = <K extends keyof GradeForm>(key: K, value: GradeForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const invalidateSubmissions = () => qc.invalidateQueries({ queryKey: ['submissions', assignment.id] });

  const saveMutation = useMutation({
    mutationFn: async (mode: SaveMode) => {
      await gradesApi.grade(local.id, {
        submissionScore: form.submissionScore ? Number(form.submissionScore) : undefined,
        contentScore: form.contentScore ? Number(form.contentScore) : undefined,
        feedback: form.feedback || undefined,
        checklist: form.checklist,
      });
      if (mode === 'approve') await submissionsApi.approveContent(local.id);
    },
    onSuccess: (_, mode) => {
      setBaseline(form);
      invalidateSubmissions();
      toast.success(mode === 'approve' ? 'הציון נשמר ואושר לתלמידה' : 'הציון נשמר בהצלחה');
      if (mode === 'next') onNext?.();
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'שמירת הציון נכשלה')),
  });
  const saving = (mode: SaveMode) => saveMutation.isPending && saveMutation.variables === mode;

  const restoreAiScoreMutation = useMutation({
    mutationFn: () => submissionsApi.restoreAiScore(local.id),
    onSuccess: () => {
      // The server now holds the AI score too, so it is not an unsaved change.
      const contentScore = local.aiScore?.toString() ?? '';
      setForm((prev) => ({ ...prev, contentScore }));
      setBaseline((prev) => ({ ...prev, contentScore }));
      invalidateSubmissions();
    },
  });

  const approveAiMutation = useMutation({
    mutationFn: () => submissionsApi.approveAi(local.id),
    onSuccess: () => {
      setOverrides((prev) => ({ ...prev, aiApproved: true }));
      invalidateSubmissions();
    },
  });

  // Only GitHub, ZIP and Word submissions can be reviewed — the backend says the same.
  // An assignment the teacher turned AI review off for gets no new reviews; a past result still shows.
  const aiReviewOff = assignment.aiReviewEnabled === false;
  const aiReviewable = !aiReviewOff && (Boolean(local.githubUrl) || /\.(zip|docx)$/i.test(local.fileName ?? ''));
  const ai = useAiAvailability();

  const rerunAiMutation = useMutation({
    mutationFn: () => submissionsApi.rerunAiReview(local.id),
    onSuccess: () => {
      setOverrides((prev) => ({ ...prev, aiStatus: 'pending', aiApproved: false }));
      invalidateSubmissions();
      toast.success('בדיקת ה-AI הופעלה מחדש — התוצאה תופיע בעוד דקה-שתיים');
    },
    onError: (err: any) => {
      if (err?.response?.status === 503) qc.invalidateQueries({ queryKey: AI_AVAILABILITY_QUERY_KEY });
      toast.error(getApiErrorMessage(err, 'לא ניתן להריץ את הבדיקה מחדש'));
    },
  });

  const allowExtraAiMutation = useMutation({
    mutationFn: () => submissionsApi.allowExtraAi(local.id),
    onSuccess: () => {
      setOverrides((prev) => ({ ...prev, aiExtraAllowed: true }));
      toast.success('התלמידה תוכל לבקש בדיקת AI נוספת');
    },
  });

  return (
    <div className="space-y-4">
      {(local.fileUrl || local.githubUrl) && (
        <div className="flex flex-wrap gap-2">
          {local.fileUrl && (
            <a href={apiFileUrl(local.fileUrl)} target="_blank" rel="noreferrer"
              className="flex items-center gap-2 text-sm text-clay border border-rule/20 rounded-input px-3 py-2 hover:bg-ground/60">
              <ExternalLink size={13} /> פתח קובץ שהוגש{local.fileName ? ` — ${local.fileName}` : ''}
            </a>
          )}
          {local.githubUrl && (
            <a href={local.githubUrl} target="_blank" rel="noreferrer"
              className="flex items-center gap-2 text-sm text-clay border border-rule/20 rounded-input px-3 py-2 hover:bg-ground/60">
              <Github size={13} /> פתח GitHub
            </a>
          )}
        </div>
      )}
      {local.notes && (
        <div className="bg-ground/60 border border-rule/20 rounded-input px-3 py-2 text-sm">
          <span className="font-medium text-xs text-ink/50">הערת תלמידה:</span>
          <MarkdownRenderer content={local.notes} className="text-sm" />
        </div>
      )}

      {local.aiStatus === 'done' && (
        <div className="rounded-input border border-indigo/20 bg-indigo/10 px-3 py-2 text-sm space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 font-medium text-indigo">
              <Bot size={14} /> בדיקת AI — ציון: {local.aiScore ?? '—'}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {local.aiApproved ? (
                <Badge variant="success"><CheckCircle size={10} className="ml-1" /> אושר לתלמידה</Badge>
              ) : (
                <Button
                  size="sm" variant="secondary"
                  loading={approveAiMutation.isPending}
                  onClick={() => approveAiMutation.mutate()}
                >
                  <CheckCircle size={12} /> אשרי ציון AI לתלמידה
                </Button>
              )}
              <Button
                size="sm" variant="outline"
                loading={restoreAiScoreMutation.isPending}
                onClick={() => restoreAiScoreMutation.mutate()}
                disabled={local.aiScore == null}
              >
                <RotateCcw size={12} /> החזירי לציון AI
              </Button>
              {aiReviewOff ? null : local.aiExtraAllowed ? (
                <Badge variant="success"><Sparkles size={10} className="ml-1" /> בדיקה נוספת אושרה</Badge>
              ) : (
                <Button
                  size="sm" variant="outline"
                  loading={allowExtraAiMutation.isPending}
                  onClick={() => allowExtraAiMutation.mutate()}
                >
                  <Sparkles size={12} /> אפשרי בדיקת AI נוספת
                </Button>
              )}
            </div>
          </div>
          {local.aiVerbalReview && (
            <p className="text-xs text-ink/70 whitespace-pre-wrap">{local.aiVerbalReview}</p>
          )}
          {local.aiCodeReview && (
            <div className="pt-1">
              <button className="text-xs text-indigo underline" onClick={() => setShowAiCodeReview((v) => !v)}>
                {showAiCodeReview ? 'הסתירי הערות קוד' : 'הצגי הערות קוד'}
              </button>
              {showAiCodeReview && (
                <pre className="mt-1 text-xs bg-ground/60 rounded p-2 whitespace-pre-wrap">{local.aiCodeReview}</pre>
              )}
            </div>
          )}
        </div>
      )}

      {aiReviewable && (
        <div className="flex items-center justify-between gap-2 text-xs text-ink/60">
          <span>
            {local.aiStatus === 'pending' ? 'בדיקת AI מתבצעת כעת...'
              : local.aiStatus === 'error' ? `בדיקת ה-AI נכשלה${local.aiError ? `: ${local.aiError}` : '.'}`
              : local.aiStatus === 'done' ? 'אפשר להריץ שוב (למשל אחרי שינוי הנחיות ה-AI) — לא נספר במכסת התלמידה.'
              : 'עוד לא בוצעה בדיקת AI להגשה זו.'}
            {!ai.available && local.aiStatus !== 'pending' && <span className="block text-coral">{ai.message}</span>}
          </span>
          <Button
            size="sm" variant="outline"
            loading={rerunAiMutation.isPending}
            disabled={local.aiStatus === 'pending' || !ai.available}
            onClick={() => rerunAiMutation.mutate()}
          >
            <RefreshCw size={12} /> {local.aiStatus === 'done' ? 'הרצת בדיקת AI מחדש' : 'הרצת בדיקת AI'}
          </Button>
        </div>
      )}

      {form.checklist.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">רשימת בדיקה</p>
          {form.checklist.map((item) => (
            <label key={item.id} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={item.checked}
                onChange={(e) => setField('checklist',
                  form.checklist.map((c) => c.id === item.id ? { ...c, checked: e.target.checked } : c))}
                className="accent-ink"
              />
              {item.text}
            </label>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Input label="ציון הגשה (0–100)" type="number" min={0} max={100} value={form.submissionScore} onChange={(e) => setField('submissionScore', e.target.value)} placeholder="85" />
          {local.grade?.submissionScore == null && (
            <p className="text-xs text-ink/50 mt-1">הצעה אוטומטית: 100 − איחור (10) − דרישות חסרות (5 כ״א)</p>
          )}
        </div>

        <div>
          <Input label="ציון תוכן (0–100)" type="number" min={0} max={100} value={form.contentScore} onChange={(e) => setField('contentScore', e.target.value)} placeholder="90" />
          {local.grade?.contentApproved ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-sage"><CheckCircle size={11} /> מאושר וגלוי לתלמידה</p>
          ) : (
            <p className="mt-1 text-xs text-ink/50">הציון מוסתר מהתלמידה עד שיאושר</p>
          )}
        </div>
      </div>

      <MarkdownField
        id={`grade-feedback-${local.id}`}
        label="משוב"
        value={form.feedback}
        onChange={(feedback) => setField('feedback', feedback)}
        rows={4}
        placeholder="כתבי משוב מפורט..."
      />

      <div className="flex flex-wrap items-center gap-2 border-t border-rule/20 pt-3">
        <Button
          variant="outline"
          loading={saving('save')}
          disabled={saveMutation.isPending}
          onClick={() => saveMutation.mutate('save')}
        >
          שמור ציון
        </Button>
        <Button
          variant={onNext ? 'outline' : 'default'}
          loading={saving('approve')}
          disabled={saveMutation.isPending || !form.contentScore}
          onClick={() => saveMutation.mutate('approve')}
        >
          <CheckCircle size={14} /> שמרי ואשרי לתלמידה
        </Button>
        {dirty && <span className="text-xs text-clay" role="status">יש שינויים שלא נשמרו</span>}
        {onNext && (
          <Button
            className="ms-auto"
            loading={saving('next')}
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate('next')}
          >
            שמרי ועברי לבאה <ChevronLeft size={14} />
          </Button>
        )}
      </div>
    </div>
  );
}
