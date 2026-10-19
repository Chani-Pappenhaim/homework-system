import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { submissionsApi } from '@/api/submissions.api';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { getApiErrorMessage } from '@/lib/errors';
import type { MySubmission } from '@/types';

interface Props {
  submission: MySubmission;
  onDeleted?: () => void;
}

/**
 * Lets the student delete her submission so she can submit again. Shown only
 * while the server allows it — once the teacher checked it (and did not allow
 * changes), the reason is shown instead. An AI review does not lock it.
 */
export function DeleteSubmissionButton({ submission, onDeleted }: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);

  const remove = useMutation({
    mutationFn: () => submissionsApi.deleteMine(submission.id),
    onSuccess: () => {
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['mine'] });
      toast.success('ההגשה נמחקה. אפשר להגיש את המטלה מחדש');
      onDeleted?.();
    },
    onError: (e) => {
      setOpen(false);
      toast.error(getApiErrorMessage(e, 'מחיקת ההגשה נכשלה'));
      qc.invalidateQueries({ queryKey: ['mine'] });
    },
  });

  if (submission.deleteBlockedReason) {
    return <p className="text-xs text-ink/50">{submission.deleteBlockedReason}</p>;
  }

  return (
    <>
      <Button size="sm" variant="ghost" className="text-coral hover:text-coral" onClick={() => setOpen(true)}>
        <Trash2 size={13} className="ml-1" /> מחיקת ההגשה
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="למחוק את ההגשה?"
        description={`ההגשה של "${submission.assignmentTitle}" תימחק${submission.fileName ? ' יחד עם הקובץ שהועלה' : ''}, והמטלה תחזור לרשימת המטלות שלא הוגשו. אחרי המחיקה אפשר להגיש מחדש - אם המועד האחרון עבר, ההגשה החדשה תסומן כמאוחרת.${submission.aiStatus && submission.aiStatus !== 'none' ? ' בדיקות ה-AI שכבר נוצלו נספרות גם להגשה החדשה.' : ''}`}
        confirmLabel="מחיקה"
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}
