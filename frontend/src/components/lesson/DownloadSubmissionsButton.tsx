import { useMutation } from '@tanstack/react-query';
import { Archive } from 'lucide-react';
import { submissionsApi } from '@/api/submissions.api';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { getDownloadErrorMessage } from '@/lib/errors';
import { downloadBlob } from '@/lib/utils';

/** Downloads all the files students submitted for an assignment as one zip, a folder per student. */
export function DownloadSubmissionsButton({ assignmentId, title }: { assignmentId: string; title: string }) {
  const toast = useToast();
  const download = useMutation({
    mutationFn: () => submissionsApi.downloadArchive(assignmentId),
    onSuccess: (res) => downloadBlob(res.data as Blob, `${title}.zip`),
    onError: async (e) => toast.error(await getDownloadErrorMessage(e, 'הורדת הקבצים נכשלה, נסי שוב')),
  });

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => download.mutate()}
      loading={download.isPending}
      title="כל הקבצים שהוגשו למטלה בקובץ ZIP אחד, תיקייה לכל תלמידה. הגשות של קישור GitHub לא נכללות"
    >
      <Archive size={12} /> הורדת כל הקבצים
    </Button>
  );
}
