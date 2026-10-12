import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Download } from 'lucide-react';
import { submissionsApi, type SubmissionsImportResult } from '@/api/submissions.api';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileUpload } from '@/components/ui/file-upload';
import { getApiErrorMessage } from '@/lib/errors';
import { downloadBlob } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Imports GitHub submissions from an Excel sheet and lists every row that was not imported. */
export function SubmissionsImportDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [result, setResult] = useState<SubmissionsImportResult | null>(null);
  const [error, setError] = useState('');

  const template = useMutation({
    mutationFn: () => submissionsApi.downloadImportTemplate(),
    onSuccess: (res) => downloadBlob(res.data as Blob, 'submissions-import-template.xlsx'),
    onError: () => setError('הורדת הקובץ לדוגמא נכשלה, נסי שוב'),
  });

  const upload = useMutation({
    mutationFn: (file: File) => submissionsApi.importSubmissions(file),
    onMutate: () => { setResult(null); setError(''); },
    onSuccess: (res) => {
      setResult(res.data.data);
      if (res.data.data.imported > 0) {
        qc.invalidateQueries({ queryKey: ['report'] });
        qc.invalidateQueries({ queryKey: ['students'] });
      }
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  function handleOpenChange(next: boolean) {
    if (!next) { setResult(null); setError(''); }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ייבוא הגשות מ-Excel</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1 text-xs text-ink/70">
            <p>עמודות: שם המטלה | מייל התלמידה | ריפו.</p>
            <p>
              בעמודת הריפו אפשר לכתוב שם ריפו בלבד (מחשבון ה-GitHub של התלמידה), owner/repo או קישור מלא.
              כל ריפו נבדק מול GitHub לפני שההגשה נשמרת, והגשה קיימת מתעדכנת לקישור החדש.
            </p>
          </div>
          <button
            type="button"
            onClick={() => template.mutate()}
            disabled={template.isPending}
            className="flex items-center gap-1.5 text-xs font-semibold text-clay hover:underline disabled:opacity-50"
          >
            <Download size={13} /> הורדת קובץ לדוגמא
          </button>

          {upload.isPending ? (
            <div className="rounded-card border border-dashed border-rule px-6 py-10 text-center text-sm text-ink/60">
              מייבא ובודק את הריפואים מול GitHub…
            </div>
          ) : (
            <FileUpload accept=".xlsx" onFile={(file) => upload.mutate(file)} label="גרור קובץ Excel לכאן" />
          )}

          {error && <p className="text-sm text-coral">{error}</p>}

          {result && (
            <div className="space-y-2" role="status">
              <div className="flex flex-wrap gap-4 text-sm">
                <span className="inline-flex items-center gap-1 text-sage"><CheckCircle2 size={15} /> יובאו {result.imported}</span>
                {result.errors.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-coral"><AlertCircle size={15} /> {result.errors.length} שורות לא יובאו</span>
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
