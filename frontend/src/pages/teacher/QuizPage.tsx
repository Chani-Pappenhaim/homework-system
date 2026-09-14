import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { lessonsApi } from '@/api/lessons.api';
import { quizzesApi } from '@/api/quizzes.api';
import QuizPanel from '@/components/teacher/QuizPanel';
import QuizDashboard from '@/components/teacher/QuizDashboard';
import { PageHeader } from '@/components/ui/page-header';
import type { QuizResultsDTO } from '@/types';

/** Standalone page for managing a lesson's quiz: question editor plus a class-wide results breakdown. */
export default function TeacherQuizPage() {
  const { lessonId } = useParams<{ lessonId: string }>();

  const { data: lessonData, isLoading } = useQuery({
    queryKey: ['lesson', lessonId],
    queryFn: () => lessonsApi.get(lessonId!),
    enabled: Boolean(lessonId),
  });

  // 404 here just means "no quiz yet" — the panel below handles that case.
  const { data: resultsData } = useQuery({
    queryKey: ['quiz-results', lessonId],
    queryFn: () => quizzesApi.results(lessonId!),
    enabled: Boolean(lessonId),
    retry: false,
  });

  const lesson = lessonData?.data.data.lesson;
  const results = (resultsData?.data as any)?.data as QuizResultsDTO | undefined;

  if (isLoading) return <div className="p-6 text-ink/50">טוען…</div>;
  if (!lesson) return <div className="p-6 text-coral">שיעור לא נמצא</div>;

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        title="חידון השיעור"
        meta={lesson.topic}
        back={`/teacher/lessons/${lessonId}`}
        backLabel="חזרה לשיעור"
      />

      <QuizPanel
        lessonId={lessonId!}
        hasContent={Boolean(lesson.contentMd?.trim())}
        hasFiles={lesson.files.length > 0}
      />

      {results && <QuizDashboard data={results} />}
    </div>
  );
}
