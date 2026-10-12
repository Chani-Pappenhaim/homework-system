import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { assignmentsApi } from '@/api/assignments.api';
import { submissionsApi } from '@/api/submissions.api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { GradePanel } from '@/components/lesson/GradePanel';
import { cn, formatDateTime } from '@/lib/utils';
import { unwrap } from '@/lib/api-utils';
import type { AssignmentDTO, SubmissionDTO } from '@/types';

const canApprove = (s: SubmissionDTO) => s.grade?.contentScore != null && !s.grade?.contentApproved;

/**
 * The grading station of one assignment: the students who submitted down the
 * side, the chosen one's submission and grade form beside them. The chosen
 * student lives in the URL (`submissionId`), so the grades report can link
 * straight to her and a refresh stays on her.
 */
export function SubmissionsWorkstation({ assignment, selectedId, onSelect, onDirtyChange: reportDirty }: {
  assignment: AssignmentDTO;
  selectedId: string | undefined;
  onSelect: (submissionId: string) => void;
  /** Unsaved grade edits, so the page can ask before leaving the assignment too. */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ['submissions', assignment.id],
    queryFn: () => assignmentsApi.getSubmissions(assignment.id),
  });
  // A roster order, so "next" means the same student every time — not the
  // server's newest-first, which shifts whenever someone resubmits.
  const submissions = useMemo(
    () => [...(unwrap(data)?.submissions ?? [])].sort((a, b) => a.studentName.localeCompare(b.studentName, 'he')),
    [data],
  );

  // Without an explicit choice, start from the first one still waiting for a grade.
  const current = submissions.find((s) => s.id === selectedId)
    ?? submissions.find((s) => !s.grade)
    ?? submissions[0];
  const index = current ? submissions.indexOf(current) : -1;
  const previous = index > 0 ? submissions[index - 1] : undefined;
  const next = index >= 0 && index < submissions.length - 1 ? submissions[index + 1] : undefined;
  const gradedCount = submissions.filter((s) => s.grade).length;

  // Pin the default choice in the URL: otherwise saving her grade would make
  // "first one waiting" point at someone else and the page would jump.
  useEffect(() => {
    if (current && current.id !== selectedId) onSelect(current.id);
  }, [current, selectedId, onSelect]);

  // Switching away from unsaved edits asks first.
  const dirtyRef = useRef(false);
  const onDirtyChange = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
    reportDirty?.(dirty);
  }, [reportDirty]);
  const [pendingSwitch, setPendingSwitch] = useState<SubmissionDTO | null>(null);
  const goTo = (target: SubmissionDTO | undefined, { force = false } = {}) => {
    if (!target || target.id === current?.id) return;
    if (dirtyRef.current && !force) { setPendingSwitch(target); return; }
    dirtyRef.current = false;
    onSelect(target.id);
  };

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const approvable = submissions.filter(canApprove);
  const bulkApproveMutation = useMutation({
    mutationFn: () => submissionsApi.bulkApproveContent(Array.from(selected)),
    onSuccess: (res) => {
      const { approved } = unwrap(res) ?? { approved: 0 };
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['submissions', assignment.id] });
      toast.success(`${approved} ציונים אושרו ונשלחו לתלמידות`);
    },
  });
  const toggleSelected = (id: string) => setSelected((prev) => {
    const nextSet = new Set(prev);
    if (nextSet.has(id)) nextSet.delete(id); else nextSet.add(id);
    return nextSet;
  });

  if (isLoading) return <p className="px-5 py-4 text-sm text-ink/50">טוען הגשות...</p>;
  if (submissions.length === 0) return <p className="px-5 py-4 text-center text-sm text-ink/50">אין הגשות עדיין</p>;

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[17rem_1fr] lg:items-start">
      <aside className="rounded-input border border-rule/30 lg:sticky lg:top-4">
        <div className="space-y-2 border-b border-rule/20 px-3 py-2.5 text-xs text-ink/60">
          <p>נבדקו {gradedCount} מתוך {submissions.length}</p>
          {approvable.length > 0 && (
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  className="accent-ink"
                  checked={selected.size === approvable.length}
                  onChange={() => setSelected((prev) =>
                    prev.size === approvable.length ? new Set() : new Set(approvable.map((s) => s.id)))}
                />
                לאישור ({approvable.length})
              </label>
              <Button
                size="sm"
                loading={bulkApproveMutation.isPending}
                disabled={selected.size === 0}
                onClick={() => bulkApproveMutation.mutate()}
              >
                <CheckCircle size={12} /> אשרי ושלחי ({selected.size})
              </Button>
            </div>
          )}
        </div>
        <ul className="max-h-[60vh] divide-y divide-rule/20 overflow-y-auto" aria-label="הגשות">
          {submissions.map((s) => {
            const active = s.id === current?.id;
            return (
              <li key={s.id} className={cn('flex items-center gap-2 px-3', active ? 'bg-ground' : 'hover:bg-ground/60')}>
                {approvable.length > 0 && (
                  <input
                    type="checkbox"
                    className="accent-ink"
                    aria-label={`בחירת ${s.studentName} לאישור`}
                    disabled={!canApprove(s)}
                    checked={selected.has(s.id)}
                    onChange={() => toggleSelected(s.id)}
                  />
                )}
                <button
                  onClick={() => goTo(s)}
                  aria-current={active ? 'true' : undefined}
                  className="flex min-w-0 flex-1 items-center justify-between gap-2 py-2.5 text-right"
                >
                  <span className="min-w-0">
                    <span className={cn('block truncate text-sm', active ? 'font-bold text-ink' : 'text-ink/85')}>{s.studentName}</span>
                    <span className="block text-xs text-ink/50">
                      {s.grade?.submissionScore != null ? `ציון ${s.grade.submissionScore}` : s.grade ? 'נבדקה' : 'ממתינה לבדיקה'}
                      {s.grade?.contentScore != null && ` · תוכן ${s.grade.contentScore}${s.grade.contentApproved ? ' ✓' : ''}`}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    {s.isLate && <Badge variant="warning">איחור</Badge>}
                    {!s.grade && <span className="size-2 rounded-full bg-clay" aria-hidden />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {current && (
        <section className="min-w-0 space-y-4" aria-label={`ההגשה של ${current.studentName}`}>
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-rule/20 pb-3">
            <div>
              <h3 className="font-display text-lg font-bold text-ink">{current.studentName}</h3>
              <p className="text-xs text-ink/50">
                {current.studentEmail} · הוגש {formatDateTime(current.submittedAt)}
                {current.isLate && <Badge variant="warning" className="mr-1.5">איחור</Badge>}
              </p>
            </div>
            <nav className="flex items-center gap-1.5" aria-label="מעבר בין הגשות">
              <Button size="sm" variant="outline" disabled={!previous} onClick={() => goTo(previous)}>
                <ChevronRight size={14} /> הקודמת
              </Button>
              <span className="px-1 text-xs tabular-nums text-ink/60">{index + 1} מתוך {submissions.length}</span>
              <Button size="sm" variant="outline" disabled={!next} onClick={() => goTo(next)}>
                הבאה <ChevronLeft size={14} />
              </Button>
            </nav>
          </div>

          <GradePanel
            key={current.id}
            submission={current}
            assignment={assignment}
            onDirtyChange={onDirtyChange}
            onNext={next ? () => goTo(next, { force: true }) : undefined}
          />
        </section>
      )}

      <ConfirmDialog
        open={Boolean(pendingSwitch)}
        onOpenChange={(open) => { if (!open) setPendingSwitch(null); }}
        title="לעבור בלי לשמור?"
        description={`השינויים בציון של ${current?.studentName ?? ''} עוד לא נשמרו, והם יאבדו במעבר.`}
        confirmLabel="מעבר בלי לשמור"
        cancelLabel="הישארות"
        onConfirm={() => {
          const target = pendingSwitch;
          setPendingSwitch(null);
          goTo(target ?? undefined, { force: true });
        }}
      />
    </div>
  );
}
