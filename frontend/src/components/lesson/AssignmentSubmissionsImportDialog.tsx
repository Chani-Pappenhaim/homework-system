import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Download } from 'lucide-react';
import { submissionsApi, type AssignmentSubmissionsImportResult } from '@/api/submissions.api';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileUpload } from '@/components/ui/file-upload';
import { getApiErrorMessage } from '@/lib/errors';
import { downloadBlob } from '@/lib/utils';

/**
 * Brings in one assignment's submissions that the students handed in another
 * way (by email, before the lesson was on the site): a sheet of the course's
 * students, where the teacher fills in each one's repo.
 */
export function AssignmentSubmissionsImportDialog({ assignmentId, open, onOpenChange }: {
  assignmentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [result, setResult] = useState<AssignmentSubmissionsImportResult | null>(null);
  const [error, setError] = useState('');

  const template = useMutation({
    mutationFn: () => submissionsApi.downloadAssignmentImportTemplate(assignmentId),
    onSuccess: (res) => downloadBlob(res.data as Blob, 'assignment-submissions.xlsx'),
    onError: (e) => setError(getApiErrorMessage(e, 'הורדת הקובץ נכשלה, נסי שוב')),
  });

  const upload = useMutation({
    mutationFn: (file: File) => submissionsApi.importAssignmentSubmissions(assignmentId, file),
    onMutate: () => { setResult(null); setError(''); },
    onSuccess: (res) => {
      setResult(res.data.data);
      qc.invalidateQueries({ queryKey: ['submissions', assignmentId] });
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
          <DialogTitle>ייבוא הגשות למטלה מקובץ</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <ol className="space-y-1 text-sm text-ink">
            <li>1. מורידים את הקובץ - הוא כבר כולל את כל התלמידות בקורס, ואת הריפו של מי שכבר הגישה.</li>
            <li>2. ממלאים ריפו למי שהגישה. שורה בלי ריפו מדלגים עליה.</li>
            <li>3. מעלים את הקובץ. כל ריפו נבדק מול GitHub לפני שההגשה נשמרת.</li>
          </ol>
          <p className="text-xs text-ink-soft">
            בעמודת הריפו אפשר לכתוב קישור מלא, owner/repo, או רק את שם הריפו (מחשבון ה-GitHub של התלמידה).
            הגשה שמיובאת כאן לא נחשבת הגשה באיחור.
          </p>
          <Button variant="outline" size="sm" onClick={() => template.mutate()} loading={template.isPending}>
            <Download size={13} /> הורדת הקובץ עם התלמידות
          </Button>

          {upload.isPending ? (
            <div className="rounded-card border border-dashed border-rule px-6 py-10 text-center text-sm text-ink/60">
              מייבא ובודק את הריפואים מול GitHub…
            </div>
          ) : (
            <FileUpload accept=".xlsx" onFile={(file) => upload.mutate(file)} label="גרור קובץ Excel לכאן או לחצי לבחירה" />
          )}

          {error && <p className="text-sm text-coral">{error}</p>}

          {result && (
            <div className="space-y-2" role="status">
              <div className="flex flex-wrap gap-4 text-sm">
                <span className="inline-flex items-center gap-1 text-sage"><CheckCircle2 size={15} /> נשמרו {result.imported} הגשות</span>
                {result.unchanged > 0 && <span className="text-ink-soft">{result.unchanged} כבר היו מוגשות כך</span>}
                {result.empty > 0 && <span className="text-ink-soft">{result.empty} בלי ריפו - דולגו</span>}
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
