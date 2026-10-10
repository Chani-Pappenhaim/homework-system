import { useMutation, useQueryClient } from '@tanstack/react-query';
import { attendanceApi, type RosterStudent } from '@/api/attendance.api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { getApiErrorMessage } from '@/lib/errors';

/**
 * Who appears in attendance. Group members always do; a student who was given
 * personal access to the course (but isn't in its group) can be left out.
 */
export function RosterDialog({ courseId, roster, onClose }: { courseId: string; roster: RosterStudent[]; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const group = roster.filter((s) => s.source === 'group');
  const access = roster.filter((s) => s.source === 'access');

  const toggle = useMutation({
    mutationFn: (v: { studentId: string; excluded: boolean }) => attendanceApi.setExclusion(courseId, v.studentId, v.excluded),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance', courseId] }),
    onError: (e) => toast.error(getApiErrorMessage(e, 'השינוי לא נשמר')),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>מי מופיעה בנוכחות</DialogTitle></DialogHeader>
        <DialogBody className="space-y-5">
          <section>
            <h3 className="mb-1 text-sm font-semibold text-ink">תלמידות עם גישה אישית לקורס</h3>
            <p className="mb-2 text-xs text-ink-soft">רשומות לקורס אבל לא לקבוצה שלו. אפשר לבחור אם לכלול אותן בנוכחות.</p>
            {access.length === 0 ? (
              <p className="rounded-lg bg-ground px-3 py-2 text-xs text-ink-soft">אין תלמידות עם גישה אישית לקורס הזה.</p>
            ) : (
              <ul className="divide-y divide-rule rounded-lg border border-rule">
                {access.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{s.name}</p>
                      <p className="truncate text-xs text-ink-soft" dir="ltr">{s.email}</p>
                    </div>
                    <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-semibold text-ink">
                      <input
                        type="checkbox"
                        className="size-4 accent-sage"
                        checked={!s.excluded}
                        disabled={toggle.isPending}
                        onChange={() => toggle.mutate({ studentId: s.id, excluded: !s.excluded })}
                      />
                      {s.excluded ? 'לא בנוכחות' : 'בנוכחות'}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-1 text-sm font-semibold text-ink">תלמידות הקבוצה ({group.length})</h3>
            <p className="mb-2 text-xs text-ink-soft">תמיד מופיעות בנוכחות.</p>
            <p className="text-sm text-ink">{group.map((s) => s.name).join(' · ') || '—'}</p>
          </section>
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose}>סגירה</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
