import { useMutation, useQueryClient } from '@tanstack/react-query';
import { groupsApi } from '@/api/groups.api';
import { useConfirm } from '@/components/ui/use-confirm';
import { useToast } from '@/components/ui/toast';
import { groupDisplayName } from '@/lib/utils';

interface DeletableGroup {
  id: string;
  name: string;
  seminar?: string | null;
  year?: string | null;
  /** How many courses go with the group - the warning names them; unknown, it warns of them all the same. */
  courseCount?: number;
}

/**
 * Deleting a group, wherever the teacher starts it: she is told first what goes
 * with it (its courses and everything in them; the students stay). Render
 * `confirmDialog` once in the page.
 */
export function useDeleteGroup({ onDeleted }: { onDeleted?: () => void } = {}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [confirmDialog, ask] = useConfirm();

  const mutation = useMutation({
    mutationFn: (groupId: string) => groupsApi.delete(groupId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      qc.invalidateQueries({ queryKey: ['courses'] });
      toast.success('הקבוצה נמחקה');
      onDeleted?.();
    },
  });

  async function deleteGroup(group: DeletableGroup) {
    const { courseCount } = group;
    let coursesNote = '';
    if (courseCount === undefined) coursesNote = 'כל הקורסים של הקבוצה (כולל שיעורים, מטלות והגשות) יימחקו גם הם לצמיתות. ';
    else if (courseCount > 0) coursesNote = `כל ${courseCount} הקורסים של הקבוצה (כולל שיעורים, מטלות והגשות) יימחקו גם הם לצמיתות. `;
    const ok = await ask({
      title: `למחוק את הקבוצה "${groupDisplayName(group)}"?`,
      description: `${coursesNote}התלמידות לא יימחקו מהמערכת, רק ישויכו החוצה מהקבוצה.`,
    });
    if (ok) mutation.mutate(group.id);
  }

  return {
    confirmDialog,
    deleteGroup,
    /** The group being deleted right now, if any. */
    deletingId: mutation.isPending ? mutation.variables : undefined,
  };
}
