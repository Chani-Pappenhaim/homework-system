import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { assignmentsApi } from '@/api/assignments.api';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileUpload } from '@/components/ui/file-upload';
import { useToast } from '@/components/ui/toast';
import { getApiErrorMessage } from '@/lib/errors';
import { unwrap } from '@/lib/api-utils';
import { cn } from '@/lib/utils';

type Kind = 'github' | 'file';

/**
 * The teacher submits the assignment for one student - work she handed in
 * another way. A GitHub link or a file, on time unless the teacher marks it late.
 */
export function SubmitForStudentDialog({ assignmentId, open, onOpenChange, onSubmitted }: {
  assignmentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The new submission, so the page can open it. */
  onSubmitted?: (submissionId: string) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [studentId, setStudentId] = useState('');
  const [kind, setKind] = useState<Kind>('github');
  const [repo, setRepo] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isLate, setIsLate] = useState(false);
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['assignment-students', assignmentId],
    queryFn: () => assignmentsApi.students(assignmentId),
    enabled: open,
  });
  const students = unwrap(data)?.students ?? [];
  const chosen = students.find((s) => s.id === studentId);

  function reset() {
    setStudentId(''); setKind('github'); setRepo(''); setFile(null); setIsLate(false); setError('');
  }

  const submit = useMutation({
    mutationFn: () => assignmentsApi.submitForStudent(assignmentId, {
      studentId, isLate, ...(kind === 'github' ? { repo } : { file: file! }),
    }),
    onMutate: () => setError(''),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['submissions', assignmentId] });
      qc.invalidateQueries({ queryKey: ['assignment-students', assignmentId] });
      toast.success(`ההגשה של ${chosen?.name ?? 'התלמידה'} נשמרה`);
      const id = unwrap(res)?.submission.id;
      reset();
      onOpenChange(false);
      if (id) onSubmitted?.(id);
    },
    onError: (e) => setError(getApiErrorMessage(e, 'ההגשה נכשלה')),
  });

  const ready = Boolean(studentId) && (kind === 'github' ? Boolean(repo.trim()) : Boolean(file));
  const tab = (active: boolean) => cn(
    'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
    active ? 'border-ink bg-ink text-sheet' : 'border-rule bg-sheet text-ink/70 hover:border-ink/40',
  );

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>הגשה במקום תלמידה</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            תלמידה
            <select
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              disabled={isLoading}
              className="rounded-input border border-rule bg-sheet px-3 py-2 text-sm text-ink shadow-soft transition-colors focus:border-clay focus:outline-none"
            >
              <option value="">{isLoading ? 'טוען...' : 'בחירת תלמידה'}</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.name}{s.submitted ? ' (כבר הגישה)' : ''}</option>
              ))}
            </select>
          </label>
          {chosen?.submitted && (
            <p className="text-xs text-ink-soft">ההגשה החדשה תחליף את ההגשה הקיימת שלה.</p>
          )}

          <div className="flex gap-2">
            <button type="button" className={tab(kind === 'github')} onClick={() => setKind('github')}>קישור ל-GitHub</button>
            <button type="button" className={tab(kind === 'file')} onClick={() => setKind('file')}>קובץ</button>
          </div>
          {kind === 'github' ? (
            <div className="space-y-1">
              <Input
                label="ריפו"
                dir="ltr"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="https://github.com/user/repo"
              />
              <p className="text-xs text-ink-soft">קישור מלא, owner/repo, או רק שם הריפו (מחשבון ה-GitHub של התלמידה)</p>
            </div>
          ) : (
            <>
              <FileUpload onFile={setFile} />
              {file && <p className="text-xs text-ink-soft">נבחר: <span dir="ltr" className="font-medium text-ink">{file.name}</span></p>}
            </>
          )}

          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" className="accent-ink" checked={isLate} onChange={(e) => setIsLate(e.target.checked)} />
            לסמן כהגשה באיחור
          </label>
          {error && <p className="text-xs text-coral">{error}</p>}
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => submit.mutate()} loading={submit.isPending} disabled={!ready}>הגשה</Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
