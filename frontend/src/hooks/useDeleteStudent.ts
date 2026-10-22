import { useMutation, useQueryClient } from '@tanstack/react-query';
import { studentsApi } from '@/api/students.api';
import { useConfirm } from '@/components/ui/use-confirm';
import { useToast } from '@/components/ui/toast';
import { getApiErrorMessage } from '@/lib/errors';

/**
 * Deleting a student's account, wherever the teacher starts it: she is told
 * first that all the student's work goes with it. Render `confirmDialog` once in the page.
 */
export function useDeleteStudent({ onDeleted }: { onDeleted?: (studentId: string) => void } = {}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [confirmDialog, ask] = useConfirm();

  const mutation = useMutation({
    mutationFn: (studentId: string) => studentsApi.delete(studentId),
    onSuccess: (_, studentId) => {
      // Her rows are gone everywhere — groups, grading queues, reports. Her own
      // profile is left alone, so an open profile page doesn't refetch it into a 404 on the way out.
      qc.invalidateQueries({ predicate: (q) => !(q.queryKey[1] === 'profile' && q.queryKey[2] === studentId) });
      toast.success('חשבון התלמידה נמחק');
      onDeleted?.(studentId);
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'שגיאה במחיקת התלמידה')),
  });

  async function deleteStudent(student: { id: string; name: string }) {
    const ok = await ask({
      title: 'מחיקת חשבון תלמידה',
      description: `למחוק לצמיתות את החשבון של ${student.name}? יימחקו גם כל ההגשות, הציונים, הנוכחות וההודעות שלה, והיא תוסר מכל הקבוצות. אי אפשר לבטל את הפעולה.`,
      confirmLabel: 'מחיקה לצמיתות',
    });
    if (ok) mutation.mutate(student.id);
  }

  return {
    confirmDialog,
    deleteStudent,
    /** The student being deleted right now, if any. */
    deletingId: mutation.isPending ? mutation.variables : undefined,
  };
}
