import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ListChecks } from 'lucide-react';
import { quizzesApi } from '@/api/quizzes.api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { unwrap } from '@/lib/api-utils';
import type { LessonDetailDTO } from '@/types';

/**
 * Shows quiz status for a lesson and links to the full editor/results page.
 * Not every lesson has a quiz, so a 404 on the results fetch is expected
 * and just means none has been created yet.
 */
export function QuizResultsCard({ lesson }: { lesson: LessonDetailDTO }) {
  const navigate = useNavigate();
  const { data: quizResultsData } = useQuery({
    queryKey: ['quiz-results', lesson.id],
    queryFn: () => quizzesApi.results(lesson.id),
    enabled: Boolean(lesson.id),
    retry: false,
  });
  const quizResults = unwrap(quizResultsData);
  const quizState = lesson.quiz ?? { exists: false, published: false };

  return (
    <Card accent="indigo">
      <CardHeader>
        <h2 className="font-display text-base font-bold flex items-center gap-1.5">
          <ListChecks size={15} className="text-indigo" /> חידון השיעור
        </h2>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          {quizState.exists ? (
            <>
              <Badge variant={quizState.published ? 'success' : 'secondary'}>
                {quizState.published ? 'פורסם לתלמידות' : 'טיוטה — התלמידות לא רואות'}
              </Badge>
              <p className="mt-1.5 font-sans text-xs text-ink/55">
                {quizResults
                  ? `${quizResults.quiz.questionCount} שאלות · ${quizResults.summary.attemptCount} תלמידות ענו`
                  : 'עריכת השאלות ותוצאות הכיתה'}
              </p>
            </>
          ) : (
            <p className="font-sans text-sm text-ink/55">
              {lesson.contentMd?.trim()
                ? 'עדיין לא נוצר חידון לשיעור זה.'
                : 'כדי ליצור חידון יש להוסיף תחילה תוכן שיעור.'}
            </p>
          )}
        </div>
        <Button variant={quizState.exists ? 'secondary' : 'clay'} onClick={() => navigate(`/teacher/quiz/${lesson.id}`)}>
          {quizState.exists ? 'ניהול החידון' : 'ליצירת חידון'}
        </Button>
      </CardContent>
    </Card>
  );
}
