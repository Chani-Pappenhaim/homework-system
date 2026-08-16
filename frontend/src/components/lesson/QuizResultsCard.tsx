import { useQuery } from '@tanstack/react-query';
import { ListChecks } from 'lucide-react';
import { quizzesApi } from '@/api/quizzes.api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { formatDateTime } from '@/lib/utils';
import { unwrap } from '@/lib/api-utils';

/** Not every lesson has a quiz — a 404 here just means "no quiz section to show". */
export function QuizResultsCard({ lessonId }: { lessonId: string }) {
  const { data: quizResultsData } = useQuery({
    queryKey: ['quiz-results', lessonId],
    queryFn: () => quizzesApi.results(lessonId),
    enabled: Boolean(lessonId),
    retry: false,
  });
  const quizResults = unwrap(quizResultsData);

  if (!quizResults) return null;

  return (
    <Card accent="sage">
      <CardHeader>
        <h2 className="font-display text-base font-bold flex items-center gap-1.5">
          <ListChecks size={15} className="text-sage" /> תוצאות חידון ({quizResults.results.length})
        </h2>
      </CardHeader>
      {quizResults.results.length === 0 ? (
        <CardContent><p className="text-sm text-ink/50">אף תלמידה עוד לא ענתה על החידון</p></CardContent>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rule/20 text-xs text-ink/50">
                <th className="px-5 py-2.5 text-right font-medium">תלמידה</th>
                <th className="px-3 py-2.5 text-right font-medium">ציון</th>
                <th className="px-3 py-2.5 text-right font-medium">תאריך</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule/20">
              {quizResults.results.map((r, i) => (
                <tr key={i}>
                  <td className="px-5 py-3">
                    <p className="font-medium text-ink">{r.studentName}</p>
                    <p className="text-xs text-ink/50">{r.studentEmail}</p>
                  </td>
                  <td className="px-3 py-3 font-semibold text-ink">{Math.round(r.score)}%</td>
                  <td className="px-3 py-3 text-ink/70 text-xs">{formatDateTime(r.takenAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
