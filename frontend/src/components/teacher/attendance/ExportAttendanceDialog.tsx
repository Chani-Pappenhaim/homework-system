import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { attendanceApi } from '@/api/attendance.api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DateField } from '@/components/ui/date-field';
import { useToast } from '@/components/ui/toast';
import { getDownloadErrorMessage } from '@/lib/errors';
import { dayRangeLabel, dayRangeParams } from '@/lib/date-range';
import { downloadBlob } from '@/lib/utils';

interface Props {
  courseId: string;
  courseName: string;
  onClose: () => void;
}

/** Downloads the course's attendance as a spreadsheet, for every meeting or only those in chosen days. */
export function ExportAttendanceDialog({ courseId, courseName, onClose }: Props) {
  const toast = useToast();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const range = dayRangeParams({ from, to });
  const backwards = !!from && !!to && from > to;

  const exportFile = useMutation({
    mutationFn: () => attendanceApi.exportFile(courseId, range),
    onSuccess: (res) => {
      const label = dayRangeLabel(range);
      downloadBlob(res.data as Blob, `נוכחות ${courseName}${label ? ` ${label}` : ''}.xlsx`);
      onClose();
    },
    onError: async (e) => toast.error(await getDownloadErrorMessage(e, 'ייצוא הנוכחות נכשל')),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <form onSubmit={(e) => { e.preventDefault(); if (!backwards) exportFile.mutate(); }}>
          <DialogHeader><DialogTitle>ייצוא נוכחות ל-Excel</DialogTitle></DialogHeader>
          <DialogBody className="space-y-4">
            <p className="text-sm text-ink-soft">
              שורה לכל תלמידה ועמודה לכל מפגש, עם סיכום ואחוז נוכחות. בלי תאריכים - כל המפגשים בקורס.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <DateField label="מתאריך" value={from} onChange={setFrom} />
              <DateField label="עד תאריך" value={to} onChange={setTo} />
            </div>
            {backwards && <p className="text-xs text-coral">תאריך ההתחלה מאוחר מתאריך הסיום</p>}
          </DialogBody>
          <DialogFooter>
            <Button type="submit" loading={exportFile.isPending} disabled={backwards}><Download size={14} /> ייצוא</Button>
            <Button type="button" variant="outline" onClick={onClose}>ביטול</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
