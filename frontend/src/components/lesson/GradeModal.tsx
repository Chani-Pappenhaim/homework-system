import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Github, Bot, RotateCcw, CheckCircle, Sparkles } from 'lucide-react';
import { gradesApi } from '@/api/grades.api';
import { submissionsApi } from '@/api/submissions.api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import type { AssignmentDTO, ChecklistResult, SubmissionDTO } from '@/types';

export function GradeModal({ submission, assignment, onClose }: {
  submission: SubmissionDTO | null;
  assignment: AssignmentDTO | undefined;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [local, setLocal] = useState<SubmissionDTO | null>(submission);
  const [submissionScore, setSubmissionScore] = useState('');
  const [contentScore, setContentScore] = useState('');
  const [feedback, setFeedback] = useState('');
  const [checklist, setChecklist] = useState<ChecklistResult[]>([]);
  const [showAiCodeReview, setShowAiCodeReview] = useState(false);

  // Resets form state whenever a different submission is opened.
  useEffect(() => {
    setLocal(submission);
    if (!submission) return;
    setShowAiCodeReview(false);
    const nextChecklist = assignment?.requirements?.map((r) => ({
      id: r.id, text: r.text,
      checked: submission.grade?.checklist?.find((c) => c.id === r.id)?.checked ?? false,
    })) ?? [];
    setChecklist(nextChecklist);
    if (submission.grade?.submissionScore != null) {
      // Don't overwrite an already-set submission score.
      setSubmissionScore(submission.grade.submissionScore.toString());
    } else {
      // Default suggestion: 100, minus 10 for a late submission, minus 5 per unchecked requirement.
      const unchecked = nextChecklist.filter((c) => !c.checked).length;
      const suggested = Math.max(0, 100 - (submission.isLate ? 10 : 0) - unchecked * 5);
      setSubmissionScore(String(suggested));
    }
    setContentScore(submission.grade?.contentScore != null ? submission.grade.contentScore.toString() : '');
    setFeedback(submission.grade?.feedback ?? '');
  }, [submission, assignment]);

  const invalidateSubmissions = () => qc.invalidateQueries({ queryKey: ['submissions', assignment?.id] });

  const gradePayload = () => ({
    submissionScore: submissionScore ? Number(submissionScore) : undefined,
    contentScore: contentScore ? Number(contentScore) : undefined,
    feedback: feedback || undefined,
    checklist,
  });

  const gradeMutation = useMutation({
    mutationFn: () => gradesApi.grade(local!.id, gradePayload()),
    onSuccess: () => {
      invalidateSubmissions();
      onClose();
      toast.success('הציון נשמר בהצלחה');
    },
  });

  const gradeAndApproveMutation = useMutation({
    mutationFn: async () => {
      await gradesApi.grade(local!.id, gradePayload());
      await submissionsApi.approveContent(local!.id);
    },
    onSuccess: () => {
      invalidateSubmissions();
      onClose();
      toast.success('הציון נשמר ואושר לתלמידה');
    },
  });

  const restoreAiScoreMutation = useMutation({
    mutationFn: () => submissionsApi.restoreAiScore(local!.id),
    onSuccess: () => {
      setContentScore(local?.aiScore?.toString() ?? '');
      invalidateSubmissions();
    },
  });

  const approveAiMutation = useMutation({
    mutationFn: () => submissionsApi.approveAi(local!.id),
    onSuccess: () => {
      setLocal((prev) => prev ? { ...prev, aiApproved: true } : prev);
      invalidateSubmissions();
    },
  });

  const allowExtraAiMutation = useMutation({
    mutationFn: () => submissionsApi.allowExtraAi(local!.id),
    onSuccess: () => {
      setLocal((prev) => prev ? { ...prev, aiExtraAllowed: true } : prev);
      toast.success('התלמידה תוכל לבקש בדיקת AI נוספת');
    },
  });

  return (
    <Dialog open={Boolean(local)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{`ציון — ${local?.studentName}`}</DialogTitle>
        </DialogHeader>
        {local && (
          <DialogBody className="space-y-4">
            {local.fileUrl && (
              <a href={local.fileUrl} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 text-sm text-clay border border-rule/20 rounded-input px-3 py-2 hover:bg-ground/60">
                <ExternalLink size={13} /> פתח קובץ שהוגש
              </a>
            )}
            {local.githubUrl && (
              <a href={local.githubUrl} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 text-sm text-clay border border-rule/20 rounded-input px-3 py-2 hover:bg-ground/60">
                <Github size={13} /> פתח GitHub
              </a>
            )}
            {local.notes && (
              <div className="bg-ground/60 border border-rule/20 rounded-input px-3 py-2 text-sm">
                <span className="font-medium text-xs text-ink/50">הערת תלמידה: </span>
                {local.notes}
              </div>
            )}

            {local.aiStatus === 'done' && (
              <div className="rounded-input border border-indigo/20 bg-indigo/10 px-3 py-2 text-sm space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-1.5 font-medium text-indigo">
                    <Bot size={14} /> בדיקת AI — ציון: {local.aiScore ?? '—'}
                  </p>
                  <div className="flex items-center gap-2">
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
                    {local.aiExtraAllowed ? (
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

            {checklist.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">רשימת בדיקה</p>
                {checklist.map((item) => (
                  <label key={item.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={(e) => setChecklist((prev) =>
                        prev.map((c) => c.id === item.id ? { ...c, checked: e.target.checked } : c)
                      )}
                      className="accent-ink"
                    />
                    {item.text}
                  </label>
                ))}
              </div>
            )}

            <div>
              <Input label="ציון הגשה (0–100)" type="number" min={0} max={100} value={submissionScore} onChange={(e) => setSubmissionScore(e.target.value)} placeholder="85" />
              {local.grade?.submissionScore == null && (
                <p className="text-xs text-ink/50 mt-1">הצעה אוטומטית: 100 − איחור (10) − דרישות חסרות (5 כ״א)</p>
              )}
            </div>

            <div>
              <Input label="ציון תוכן (0–100)" type="number" min={0} max={100} value={contentScore} onChange={(e) => setContentScore(e.target.value)} placeholder="90" />
              {local.grade?.contentApproved ? (
                <p className="mt-1 flex items-center gap-1 text-xs text-sage"><CheckCircle size={11} /> מאושר וגלוי לתלמידה</p>
              ) : (
                <p className="mt-1 text-xs text-ink/50">הציון מוסתר מהתלמידה עד שיאושר</p>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="grade-feedback">משוב (Markdown)</Label>
              <Textarea
                id="grade-feedback"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={4}
                className="resize-none"
                placeholder="כתבי משוב מפורט..."
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                loading={gradeMutation.isPending}
                onClick={() => gradeMutation.mutate()}
                className="flex-1"
              >
                שמור ציון
              </Button>
              <Button
                loading={gradeAndApproveMutation.isPending}
                onClick={() => gradeAndApproveMutation.mutate()}
                disabled={!contentScore}
                className="flex-1"
              >
                <CheckCircle size={14} /> שמרי ואשרי לתלמידה
              </Button>
            </div>
          </DialogBody>
        )}
      </DialogContent>
    </Dialog>
  );
}
