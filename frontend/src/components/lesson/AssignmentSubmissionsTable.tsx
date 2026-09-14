import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Github, Paperclip, Edit, CheckCircle } from 'lucide-react';
import { assignmentsApi } from '@/api/assignments.api';
import { submissionsApi } from '@/api/submissions.api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/utils';
import { unwrap } from '@/lib/api-utils';
import { useToast } from '@/components/ui/toast';
import type { SubmissionDTO } from '@/types';

export function AssignmentSubmissionsTable({ assignmentId, onGrade, autoOpenSubmissionId, onAutoOpenHandled }: {
  assignmentId: string | undefined;
  onGrade: (submission: SubmissionDTO) => void;
  /** Deep-link support: open this submission's grade modal as soon as it loads. */
  autoOpenSubmissionId?: string;
  onAutoOpenHandled?: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: submissionsData } = useQuery({
    queryKey: ['submissions', assignmentId],
    queryFn: () => assignmentsApi.getSubmissions(assignmentId!),
    enabled: Boolean(assignmentId),
  });
  const submissions: SubmissionDTO[] = unwrap(submissionsData)?.submissions ?? [];

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const approvable = submissions.filter((s) => s.grade?.contentScore != null && !s.grade?.contentApproved);

  const bulkApproveMutation = useMutation({
    mutationFn: () => submissionsApi.bulkApproveContent(Array.from(selected)),
    onSuccess: (res) => {
      const { approved } = unwrap(res) ?? { approved: 0 };
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['submissions', assignmentId] });
      toast.success(`${approved} ציונים אושרו ונשלחו לתלמידות`);
    },
  });

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => prev.size === approvable.length ? new Set() : new Set(approvable.map((s) => s.id)));
  }

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
    <div>
      {approvable.length > 0 && (
        <div className="flex items-center justify-between gap-3 px-5 py-2 text-xs">
          <span className="text-ink/50">{selected.size} ציונים נבחרו לאישור</span>
          <Button
            size="sm"
            loading={bulkApproveMutation.isPending}
            disabled={selected.size === 0}
            onClick={() => bulkApproveMutation.mutate()}
          >
            <CheckCircle size={12} /> אשרי ושלחי ציונים נבחרים ({selected.size})
          </Button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-rule/20 text-xs text-ink/50">
              {approvable.length > 0 && (
                <th className="px-3 py-2.5 text-right font-medium">
                  <input type="checkbox" className="accent-ink" checked={selected.size === approvable.length} onChange={toggleSelectAll} />
                </th>
              )}
              <th className="px-5 py-2.5 text-right font-medium">תלמידה</th>
              <th className="px-3 py-2.5 text-right font-medium">הגשה</th>
              <th className="px-3 py-2.5 text-right font-medium">תאריך</th>
              <th className="px-3 py-2.5 text-right font-medium">ציון</th>
              <th className="px-3 py-2.5 text-right font-medium">פעולה</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule/20">
            {submissions.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-4 text-center text-ink/50">אין הגשות עדיין</td></tr>
            )}
            {submissions.map((s) => {
              const canApprove = s.grade?.contentScore != null && !s.grade?.contentApproved;
              return (
                <tr key={s.id} className="hover:bg-ground/60 transition">
                  {approvable.length > 0 && (
                    <td className="px-3 py-3">
                      {canApprove && (
                        <input type="checkbox" className="accent-ink" checked={selected.has(s.id)} onChange={() => toggleSelected(s.id)} />
                      )}
                    </td>
                  )}
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
                    {s.grade?.contentScore != null && (
                      <span className="mr-1 text-xs text-ink/50">
                        (תוכן: {s.grade.contentScore}{s.grade.contentApproved ? ' ✓' : ''})
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <Button size="sm" variant={s.grade ? 'outline' : 'default'} onClick={() => onGrade(s)}>
                      {s.grade ? <><Edit size={12} /> ערוך</> : 'בדוק עכשיו'}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
