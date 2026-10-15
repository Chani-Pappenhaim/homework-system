import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Download, Info } from 'lucide-react';
import { groupsApi, type StudentImportResult } from '@/api/groups.api';
import { Button } from '@/components/ui/button';
import { FileUpload } from '@/components/ui/file-upload';
import { useToast } from '@/components/ui/toast';
import { getApiErrorMessage } from '@/lib/errors';
import { downloadBlob } from '@/lib/utils';

const COLUMNS = [
  { col: 'A', name: 'שם מלא', required: true, note: '' },
  { col: 'B', name: 'אימייל', required: true, note: 'כל אימייל פעם אחת בקובץ' },
  { col: 'C', name: 'שם משתמש GitHub', required: false, note: 'או קישור לפרופיל, אפשר להשאיר ריק' },
];

interface Props {
  groupId: string;
  onDone: () => void;
}

/**
 * Imports students from Excel in two steps: the file is checked first and every
 * row that can't be added is listed, then the teacher chooses to add only the
 * valid rows or to fix the file and upload it again.
 */
export function StudentsImportPanel({ groupId, onDone }: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [check, setCheck] = useState<StudentImportResult | null>(null);
  const [error, setError] = useState('');

  const template = useMutation({
    mutationFn: () => groupsApi.downloadImportTemplate(),
    onSuccess: (res) => downloadBlob(res.data as Blob, 'students-import-template.xlsx'),
    onError: () => setError('הורדת הקובץ לדוגמא נכשלה, נסי שוב'),
  });

  const checkFile = useMutation({
    mutationFn: (f: File) => groupsApi.importStudents(groupId, f, true),
    onMutate: (f) => { setFile(f); setCheck(null); setError(''); },
    onSuccess: (res) => setCheck(res.data.data),
    onError: (e) => { setFile(null); setError(getApiErrorMessage(e, 'בדיקת הקובץ נכשלה')); },
  });

  const runImport = useMutation({
    mutationFn: () => groupsApi.importStudents(groupId, file!),
    onSuccess: (res) => {
      const result = res.data.data;
      qc.invalidateQueries({ queryKey: ['group', groupId] });
      if (result.errors.length > 0) {
        // Something changed since the check (e.g. a row failed to save) — keep the list on screen.
        setCheck(result);
        toast.success(`נוספו ${result.toAdd} תלמידות`);
        return;
      }
      toast.success(result.toAdd === 1 ? 'נוספה תלמידה אחת' : `נוספו ${result.toAdd} תלמידות`);
      onDone();
    },
    onError: (e) => setError(getApiErrorMessage(e, 'הייבוא נכשל')),
  });

  function reset() {
    setFile(null);
    setCheck(null);
    setError('');
  }

  const errorCount = check?.errors.length ?? 0;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5 text-xs text-ink/70">
        <p>כל שורה היא תלמידה אחת. השורה הראשונה היא שורת כותרות ולא נקראת. סדר העמודות קובע, לא שם הכותרת:</p>
        <table className="w-full border-collapse text-right">
          <thead>
            <tr className="border-b border-rule/30 text-ink/60">
              <th className="py-1 pl-2 font-semibold">עמודה</th>
              <th className="py-1 pl-2 font-semibold">תוכן</th>
              <th className="py-1 font-semibold">חובה?</th>
            </tr>
          </thead>
          <tbody>
            {COLUMNS.map((c) => (
              <tr key={c.col} className="border-b border-rule/10 align-top">
                <td className="py-1 pl-2 font-mono" dir="ltr">{c.col}</td>
                <td className="py-1 pl-2">
                  {c.name}
                  {c.note && <span className="block text-ink/50">{c.note}</span>}
                </td>
                <td className={c.required ? 'py-1 font-semibold text-coral' : 'py-1 text-ink/50'}>
                  {c.required ? 'חובה' : 'רשות'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>לפני שמשהו נוסף, הקובץ נבדק ומוצגות כל השורות הבעייתיות.</p>
      </div>
      <button
        type="button"
        onClick={() => template.mutate()}
        disabled={template.isPending}
        className="flex items-center gap-1.5 text-xs font-semibold text-clay hover:underline disabled:opacity-50"
      >
        <Download size={13} /> הורדת קובץ לדוגמא
      </button>

      {checkFile.isPending ? (
        <div className="rounded-card border border-dashed border-rule px-6 py-10 text-center text-sm text-ink/60">
          בודק את הקובץ…
        </div>
      ) : !check && (
        <FileUpload accept=".xlsx" onFile={(f) => checkFile.mutate(f)} label="גרור קובץ Excel לכאן" />
      )}

      {error && <p className="text-sm text-coral" role="alert">{error}</p>}

      {check && (
        <div className="space-y-3" role="status">
          {file && <p className="text-xs text-ink/50">קובץ: <span dir="auto">{file.name}</span> · {check.totalRows} שורות</p>}
          <ul className="space-y-1 text-sm">
            <li className="flex items-center gap-1.5 text-sage">
              <CheckCircle2 size={15} />
              {check.dryRun ? `${check.toAdd} תלמידות תקינות יתווספו לקבוצה` : `נוספו ${check.toAdd} תלמידות`}
            </li>
            {check.alreadyInGroup > 0 && (
              <li className="flex items-center gap-1.5 text-ink/60">
                <Info size={15} /> {check.alreadyInGroup} כבר נמצאות בקבוצה - ידולגו
              </li>
            )}
            {errorCount > 0 && (
              <li className="flex items-center gap-1.5 text-coral">
                <AlertCircle size={15} /> {errorCount === 1 ? 'שורה אחת עם שגיאה' : `${errorCount} שורות עם שגיאות`} - לא יתווספו
              </li>
            )}
          </ul>

          {errorCount > 0 && (
            <ul className="max-h-56 space-y-1 overflow-y-auto rounded-card border border-coral/30 bg-coral/5 px-4 py-3 text-xs text-ink/80">
              {check.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}

          {check.dryRun ? (
            <div className="flex flex-wrap gap-2">
              {check.toAdd > 0 && (
                <Button size="sm" loading={runImport.isPending} onClick={() => runImport.mutate()}>
                  {errorCount > 0
                    ? `הוסיפי רק את ${check.toAdd} השורות התקינות`
                    : check.toAdd === 1 ? 'הוסיפי תלמידה אחת' : `הוסיפי ${check.toAdd} תלמידות`}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={reset} disabled={runImport.isPending}>
                {errorCount > 0 ? 'לא להוסיף - אתקן את הקובץ' : check.toAdd > 0 ? 'ביטול' : 'בחירת קובץ אחר'}
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={onDone}>סגירה</Button>
          )}
          {check.dryRun && check.toAdd === 0 && (
            <p className="text-xs text-ink/60">אין בקובץ תלמידות להוספה. יש לתקן את השורות ולהעלות שוב.</p>
          )}
        </div>
      )}
    </div>
  );
}
