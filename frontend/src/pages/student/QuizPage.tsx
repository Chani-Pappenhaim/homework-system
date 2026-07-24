import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { quizzesApi } from '@/api/quizzes.api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { cn } from '@/lib/utils';

export default function QuizPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<{ score: number; correct: number; total: number } | null>(null);

  const [timedOut, setTimedOut] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['quiz', lessonId],
    queryFn: () => quizzesApi.get(lessonId!),
    refetchInterval: (query) => {
      const status = (query.state.data?.data as any)?.data?.status;
      // Stop polling once ready, or after we've given up (see the timeout below).
      return status === 'generating' && !timedOut ? 3000 : false;
    },
  });

  const quizData = (data?.data as any)?.data;
  const status: 'generating' | 'ready' = quizData?.status ?? 'generating';
  const quiz = quizData?.quiz;

  // Don't spin forever: if generation hasn't finished within 90s (e.g. the AI
  // provider isn't reachable), stop and let the student retry.
  useEffect(() => {
    if (status !== 'generating') { setTimedOut(false); return; }
    const t = setTimeout(() => setTimedOut(true), 90_000);
    return () => clearTimeout(t);
  }, [status]);

  useEffect(() => {
    if (quiz?.questions) {
      setAnswers(new Array(quiz.questions.length).fill(-1));
    }
  }, [quiz?.questions?.length]);

  const attemptMutation = useMutation({
    mutationFn: () => quizzesApi.attempt(lessonId!, answers),
    onSuccess: (res) => {
      setResult((res.data as any).data);
    },
  });

  if (isLoading) return <div className="p-6 font-mono text-ink/50">טוען…</div>;

  if (status === 'generating' && timedOut) {
    return (
      <div className="mx-auto max-w-md py-16 text-center" dir="rtl">
        <div className="border-2 border-ink bg-paper p-6 shadow-brutal">
          <p className="font-display text-xl font-black text-ink">יצירת החידון נמשכת יותר מדי</p>
          <p className="mt-2 font-mono text-xs text-ink/60">
            ייתכן שיש תקלה זמנית ביצירת השאלות. אפשר לנסות שוב.
          </p>
          <button
            onClick={() => { setTimedOut(false); refetch(); }}
            className="mt-4 border-2 border-ink bg-mustard px-4 py-2 font-bold text-ink shadow-brutal-sm hover-lift"
          >
            נסי שוב
          </button>
        </div>
      </div>
    );
  }

  if (status === 'generating') {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20" dir="rtl">
        <div className="size-10 animate-spin border-2 border-ink border-t-transparent" />
        <p className="text-sm font-bold text-ink">החידון נוצר, אנא המתיני…</p>
        <p className="font-mono text-xs text-ink/50">ה-AI מכין שאלות בעברית על תוכן השיעור</p>
      </div>
    );
  }

  if (result) {
    return (
      <div className="mx-auto max-w-lg space-y-5" dir="rtl">
        <Card accent="cobalt">
          <CardContent className="space-y-3 text-center">
            <span className="pen-circle mx-auto inline-flex font-display text-5xl font-black tabular text-tomato">
              {Math.round(result.score)}%
            </span>
            <p className="font-mono text-sm text-ink/70">{result.correct} מתוך {result.total} תשובות נכונות</p>
            <div>
              <Badge variant={result.score >= 80 ? 'success' : result.score >= 60 ? 'warning' : 'destructive'}>
                {result.score >= 80 ? 'מצוין!' : result.score >= 60 ? 'טוב' : 'נסי שוב'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {quiz?.questions.map((q: any, i: number) => (
          <Card key={q.id}>
            <CardContent className="space-y-2">
              <p className="text-sm font-bold text-ink">{i + 1}. {q.question}</p>
              {q.options.map((opt: string, j: number) => {
                const isCorrect = q.correctIndex === j;
                const isSelected = answers[i] === j;
                return (
                  <div
                    key={j}
                    className={cn(
                      'flex items-center gap-2 border-2 px-3 py-2 text-sm',
                      isCorrect
                        ? 'border-forest bg-forest/20 text-forest'
                        : isSelected
                          ? 'border-tomato bg-tomato/15 text-tomato'
                          : 'border-ink/15 bg-cream/50 text-ink/70',
                    )}
                  >
                    <span className="font-mono">{isCorrect ? '✓' : isSelected ? '✗' : '○'}</span>
                    {opt}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-5" dir="rtl">
      <PageHeader
        title="חידון השיעור"
        meta="שיעור · חידון"
        back={`/student/lessons/${lessonId}`}
        backLabel="חזרה לשיעור"
        actions={<Badge variant="secondary">{quiz?.questions.length} שאלות</Badge>}
      />

      {quiz?.questions.map((q: any, i: number) => (
        <Card key={q.id}>
          <CardContent className="space-y-3">
            <p className="text-sm font-bold text-ink">{i + 1}. {q.question}</p>
            {q.options.map((opt: string, j: number) => (
              <label
                key={j}
                className={cn(
                  'flex cursor-pointer items-center gap-3 border-2 px-3 py-2 transition-colors',
                  answers[i] === j ? 'border-ink bg-mustard/25 text-ink' : 'border-ink/20 text-ink/70 hover:border-ink/50',
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

      <Button
        variant="mustard"
        className="w-full"
        size="lg"
        loading={attemptMutation.isPending}
        onClick={() => attemptMutation.mutate()}
        disabled={answers.some((a) => a === -1)}
      >
        הגש חידון
      </Button>
    </div>
  );
}
