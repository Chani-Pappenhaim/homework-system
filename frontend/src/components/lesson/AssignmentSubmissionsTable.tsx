import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Github, Paperclip, Edit } from 'lucide-react';
import { assignmentsApi } from '@/api/assignments.api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/utils';
import { unwrap } from '@/lib/api-utils';
import type { SubmissionDTO } from '@/types';

export function AssignmentSubmissionsTable({ assignmentId, onGrade, autoOpenSubmissionId, onAutoOpenHandled }: {
  assignmentId: string | undefined;
  onGrade: (submission: SubmissionDTO) => void;
  /** Deep-link support: open this submission's grade modal as soon as it loads. */
  autoOpenSubmissionId?: string;
  onAutoOpenHandled?: () => void;
}) {
  const { data: submissionsData } = useQuery({
    queryKey: ['submissions', assignmentId],
    queryFn: () => assignmentsApi.getSubmissions(assignmentId!),
    enabled: Boolean(assignmentId),
  });
  const submissions: SubmissionDTO[] = unwrap(submissionsData)?.submissions ?? [];

  // Fire once per deep-link — without the ref, a later refetch (e.g. after
  // grading) would find the same id again and re-open the modal on its own.
  const openedRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!autoOpenSubmissionId || openedRef.current === autoOpenSubmissionId) return;
    const match = submissions.find((s) => s.id === autoOpenSubmissionId);
    if (!match) return;
    openedRef.current = autoOpenSubmissionId;
    onGrade(match);
    onAutoOpenHandled?.();
  }, [autoOpenSubmissionId, submissions, onGrade, onAutoOpenHandled]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-rule/20 text-xs text-ink/50">
            <th className="px-5 py-2.5 text-right font-medium">תלמידה</th>
            <th className="px-3 py-2.5 text-right font-medium">הגשה</th>
            <th className="px-3 py-2.5 text-right font-medium">תאריך</th>
            <th className="px-3 py-2.5 text-right font-medium">ציון</th>
            <th className="px-3 py-2.5 text-right font-medium">פעולה</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-rule/20">
          {submissions.length === 0 && (
            <tr><td colSpan={5} className="px-5 py-4 text-center text-ink/50">אין הגשות עדיין</td></tr>
          )}
          {submissions.map((s) => (
            <tr key={s.id} className="hover:bg-ground/60 transition">
              <td className="px-5 py-3">
                <p className="font-medium text-ink">{s.studentName}</p>
                <p className="text-xs text-ink/50">{s.studentEmail}</p>
              </td>
              <td className="px-3 py-3">
                {s.fileUrl ? (
                  <a href={s.fileUrl} target="_blank" rel="noreferrer" className="text-clay hover:underline flex items-center gap-1">
                    <Paperclip size={12} /> {s.fileName ?? 'קובץ'}
                  </a>
                ) : s.githubUrl ? (
                  <a href={s.githubUrl} target="_blank" rel="noreferrer" className="text-clay hover:underline flex items-center gap-1">
                    <Github size={12} /> GitHub
                  </a>
                ) : <span className="text-ink/50">לא הוגש</span>}
              </td>
              <td className="px-3 py-3 text-ink/70 text-xs">
                {formatDateTime(s.submittedAt)}
                {s.isLate && <Badge variant="warning" className="mr-1">איחור</Badge>}
              </td>
              <td className="px-3 py-3">
                {s.grade?.submissionScore != null
                  ? <span className="font-semibold text-ink">{s.grade.submissionScore}</span>
                  : <span className="text-ink/50">—</span>}
              </td>
              <td className="px-3 py-3">
                <Button size="sm" variant={s.grade ? 'outline' : 'default'} onClick={() => onGrade(s)}>
                  {s.grade ? <><Edit size={12} /> ערוך</> : 'בדוק עכשיו'}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
