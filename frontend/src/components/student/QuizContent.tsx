import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { quizzesApi } from '@/api/quizzes.api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn, formatDateTime } from '@/lib/utils';
import { unwrap } from '@/lib/api-utils';
import { getApiErrorMessage } from '@/lib/errors';
import useAuthStore from '@/store/authStore';
import type { QuizAttemptResultDTO } from '@/types';

export default function QuizContent({ lessonId }: { lessonId: string }) {
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<QuizAttemptResultDTO | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Submitting is student-only. A teacher still reaches this tab and is shown the
  // quiz even as a draft, so say so rather than letting her answer into a 403.
  const isTeacher = useAuthStore((s) => s.user?.role) === 'ADMIN';

  // Loading a quiz never triggers generation; the server's answer is final on the first fetch, so there is nothing to poll.
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['quiz', lessonId],
    queryFn: () => quizzesApi.get(lessonId),
  });

  const quizData = unwrap(data);
  // A failed request has no status field, so a failure must be treated as an error rather than defaulting to a wait state.
  const status: 'ready' | 'unavailable' | 'error' =
    quizData?.status === 'ready' ? 'ready'
      : quizData?.status === 'unavailable' ? 'unavailable'
        : (isError || data) ? 'error' : 'unavailable';
  const quiz = quizData?.quiz;

  useEffect(() => {
    if (quiz?.questions) {
      setAnswers(new Array(quiz.questions.length).fill(-1));
    }
  }, [quiz?.questions?.length]);

  const attemptMutation = useMutation({
    mutationFn: () => quizzesApi.attempt(lessonId, answers),
    onMutate: () => setSubmitError(null),
    onSuccess: (res) => {
      setResult(res.data.data);
      refetchHistory();
    },
    // A rejected attempt must say so; without this the button just stopped spinning.
    onError: (e: any) => setSubmitError(getApiErrorMessage(e, 'שגיאה בהגשת החידון')),
  });

  // Own attempt history — fetched once results exist, so a fresh visit doesn't pay for it.
  const { data: historyData, refetch: refetchHistory } = useQuery({
    queryKey: ['quiz-attempts', lessonId],
    queryFn: () => quizzesApi.myAttempts(lessonId),
    enabled: !!result,
  });
  const attemptHistory = unwrap(historyData)?.attempts ?? [];

  const handleRetry = () => {
    setResult(null);
    setSubmitError(null);
    setAnswers(new Array(quiz?.questions.length ?? 0).fill(-1));
  };

  if (isLoading) return <div className="p-6 font-sans text-ink/50">טוען…</div>;

  // Every "no quiz to show" case renders the same card; only the wording and
  // whether retrying can help differ.
  const notice = (title: string, body: string, retry: boolean) => (
    <div className="py-16 text-center" dir="rtl">
      <div className="mx-auto max-w-md rounded-card border border-rule bg-sheet p-6 shadow-sheet">
        <p className="font-display text-xl font-bold text-ink">{title}</p>
        <p className="mt-2 font-sans text-sm text-ink/60">{body}</p>
        {retry && (
          <div className="mt-4 flex justify-center">
            <button
              onClick={() => refetch()}
              className="lift rounded-input border border-rule bg-butter/40 px-4 py-2 font-semibold text-clay shadow-soft"
            >
              נסי שוב
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // Either the teacher has not created the quiz yet or she has not published it.
  // Both look the same from here on purpose — a draft stays her business.
  if (status === 'unavailable') {
    return notice(
      'החידון עדיין לא זמין',
      quizData?.message ?? 'החידון לשיעור הזה עדיין לא פורסם. נסי שוב מאוחר יותר.',
      false,
    );
  }

  if (status === 'error') {
    return notice('לא הצלחנו לטעון את החידון', 'אירעה שגיאה בשרת. אפשר לנסות שוב.', true);
  }

  if (result) {
    return (
      <div className="space-y-5" dir="rtl">
        <Card accent="indigo" className="mx-auto max-w-lg">
          <CardContent className="space-y-3 text-center">
            <span className="mx-auto grid size-24 place-items-center rounded-full bg-butter/25 font-display text-4xl font-bold tabular text-clay">
              {Math.round(result.score)}%
            </span>
            <p className="font-sans text-sm text-ink/70">{result.correct} מתוך {result.total} תשובות נכונות</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Badge variant={result.score >= 80 ? 'success' : result.score >= 60 ? 'warning' : 'destructive'}>
                {result.score >= 80 ? 'מצוין!' : result.score >= 60 ? 'טוב' : 'נסי שוב'}
              </Badge>
              <Badge variant={result.isOfficial ? 'secondary' : 'warning'}>
                {result.isOfficial ? 'זהו הניסיון הרשמי — הציון נשמר' : 'ניסיון תרגול — לא משפיע על הציון'}
              </Badge>
            </div>
            {!result.isOfficial && (
              <p className="font-sans text-xs text-ink/50">
                הציון הרשמי שלך נקבע כבר בניסיון הראשון ולא ישתנה. ניסיון זה הוא לתרגול אישי בלבד.
              </p>
            )}
            <div className="flex justify-center pt-1">
              <button
                onClick={handleRetry}
                className="lift rounded-input border border-rule bg-butter/40 px-4 py-2 text-sm font-semibold text-clay shadow-soft"
              >
                נסי שוב (תרגול)
              </button>
            </div>
          </CardContent>
        </Card>

        {attemptHistory.length > 1 && (
          <Card className="mx-auto max-w-lg">
            <CardContent className="space-y-2">
              <p className="font-display text-sm font-bold text-ink">הניסיונות שלך</p>
              <div className="space-y-1.5">
                {attemptHistory.map((a) => (
                  <div
                    key={a.attemptNumber}
                    className="flex items-center justify-between rounded-input border border-rule bg-ground/50 px-3 py-1.5 text-sm"
                  >
                    <span className="text-ink/70">ניסיון {a.attemptNumber} · {formatDateTime(a.takenAt)}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-semibold tabular text-ink">{Math.round(a.score)}%</span>
                      {a.isOfficial && <Badge variant="secondary">רשמי</Badge>}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Per-question review, built from the result payload — correct answers are never sent to the client before submission. */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {result.review.map((q, i) => (
            <Card key={q.id} accent={q.isCorrect ? 'sage' : 'coral'}>
              <CardContent className="space-y-2">
                <div className="flex items-start gap-2">
                  <span
                    className={cn(
                      'mt-px grid size-5 shrink-0 place-items-center rounded-full text-xs font-bold text-sheet',
                      q.isCorrect ? 'bg-sage' : 'bg-coral',
                    )}
                    aria-hidden
                  >
                    {q.isCorrect ? '✓' : '✗'}
                  </span>
                  <p className="text-sm font-bold text-ink">
                    {i + 1}. {q.question}
                    <span className="sr-only">{q.isCorrect ? ' — ענית נכון' : ' — ענית לא נכון'}</span>
                  </p>
                </div>

                {q.options.map((opt, j) => {
                  const isCorrect = q.correctIndex === j;
                  const isSelected = q.selectedIndex === j;
                  return (
                    <div
                      key={j}
                      className={cn(
                        'flex items-start gap-2 rounded-input border px-3 py-2 text-sm',
                        isCorrect
                          ? 'border-sage bg-sage/15 text-sage'
                          : isSelected
                            ? 'border-coral bg-coral/12 text-coral'
                            : 'border-rule bg-ground/50 text-ink/70',
                      )}
                    >
                      <span className="font-sans shrink-0" aria-hidden>
                        {isCorrect ? '✓' : isSelected ? '✗' : '○'}
                      </span>
                      <span className="min-w-0 flex-1">{opt}</span>
                      {/* Spell out what the colours mean — a wrong answer is only
                          useful if she can tell which line was hers. */}
                      {isCorrect && (
                        <span className="shrink-0 text-[11px] font-semibold">
                          {isSelected ? 'התשובה שלך — נכונה' : 'התשובה הנכונה'}
                        </span>
                      )}
                      {isSelected && !isCorrect && (
                        <span className="shrink-0 text-[11px] font-semibold">התשובה שלך</span>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-base font-bold">חידון השיעור</h2>
        <Badge variant="secondary">{quiz?.questions.length} שאלות</Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {quiz?.questions.map((q, i) => (
          <Card key={q.id}>
            <CardContent className="space-y-3">
              <p className="text-sm font-bold text-ink">{i + 1}. {q.question}</p>
              {q.options.map((opt, j) => (
                <label
                  key={j}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-input border px-3 py-2 transition-colors',
                    answers[i] === j ? 'border-clay bg-butter/25 text-ink' : 'border-rule text-ink/70 hover:border-clay/40',
                  )}
                >
                  <input
                    type="radio"
                    name={`q-${i}`}
                    checked={answers[i] === j}
                    onChange={() => setAnswers((prev) => { const n = [...prev]; n[i] = j; return n; })}
                    className="accent-ink"
                  />
                  <span className="text-sm">{opt}</span>
                </label>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {isTeacher && (
        <p className="rounded-card border border-rule bg-butter/40 p-3 text-center font-sans text-sm text-clay">
          זוהי תצוגה מקדימה של החידון כפי שהתלמידה רואה אותו. הגשה אפשרית מחשבון תלמידה בלבד.
        </p>
      )}

      {submitError && <p className="text-center text-sm text-coral">{submitError}</p>}

      <Button
        variant="clay"
        className="w-full"
        size="lg"
        loading={attemptMutation.isPending}
        onClick={() => attemptMutation.mutate()}
        // Requires the full answer count, not just a non-empty check, since answers are populated asynchronously after mount.
        disabled={
          isTeacher
          || answers.length !== (quiz?.questions.length ?? 0)
          || answers.some((a) => a === -1)
        }
      >
        הגש חידון
      </Button>
    </div>
  );
}
