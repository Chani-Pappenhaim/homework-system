import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Download } from 'lucide-react';
import { gradesApi, type GradesImportPreview, type GradesImportResult, type PlannedGrade } from '@/api/grades.api';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileUpload } from '@/components/ui/file-upload';
import { getApiErrorMessage, getDownloadErrorMessage } from '@/lib/errors';
import { downloadBlob } from '@/lib/utils';

/** What a planned row changes, as short text for the preview. */
function describeChange(row: PlannedGrade): string {
  const parts: string[] = [];
  if (row.submissionScore !== undefined) parts.push(`ציון הגשה ${row.submissionScore}`);
  if (row.contentScore !== undefined) parts.push(`ציון תוכן ${row.contentScore}`);
  if (row.feedback !== undefined) parts.push('משוב');
  return parts.join(' · ');
}

/**
 * Grades a whole assignment from a sheet: download the course's students with
 * their grades, fill them in, check what the upload would change, then save.
 */
export function GradesImportDialog({ assignmentId, open, onOpenChange }: {
  assignmentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<GradesImportPreview | null>(null);
  const [result, setResult] = useState<GradesImportResult | null>(null);
  const [publish, setPublish] = useState(false);
  const [error, setError] = useState('');

  const template = useMutation({
    mutationFn: () => gradesApi.downloadImportTemplate(assignmentId),
    onSuccess: (res) => downloadBlob(res.data as Blob, 'assignment-grades.xlsx'),
    onError: async (e) => setError(await getDownloadErrorMessage(e, 'הורדת הקובץ נכשלה, נסי שוב')),
  });

  const check = useMutation({
    mutationFn: (picked: File) => gradesApi.previewImport(assignmentId, picked),
    onMutate: (picked) => { setFile(picked); setPreview(null); setResult(null); setError(''); },
    onSuccess: (res) => {
      setPreview(res.data.data);
      setPublish(false);
    },
    onError: (e) => setError(getApiErrorMessage(e, 'קריאת הקובץ נכשלה')),
  });

  const apply = useMutation({
    mutationFn: () => gradesApi.importGrades(assignmentId, file!, publish),
    onMutate: () => setError(''),
    onSuccess: (res) => {
      setResult(res.data.data);
      setPreview(null);
      qc.invalidateQueries({ queryKey: ['submissions', assignmentId] });
    },
    onError: (e) => setError(getApiErrorMessage(e, 'שמירת הציונים נכשלה')),
  });

  function handleOpenChange(next: boolean) {
    if (!next) { setFile(null); setPreview(null); setResult(null); setPublish(false); setError(''); }
    onOpenChange(next);
  }

  const canApply = !!preview && preview.errors.length === 0 && preview.updates.length > 0;
  const publishable = preview?.updates.filter((u) => u.publishable).length ?? 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ייבוא ציונים למטלה מקובץ</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <ol className="space-y-1 text-sm text-ink">
            <li>1. מורידים את הקובץ - הוא כולל את כל התלמידות בקורס, עם הציונים שכבר נשמרו.</li>
            <li>2. ממלאים ציון הגשה, ציון תוכן ומשוב. תא ריק משאיר את הערך כמו שהוא.</li>
            <li>3. מעלים את הקובץ ובודקים מה ישתנה, ורק אז שומרים.</li>
          </ol>
          <p className="text-xs text-ink-soft">ציון הוא מספר בין 0 ל-100. אי אפשר לתת ציון למי שלא הגישה.</p>
          <Button variant="outline" size="sm" onClick={() => template.mutate()} loading={template.isPending}>
            <Download size={13} /> הורדת הקובץ עם התלמידות
          </Button>

          {check.isPending || apply.isPending ? (
            <div className="rounded-card border border-dashed border-rule px-6 py-10 text-center text-sm text-ink/60">
              {apply.isPending ? 'שומר את הציונים…' : 'בודק את הקובץ…'}
            </div>
          ) : (
            !result && <FileUpload accept=".xlsx" onFile={(picked) => check.mutate(picked)} label="גרור קובץ Excel לכאן או לחצי לבחירה" />
          )}

          {error && <p className="text-sm text-coral">{error}</p>}

          {preview && (
            <div className="space-y-3" role="status">
              <div className="flex flex-wrap gap-4 text-sm">
                <span className="inline-flex items-center gap-1 text-sage"><CheckCircle2 size={15} /> {preview.updates.length} ציונים ישתנו</span>
                {preview.unchanged > 0 && <span className="text-ink-soft">{preview.unchanged} זהים למה ששמור</span>}
                {preview.empty > 0 && <span className="text-ink-soft">{preview.empty} בלי ציון - ידולגו</span>}
                {preview.errors.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-coral"><AlertCircle size={15} /> {preview.errors.length} שגיאות</span>
                )}
              </div>

              {preview.errors.length > 0 && (
                <>
                  <ul className="max-h-48 space-y-1 overflow-y-auto rounded-card border border-coral/30 bg-coral/5 px-4 py-3 text-xs text-ink/80">
                    {preview.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                  <p className="text-xs text-coral">אי אפשר לשמור קובץ עם שגיאות. יש לתקן אותן ולהעלות שוב.</p>
                </>
              )}

              {preview.updates.length > 0 && (
                <ul className="max-h-48 space-y-1 overflow-y-auto rounded-card border border-rule px-4 py-3 text-xs text-ink/80">
                  {preview.updates.map((u) => (
                    <li key={u.submissionId}><span className="font-semibold">{u.studentName}</span> - {describeChange(u)}</li>
                  ))}
                </ul>
              )}

              {canApply && publishable > 0 && (
                <label className="flex items-start gap-2 text-sm text-ink">
                  <input type="checkbox" className="mt-1" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
                  <span>
                    להציג את ציוני התוכן לתלמידות ולשלוח להן מייל ({publishable} תלמידות)
                    <span className="block text-xs text-ink-soft">בלי זה הציונים נשמרים ונשארים מוסתרים עד אישור, כמו בציון ידני.</span>
                  </span>
                </label>
              )}

              <div className="flex gap-2">
                <Button size="sm" onClick={() => apply.mutate()} disabled={!canApply} loading={apply.isPending}>שמירת הציונים</Button>
                <Button size="sm" variant="outline" onClick={() => handleOpenChange(false)}>ביטול</Button>
              </div>
            </div>
          )}

          {result && (
            <div className="space-y-2" role="status">
              <div className="flex flex-wrap gap-4 text-sm">
                <span className="inline-flex items-center gap-1 text-sage"><CheckCircle2 size={15} /> נשמרו {result.updated} ציונים</span>
                {result.published > 0 && <span className="text-ink-soft">{result.published} ציוני תוכן הוצגו לתלמידות</span>}
                {result.unchanged > 0 && <span className="text-ink-soft">{result.unchanged} היו זהים</span>}
              </div>
              <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)}>סגירה</Button>
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
