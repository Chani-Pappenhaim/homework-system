import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Download } from 'lucide-react';
import { assignmentsApi } from '@/api/assignments.api';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileUpload } from '@/components/ui/file-upload';
import { getApiErrorMessage } from '@/lib/errors';
import { downloadBlob } from '@/lib/utils';

type ImportResult = { imported: number; skipped: number; errors: string[] };

/**
 * Creates assignments for many lessons of a course at once: a sheet with a row
 * per lesson (its id already filled in) that the teacher fills and uploads back.
 */
export function AssignmentsImportDialog({ courseId, open, onOpenChange }: {
  courseId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');

  const template = useMutation({
    mutationFn: () => assignmentsApi.downloadImportTemplate(courseId),
    onSuccess: (res) => downloadBlob(res.data as Blob, 'assignments-template.xlsx'),
    onError: (e) => setError(getApiErrorMessage(e, 'הורדת הקובץ נכשלה, נסי שוב')),
  });

  const upload = useMutation({
    mutationFn: (file: File) => assignmentsApi.importForCourse(courseId, file),
    onMutate: () => { setResult(null); setError(''); },
    onSuccess: (res) => {
      setResult(res.data.data);
      qc.invalidateQueries({ queryKey: ['course', courseId] });
      qc.invalidateQueries({ queryKey: ['lesson'] });
      qc.invalidateQueries({ queryKey: ['assignments'] });
    },
    onError: (e) => setError(getApiErrorMessage(e, 'הייבוא נכשל')),
  });

  function handleOpenChange(next: boolean) {
    if (!next) { setResult(null); setError(''); }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ייבוא מטלות מקובץ</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <ol className="space-y-1 text-sm text-ink">
            <li>1. מורידים את הקובץ - יש בו שורה לכל שיעור בקורס, עם מזהה השיעור כבר ממולא.</li>
            <li>2. ממלאים כותרת ותיאור לכל מטלה (מועד הגשה וסוגי קבצים - אופציונלי). שורה ריקה מדלגים עליה.</li>
            <li>3. מעלים את הקובץ. מטלה שכבר קיימת באותו שיעור עם אותה כותרת לא נוצרת שוב.</li>
          </ol>
          <p className="text-xs text-ink-soft">
            לשיעור עם כמה מטלות מעתיקים את השורה שלו (כולל מזהה השיעור) וממלאים כותרת אחרת.
          </p>
          <Button variant="outline" size="sm" onClick={() => template.mutate()} loading={template.isPending}>
            <Download size={13} /> הורדת קובץ התבנית
          </Button>

          {upload.isPending ? (
            <div className="rounded-card border border-dashed border-rule px-6 py-10 text-center text-sm text-ink/60">
              מייבא את המטלות…
            </div>
          ) : (
            <FileUpload accept=".xlsx" onFile={(file) => upload.mutate(file)} label="גרור קובץ Excel לכאן או לחצי לבחירה" />
          )}

          {error && <p className="text-sm text-coral">{error}</p>}

          {result && (
            <div className="space-y-2" role="status">
              <div className="flex flex-wrap gap-4 text-sm">
                <span className="inline-flex items-center gap-1 text-sage"><CheckCircle2 size={15} /> נוצרו {result.imported} מטלות</span>
                {result.skipped > 0 && <span className="text-ink-soft">{result.skipped} שורות ריקות - דולגו</span>}
                {result.errors.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-coral"><AlertCircle size={15} /> {result.errors.length} שורות לא נשמרו</span>
                )}
              </div>
              {result.errors.length > 0 && (
                <ul className="max-h-56 space-y-1 overflow-y-auto rounded-card border border-coral/30 bg-coral/5 px-4 py-3 text-xs text-ink/80">
                  {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
              <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)}>סגירה</Button>
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
