import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { quizzesApi } from '@/api/quizzes.api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function QuizPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<{ score: number; correct: number; total: number } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['quiz', lessonId],
    queryFn: () => quizzesApi.get(lessonId!),
    refetchInterval: (query) => {
      const status = (query.state.data?.data as any)?.data?.status;
      return status === 'generating' ? 3000 : false;
    },
  });

  const quizData = (data?.data as any)?.data;
  const status: 'generating' | 'ready' = quizData?.status ?? 'generating';
  const quiz = quizData?.quiz;

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

  if (isLoading) return <div className="p-6 text-ink/50">טוען...</div>;

  if (status === 'generating') {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20" dir="rtl">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-ink/70 text-sm">החידון נוצר, אנא המתיני...</p>
        <p className="text-xs text-ink/50">Claude AI מכין שאלות בעברית על תוכן השיעור</p>
      </div>
    );
  }

  if (result) {
    return (
      <div className="max-w-lg mx-auto space-y-5" dir="rtl">
        <Card accent="cobalt">
          <CardContent className="text-center space-y-2">
            <p className="text-5xl font-bold text-primary">{Math.round(result.score)}%</p>
            <p className="text-ink/70">{result.correct} מתוך {result.total} תשובות נכונות</p>
            <Badge variant={result.score >= 80 ? 'success' : result.score >= 60 ? 'warning' : 'default'}>
              {result.score >= 80 ? 'מצוין!' : result.score >= 60 ? 'טוב' : 'נסי שוב'}
            </Badge>
          </CardContent>
        </Card>

        {quiz?.questions.map((q: any, i: number) => (
          <Card key={q.id}>
            <CardContent className="space-y-2">
              <p className="text-sm font-medium">{i + 1}. {q.question}</p>
              {q.options.map((opt: string, j: number) => {
                const isCorrect = q.correctIndex === j;
                const isSelected = answers[i] === j;
                return (
                  <div key={j} className={`px-3 py-2 rounded-input text-sm flex items-center gap-2
                    ${isCorrect ? 'bg-forest/20 text-forest border border-forest/30' :
                      isSelected && !isCorrect ? 'bg-tomato/15 text-tomato border border-tomato/30' :
                      'bg-cream/60 text-ink/70'}`}>
                    <span>{isCorrect ? '✓' : isSelected ? '✗' : '○'}</span>
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
    <div className="max-w-lg mx-auto space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">חידון השיעור ✦</h1>
        <Badge variant="secondary">{quiz?.questions.length} שאלות</Badge>
      </div>

      {quiz?.questions.map((q: any, i: number) => (
        <Card key={q.id}>
          <CardContent className="space-y-3">
            <p className="text-sm font-medium">{i + 1}. {q.question}</p>
            {q.options.map((opt: string, j: number) => (
              <label key={j} className={`flex items-center gap-3 px-3 py-2 rounded-input cursor-pointer transition border
                ${answers[i] === j
                  ? 'border-primary bg-[rgba(194,24,91,0.05)] text-ink'
                  : 'border-ink/20 hover:border-primary/30 text-ink/70'}`}>
                <input
                  type="radio"
                  name={`q-${i}`}
                  checked={answers[i] === j}
                  onChange={() => setAnswers((prev) => { const n = [...prev]; n[i] = j; return n; })}
                  className="accent-primary"
                />
                <span className="text-sm">{opt}</span>
              </label>
            ))}
          </CardContent>
        </Card>
      ))}

      <Button
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
