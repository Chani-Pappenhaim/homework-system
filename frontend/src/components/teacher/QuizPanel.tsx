import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Eye, EyeOff, Save, RotateCcw, AlertTriangle } from 'lucide-react';
import { quizzesApi } from '@/api/quizzes.api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AutoTextarea } from '@/components/ui/auto-textarea';
import { useToast } from '@/components/ui/toast';
import { getApiErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import type { QuizQuestionDTO, QuizStateDTO } from '@/types';

/**
 * Teacher-facing quiz editor: generate questions with AI, review and correct
 * them, then publish to the class. Students never trigger generation and
 * never see a draft.
 */
export default function QuizPanel({ lessonId, hasContent }: { lessonId: string; hasContent: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();

  const [draft, setDraft] = useState<QuizQuestionDTO[] | null>(null);
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['quiz', lessonId],
    queryFn: () => quizzesApi.get(lessonId),
    // Only poll while the AI is actually working.
    refetchInterval: (query) =>
      (query.state.data?.data as any)?.data?.status === 'generating' ? 5000 : false,
  });

  const state = (data?.data as any)?.data as QuizStateDTO | undefined;
  const quiz = state?.quiz;

  // Load the server's questions into the editor, without overwriting local edits in progress.
  useEffect(() => {
    if (quiz && draft === null) setDraft(quiz.questions);
  }, [quiz, draft]);

  const generateMutation = useMutation({
    mutationFn: () => quizzesApi.generate(lessonId),
    onSuccess: () => {
      setError('');
      qc.invalidateQueries({ queryKey: ['quiz', lessonId] });
    },
    onError: (e: any) => setError(getApiErrorMessage(e, 'לא הצלחנו להתחיל את יצירת הבוחן')),
  });

  const saveMutation = useMutation({
    mutationFn: () => quizzesApi.updateQuestions(lessonId, draft ?? []),
    onSuccess: () => {
      setError('');
      toast.success('השאלות נשמרו');
      qc.invalidateQueries({ queryKey: ['quiz', lessonId] });
      qc.invalidateQueries({ queryKey: ['quiz-results', lessonId] });
    },
    onError: (e: any) => setError(getApiErrorMessage(e, 'שמירת השאלות נכשלה')),
  });

  const publishMutation = useMutation({
    mutationFn: (published: boolean) => quizzesApi.setPublished(lessonId, published),
    onSuccess: (_res, published) => {
      setError('');
      toast.success(published ? 'הבוחן פורסם לתלמידות' : 'הבוחן הוחזר לטיוטה');
      qc.invalidateQueries({ queryKey: ['quiz', lessonId] });
      qc.invalidateQueries({ queryKey: ['lesson', lessonId] });
    },
    onError: (e: any) => setError(getApiErrorMessage(e, 'שינוי הפרסום נכשל')),
  });

  function editQuestion(i: number, patch: Partial<QuizQuestionDTO>) {
    setDraft((prev) => prev && prev.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  }

  function editOption(qi: number, oi: number, value: string) {
    setDraft((prev) =>
      prev && prev.map((q, idx) =>
        idx === qi ? { ...q, options: q.options.map((o, j) => (j === oi ? value : o)) } : q,
      ),
    );
  }

  const dirty = Boolean(draft && quiz && JSON.stringify(draft) !== JSON.stringify(quiz.questions));

  const header = (
    <CardHeader className="flex flex-row items-center justify-between gap-2">
      <h2 className="font-display text-base font-bold flex items-center gap-1.5">
        <Sparkles size={15} className="text-indigo" /> חידון השיעור
      </h2>
      {quiz && (
        <Badge variant={quiz.published ? 'success' : 'secondary'}>
          {quiz.published ? 'פורסם לתלמידות' : 'טיוטה — התלמידות לא רואות'}
        </Badge>
      )}
    </CardHeader>
  );

  const errorLine = error && (
    <p className="flex items-start gap-1.5 text-xs text-coral">
      <AlertTriangle size={13} className="mt-px shrink-0" /> {error}
    </p>
  );

  if (isLoading) {
    return <Card accent="indigo">{header}<CardContent><p className="text-sm text-ink/50">טוען…</p></CardContent></Card>;
  }

  // No content to generate from, or the server refused for another reason.
  if (state?.status === 'unavailable') {
    return (
      <Card accent="indigo">
        {header}
        <CardContent className="space-y-2">
          <p className="text-sm text-ink/60">{state.message}</p>
        </CardContent>
      </Card>
    );
  }

  if (state?.status === 'generating') {
    return (
      <Card accent="indigo">
        {header}
        <CardContent className="flex items-center gap-3">
          <div className="size-5 animate-spin rounded-full border-2 border-rule border-t-clay" />
          <p className="text-sm text-ink/70">ה-AI כותב שאלות על תוכן השיעור…</p>
        </CardContent>
      </Card>
    );
  }

  // Nothing generated yet (or the last attempt failed) — offer to create one.
  if (state?.status === 'none' || state?.status === 'failed') {
    return (
      <Card accent="indigo">
        {header}
        <CardContent className="space-y-3">
          {state.status === 'failed'
            ? <p className="text-sm text-coral">{state.message}</p>
            : <p className="text-sm text-ink/60">
                ה-AI יכתוב 10 שאלות אמריקאיות על תוכן השיעור. תוכלי לערוך אותן לפני שהתלמידות רואות אותן.
              </p>}
          {errorLine}
          <Button
            variant="clay"
            loading={generateMutation.isPending}
            disabled={!hasContent}
            onClick={() => generateMutation.mutate()}
          >
            <Sparkles size={14} /> {state.status === 'failed' ? 'נסי שוב' : 'צרי בוחן בעזרת AI'}
          </Button>
          {!hasContent && (
            <p className="text-xs text-ink/50">יש להוסיף תוכן שיעור לפני יצירת בוחן.</p>
          )}
        </CardContent>
      </Card>
    );
  }

  if (!quiz || !draft) return null;

  return (
    <Card accent="indigo">
      {header}
      <CardContent className="space-y-4">
        <p className="text-xs text-ink/50">
          {quiz.published
            ? 'הבוחן גלוי לתלמידות. עריכה תמחק את כל התשובות שכבר נענו.'
            : 'עברי על השאלות, תקני מה שצריך, ואז פרסמי. עד לפרסום התלמידות לא רואות דבר.'}
        </p>

        {errorLine}

        <div className="space-y-4">
          {draft.map((q, qi) => (
            <div key={q.id} className="rounded-card border border-rule/60 bg-ground/30 p-3">
              <div className="mb-2 flex items-start gap-2">
                <span className="mt-2 font-display text-sm font-bold text-ink/40 tabular">{qi + 1}</span>
                <AutoTextarea
                  value={q.question}
                  onChange={(e) => editQuestion(qi, { question: e.target.value })}
                  className="flex-1"
                  aria-label={`שאלה ${qi + 1}`}
                />
              </div>

              <div className="space-y-1.5 pr-6">
                {q.options.map((opt, oi) => (
                  // Align to items-start so a multi-line option doesn't push its radio button off-center.
                  <label
                    key={oi}
                    className={cn(
                      'flex items-start gap-2 rounded-input border px-2 py-1.5 transition-colors',
                      q.correctIndex === oi ? 'border-sage bg-sage/10' : 'border-rule/60 bg-sheet',
                    )}
                  >
                    <input
                      type="radio"
                      name={`correct-${q.id}`}
                      checked={q.correctIndex === oi}
                      onChange={() => editQuestion(qi, { correctIndex: oi })}
                      className="mt-2 shrink-0 accent-sage"
                      aria-label={`סמני כתשובה נכונה לשאלה ${qi + 1}, אפשרות ${oi + 1}`}
                    />
                    <AutoTextarea
                      value={opt}
                      onChange={(e) => editOption(qi, oi, e.target.value)}
                      className="min-w-0 flex-1 border-0 bg-transparent px-1 py-1 shadow-none focus-visible:ring-0"
                      aria-label={`אפשרות ${oi + 1} לשאלה ${qi + 1}`}
                    />
                  </label>
                ))}
              </div>
              <p className="mt-1.5 pr-6 text-[11px] text-ink/40">סמני בעיגול את התשובה הנכונה</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-rule/40 pt-3">
          <Button
            variant="default"
            loading={saveMutation.isPending}
            disabled={!dirty}
            onClick={() => saveMutation.mutate()}
          >
            <Save size={14} /> שמרי שינויים
          </Button>

          {dirty && (
            <Button variant="ghost" onClick={() => { setDraft(quiz.questions); setError(''); }}>
              <RotateCcw size={14} /> בטלי שינויים
            </Button>
          )}

          <div className="flex-1" />

          <Button
            variant={quiz.published ? 'outline' : 'clay'}
            loading={publishMutation.isPending}
            // Require saving unsaved edits first, so publishing always reflects the saved version.
            disabled={dirty}
            onClick={() => publishMutation.mutate(!quiz.published)}
            title={dirty ? 'יש לשמור את השינויים לפני פרסום' : undefined}
          >
            {quiz.published ? <><EyeOff size={14} /> החזירי לטיוטה</> : <><Eye size={14} /> פרסמי לתלמידות</>}
          </Button>
        </div>

        {dirty && (
          <p className="text-xs text-ink/50">יש שינויים שלא נשמרו. שמרי אותם כדי לאפשר פרסום.</p>
        )}
      </CardContent>
    </Card>
  );
}
