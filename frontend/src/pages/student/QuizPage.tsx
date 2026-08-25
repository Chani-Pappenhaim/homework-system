import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { quizzesApi } from '@/api/quizzes.api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { cn } from '@/lib/utils';
import { unwrap } from '@/lib/api-utils';
import type { QuizAttemptResultDTO } from '@/types';

export default function QuizPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const navigate = useNavigate();
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<QuizAttemptResultDTO | null>(null);

  // Reading this page never starts an AI generation any more — the teacher owns
  // that. So there is nothing to poll for and nothing to wait out: the server's
  // answer is final the first time.
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['quiz', lessonId],
    queryFn: () => quizzesApi.get(lessonId!),
  });

  const quizData = unwrap(data);
  // A request that failed has no status. Defaulting it to a "wait" state is what
  // once turned every server error into an endless spinner — treat it as an error.
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
    mutationFn: () => quizzesApi.attempt(lessonId!, answers),
    onSuccess: (res) => {
      setResult(res.data.data);
    },
  });

  if (isLoading) return <div className="p-6 font-sans text-ink/50">טוען…</div>;

  // Every "no quiz to show" case renders the same card; only the wording and
  // whether retrying can help differ.
  const notice = (title: string, body: string, retry: boolean) => (
    <div className="py-16 text-center" dir="rtl">
      <div className="mx-auto max-w-md rounded-card border border-rule bg-sheet p-6 shadow-sheet">
        <p className="font-display text-xl font-bold text-ink">{title}</p>
        <p className="mt-2 font-sans text-sm text-ink/60">{body}</p>
        <div className="mt-4 flex justify-center gap-2">
          {retry && (
            <button
              onClick={() => refetch()}
              className="lift rounded-input border border-rule bg-butter/40 px-4 py-2 font-semibold text-clay shadow-soft"
            >
              נסי שוב
            </button>
          )}
          <button
            onClick={() => navigate(`/student/lessons/${lessonId}`)}
            className="lift rounded-input border border-rule px-4 py-2 font-semibold text-ink/70 shadow-soft"
          >
            חזרה לשיעור
          </button>
        </div>
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
            <div>
              <Badge variant={result.score >= 80 ? 'success' : result.score >= 60 ? 'warning' : 'destructive'}>
                {result.score >= 80 ? 'מצוין!' : result.score >= 60 ? 'טוב' : 'נסי שוב'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Per-question review. It reads the review the server sent back with the
            result — the quiz itself never carries the correct answers to a
            student, so before submitting there is nothing here to give away. */}
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
      <PageHeader
        title="חידון השיעור"
        meta="שיעור · חידון"
        back={`/student/lessons/${lessonId}`}
        backLabel="חזרה לשיעור"
        actions={<Badge variant="secondary">{quiz?.questions.length} שאלות</Badge>}
      />

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

      <Button
        variant="clay"
        className="w-full"
        size="lg"
        loading={attemptMutation.isPending}
        onClick={() => attemptMutation.mutate()}
        // Checked against the question count, not just against `answers`:
        // `answers` starts empty and is filled by an effect, and `[].some(...)`
        // is false — so on the first frame the button was briefly enabled and a
        // fast click posted an empty array, which the server rejects with a 400.
        disabled={
          answers.length !== (quiz?.questions.length ?? 0) || answers.some((a) => a === -1)
        }
      >
        הגש חידון
      </Button>
    </div>
  );
}
