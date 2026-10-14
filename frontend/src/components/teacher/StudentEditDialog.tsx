import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { getApiErrorMessage } from '@/lib/errors';

export interface EditableStudent {
  id: string;
  name: string;
  email: string;
  githubUsername?: string | null;
}

export interface StudentEdit {
  name: string;
  email: string;
  githubUsername: string;
}

interface StudentEditDialogProps {
  /** The student being edited; null keeps the dialog closed. */
  student: EditableStudent | null;
  onClose: () => void;
  save: (studentId: string, data: StudentEdit) => Promise<unknown>;
  onSaved?: () => void;
}

/**
 * The teacher's "edit student details" dialog — shared by the group page and
 * the student's own page. An empty GitHub field clears the username.
 */
export function StudentEditDialog({ student, onClose, save, onSaved }: StudentEditDialogProps) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [github, setGithub] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!student) return;
    setName(student.name);
    setEmail(student.email);
    setGithub(student.githubUsername ?? '');
    setError('');
  }, [student]);

  const mutation = useMutation({
    mutationFn: () => save(student!.id, { name, email, githubUsername: github.trim() }),
    onSuccess: () => {
      onSaved?.();
      onClose();
      toast.success('פרטי התלמידה עודכנו');
    },
    onError: (e: any) => setError(getApiErrorMessage(e, 'שגיאה בעדכון')),
  });

  const clearingGithub = Boolean(student?.githubUsername) && !github.trim();

  return (
    <Dialog open={!!student} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>עריכת פרטי תלמידה</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-3">
            <Input label="שם מלא" value={name} onChange={(e) => setName(e.target.value)} />
            <Input label="אימייל" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input label="שם משתמש GitHub (אופציונלי)" value={github} onChange={(e) => setGithub(e.target.value)} />
            {clearingGithub && (
              <p className="text-xs text-ink/60">
                שם המשתמש ב-GitHub יימחק. הגשות שכבר הוגשו לא ייפגעו — הקישורים לריפו שלהן נשמרים.
              </p>
            )}
            {error && <p className="text-coral text-sm">{error}</p>}
            <Button
              loading={mutation.isPending}
              onClick={() => mutation.mutate()}
              disabled={!name.trim() || !email.trim()}
              className="w-full"
            >
              שמור שינויים
            </Button>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
