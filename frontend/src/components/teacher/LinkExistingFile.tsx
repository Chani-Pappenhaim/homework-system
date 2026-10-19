import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link2 } from 'lucide-react';
import { fileLinksApi, type FileHolder, type LinkableFile } from '@/api/fileLinks.api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { getApiErrorMessage } from '@/lib/errors';
import { formatBytes } from '@/lib/utils';

/**
 * "A file already on the site": shows a file from another lesson or course
 * here too. Nothing is uploaded again and no storage is used - both places
 * point at the same stored file, and deleting it from one leaves the other.
 */
export function LinkExistingFile({ target, targetId, onLinked }: {
  target: FileHolder;
  targetId: string;
  onLinked: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Link2 size={13} /> קובץ שכבר קיים באתר
      </Button>
      {open && <LinkDialog target={target} targetId={targetId} onLinked={onLinked} onClose={() => setOpen(false)} />}
    </>
  );
}

function LinkDialog({ target, targetId, onLinked, onClose }: {
  target: FileHolder; targetId: string; onLinked: () => void; onClose: () => void;
}) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['linkable-files', target, targetId],
    queryFn: () => fileLinksApi.list(target, targetId),
  });
  const files = data?.data.data.files ?? [];

  const link = useMutation({
    mutationFn: (file: LinkableFile) => fileLinksApi.link(target, targetId, file),
    onSuccess: (_res, file) => {
      toast.success(`"${file.name}" נוסף - בלי העלאה נוספת`);
      onLinked();
      onClose();
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'הוספת הקובץ נכשלה')),
  });

  const q = query.trim().toLowerCase();
  const shown = q
    ? files.filter((f) => [f.name, f.courseName, f.lessonTopic ?? ''].some((t) => t.toLowerCase().includes(q)))
    : files;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>קובץ שכבר קיים באתר</DialogTitle></DialogHeader>
        <DialogBody className="space-y-3">
          <p className="text-sm text-ink-soft">
            הקובץ יופיע גם {target === 'lesson' ? 'בשיעור הזה' : 'בקורס הזה'}, בלי להעלות אותו שוב ובלי לתפוס עוד מקום אחסון.
            מחיקה שלו כאן לא מוחקת אותו מהמקום המקורי.
          </p>
          <Input placeholder="חיפוש לפי שם קובץ, קורס או שיעור..." value={query} onChange={(e) => setQuery(e.target.value)} />
          {isLoading ? (
            <p className="py-6 text-center text-sm text-ink-soft">טוען…</p>
          ) : shown.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-soft">{files.length === 0 ? 'אין עוד קבצים באתר' : 'לא נמצאו קבצים'}</p>
          ) : (
            <ul className="max-h-80 divide-y divide-rule/30 overflow-y-auto rounded-input border border-rule">
              {shown.map((f) => (
                <li key={`${f.source}-${f.id}`} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink" dir="auto">{f.name}</p>
                    <p className="truncate text-xs text-ink-soft">
                      {f.courseName}{f.lessonTopic ? ` · ${f.lessonTopic}` : ' · קבצי הקורס'}
                      {f.sizeBytes ? ` · ${formatBytes(f.sizeBytes)}` : ''}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    loading={link.isPending && link.variables?.id === f.id}
                    disabled={link.isPending}
                    onClick={() => link.mutate(f)}
                    aria-label={`הוספת ${f.name}`}
                  >
                    הוספה
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
