import { useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/page-header';
import QuizContent from '@/components/student/QuizContent';

export default function QuizPage() {
  const { lessonId } = useParams<{ lessonId: string }>();

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        title="חידון השיעור"
        meta="שיעור · חידון"
        back={`/student/lessons/${lessonId}`}
        backLabel="חזרה לשיעור"
      />
      {lessonId && <QuizContent lessonId={lessonId} />}
    </div>
  );
}
