import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarPlus, CheckCircle2, Download } from 'lucide-react';
import { attendanceApi, type ImportResult } from '@/api/attendance.api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileUpload } from '@/components/ui/file-upload';
import { useToast } from '@/components/ui/toast';
import { getApiErrorMessage } from '@/lib/errors';
import { downloadBlob } from '@/lib/utils';

/** The template's columns, in the same order and wording as the file itself. */
const COLUMNS: { name: string; required: boolean; hint: string }[] = [
  { name: 'מייל תלמידה', required: true, hint: 'כך מזהים את התלמידה - חייב להיות של תלמידה בקורס' },
  { name: 'תאריך', required: true, hint: 'למשל 15/10/2026' },
  { name: 'סטטוס', required: true, hint: 'נוכחת / חסרה / חלקית' },
  { name: 'שם', required: false, hint: 'לנוחות הקריאה בלבד' },
  { name: 'הערה', required: false, hint: 'הערה פנימית - התלמידה לא רואה' },
  { name: 'נושא המפגש', required: false, hint: 'מבדיל בין שני מפגשים באותו יום' },
];

export function ImportAttendanceDialog({ courseId, onClose }: { courseId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  // The check of the file (dryRun), then - once confirmed - what was saved.
  const [result, setResult] = useState<ImportResult | null>(null);

  const template = useMutation({
    mutationFn: () => attendanceApi.downloadTemplate(courseId),
    onSuccess: (res) => downloadBlob(res.data as Blob, 'attendance-template.xlsx'),
    onError: (e) => toast.error(getApiErrorMessage(e, 'הורדת התבנית נכשלה')),
  });

  // The file is checked first, so the teacher sees what will change - and which
  // new meetings will open - before anything is saved.
  const check = useMutation({
    mutationFn: (f: File) => attendanceApi.importFile(courseId, f, true),
    onMutate: (f) => { setFile(f); setResult(null); },
    onSuccess: (res) => setResult(res.data.data),
    onError: (e) => { setFile(null); toast.error(getApiErrorMessage(e, 'בדיקת הקובץ נכשלה')); },
  });

  const upload = useMutation({
    mutationFn: () => attendanceApi.importFile(courseId, file!),
    onSuccess: (res) => {
      setResult(res.data.data);
      qc.invalidateQueries({ queryKey: ['attendance', courseId] });
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'הייבוא נכשל')),
  });

  function reset() {
    setFile(null);
    setResult(null);
  }

  const dry = result?.dryRun ?? false;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>ייבוא נוכחות מ-Excel</DialogTitle></DialogHeader>
        <DialogBody className="space-y-4">
          {result ? (
            <div className="space-y-3">
              {file && <p className="text-xs text-ink-soft">קובץ: <span dir="auto">{file.name}</span></p>}
              <div className="flex items-start gap-2 rounded-lg bg-sage/12 p-3 text-sm text-ink">
                <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-sage" />
                <div>
                  <p className="font-semibold">
                    {dry
                      ? (result.saved > 0 ? `${result.saved} סימונים תקינים ייקלטו` : 'אין בקובץ סימונים תקינים לקליטה')
                      : `נשמרו ${result.saved} סימונים`}
                  </p>
                  {result.saved > 0 && (
                    <p className="text-ink-soft">
                      {[
                        result.updated > 0 && `${result.updated} ${dry ? 'ישנו' : 'שינו'} סימון קיים`,
                        result.added > 0 && `${result.added} ${dry ? 'יתווספו' : 'נוספו'} לתלמידות שלא היו מסומנות`,
                        result.unchanged > 0 && `${result.unchanged} כבר מסומנים כך`,
                      ].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {result.skipped > 0 && <p className="text-ink-soft">{result.skipped} שורות ריקות {dry ? 'ידולגו' : 'דולגו'}</p>}
                </div>
              </div>
              {result.newSessions.length > 0 && (
                <div className="rounded-lg border border-butter bg-butter/15 p-3 text-sm text-ink">
                  <p className="mb-1 flex items-center gap-1.5 font-semibold">
                    <CalendarPlus size={15} /> {dry ? 'ייפתחו' : 'נפתחו'} {result.newSessions.length} מפגשים חדשים
                  </p>
                  <ul className="max-h-32 space-y-0.5 overflow-y-auto text-xs">
                    {result.newSessions.map((s) => <li key={s} dir="auto">{s}</li>)}
                  </ul>
                  {dry && <p className="mt-1.5 text-xs text-ink-soft">אין עדיין מפגש בתאריכים האלה. אם התכוונת לעדכן מפגש קיים - כדאי לבדוק שהתאריכים בקובץ נכונים.</p>}
                </div>
              )}
              {result.errors.length > 0 && (
                <div className="rounded-lg border border-coral/40 bg-coral/8 p-3">
                  <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-coral">
                    <AlertTriangle size={15} /> {result.errors.length} שורות {dry ? 'לא ייקלטו' : 'לא נקלטו'}
                  </p>
                  <ul className="max-h-48 space-y-0.5 overflow-y-auto text-xs text-ink">
                    {result.errors.map((err, i) => <li key={i}>{err}</li>)}
                  </ul>
                  <p className="mt-2 text-xs text-ink-soft">
                    {dry
                      ? 'אפשר לקלוט עכשיו רק את השורות התקינות, או לתקן את הקובץ ולהעלות אותו שוב.'
                      : 'אפשר לתקן את השורות האלה בקובץ ולהעלות אותו שוב - סימונים קיימים פשוט יתעדכנו.'}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <>
              <ol className="space-y-1 text-sm text-ink">
                <li>1. מורידים את קובץ הדוגמה - הוא כבר כולל את כל התלמידות בקורס.</li>
                <li>2. ממלאים שורה לכל תלמידה בכל מפגש.</li>
                <li>3. מעלים את הקובץ. מפגש שעוד לא קיים ייפתח לבד לפי התאריך.</li>
              </ol>

              <div className="overflow-hidden rounded-lg border border-rule">
                <table className="w-full text-sm">
                  <thead className="bg-ground text-xs text-ink-soft">
                    <tr><th className="px-3 py-1.5 text-start font-semibold">עמודה</th><th className="px-3 py-1.5 text-start font-semibold">מה כותבים</th></tr>
                  </thead>
                  <tbody>
                    {COLUMNS.map((c) => (
                      <tr key={c.name} className="border-t border-rule">
                        <td className="whitespace-nowrap px-3 py-1.5">
                          <span className="font-semibold text-ink">{c.name}</span>{' '}
                          <span className={c.required ? 'rounded bg-coral/12 px-1.5 text-[11px] font-semibold text-coral' : 'rounded bg-ground px-1.5 text-[11px] text-ink-soft'}>
                            {c.required ? 'חובה' : 'רשות'}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-xs text-ink-soft">{c.hint}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Button variant="outline" onClick={() => template.mutate()} loading={template.isPending}>
                <Download size={14} /> הורדת קובץ דוגמה
              </Button>

              {check.isPending
                ? <p className="py-6 text-center text-sm text-ink-soft">בודק את הקובץ…</p>
                : <FileUpload accept=".xlsx" onFile={(f) => check.mutate(f)} label="גרור קובץ Excel לכאן או לחצי לבחירה" />}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          {result?.dryRun ? (
            <>
              <Button variant="outline" onClick={reset} disabled={upload.isPending}>
                {result.errors.length > 0 ? 'לא לקלוט - אתקן את הקובץ' : 'בחירת קובץ אחר'}
              </Button>
              {result.saved > 0 && (
                <Button onClick={() => upload.mutate()} loading={upload.isPending}>
                  {result.errors.length > 0 ? `קליטת ${result.saved} הסימונים התקינים` : `קליטת ${result.saved} סימונים`}
                </Button>
              )}
            </>
          ) : (
            <>
              {result && <Button onClick={reset} variant="outline">ייבוא קובץ נוסף</Button>}
              <Button variant={result ? 'default' : 'outline'} onClick={onClose}>{result ? 'סיום' : 'סגירה'}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
