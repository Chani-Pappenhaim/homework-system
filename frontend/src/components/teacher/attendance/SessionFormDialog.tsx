import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link2, Users } from 'lucide-react';
import { attendanceApi, type AttendanceLessonDTO, type AttendanceSessionDTO } from '@/api/attendance.api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateField } from '@/components/ui/date-field';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { getApiErrorMessage } from '@/lib/errors';
import { todayISO, cn } from '@/lib/utils';
import { dayValue, formatDay } from '@/lib/attendance';

interface Props {
  courseId: string;
  lessons: AttendanceLessonDTO[];
  /** The meeting being edited; absent when opening a new one. */
  session?: AttendanceSessionDTO;
  onClose: () => void;
  onSaved: (sessionId: string) => void;
}

export function SessionFormDialog({ courseId, lessons, session, onClose, onSaved }: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const [kind, setKind] = useState<'lesson' | 'class'>(session && !session.lessonId ? 'class' : lessons.length ? 'lesson' : 'class');
  const [lessonId, setLessonId] = useState(session?.lessonId ?? '');
  const [date, setDate] = useState(session ? dayValue(session.date) : todayISO());
  const [title, setTitle] = useState(session?.title ?? '');

  function pickLesson(id: string) {
    setLessonId(id);
    // A lesson's own date is almost always the meeting date.
    const lesson = lessons.find((l) => l.id === id);
    if (lesson?.lessonDate && !session) setDate(dayValue(lesson.lessonDate));
  }

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        date,
        lessonId: kind === 'lesson' ? lessonId || null : null,
        title: title.trim() || null,
      };
      if (session) {
        await attendanceApi.updateSession(session.id, body);
        return session.id;
      }
      const res = await attendanceApi.createSession(courseId, body);
      return res.data.data.session.id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['attendance', courseId] });
      toast.success(session ? 'המפגש עודכן' : 'המפגש נפתח');
      onSaved(id);
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'המפגש לא נשמר')),
  });

  const valid = !!date && (kind === 'class' || !!lessonId);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <form onSubmit={(e) => { e.preventDefault(); if (valid) save.mutate(); }}>
          <DialogHeader><DialogTitle>{session ? 'עריכת מפגש' : 'מפגש חדש'}</DialogTitle></DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="סוג המפגש">
              {([
                ['lesson', Link2, 'שיעור מהאתר', 'נוכחות + מטלות השיעור'],
                ['class', Users, 'מפגש שלא באתר', 'למשל שיעור פרונטלי בלבד'],
              ] as const).map(([key, Icon, label, hint]) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={kind === key}
                  disabled={key === 'lesson' && !lessons.length}
                  onClick={() => setKind(key)}
                  className={cn(
                    'rounded-lg border p-3 text-start transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                    kind === key ? 'border-clay bg-clay/8 ring-2 ring-clay/20' : 'border-rule bg-sheet hover:bg-ground',
                  )}
                >
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-ink"><Icon size={15} /> {label}</span>
                  <span className="mt-0.5 block text-xs text-ink-soft">{hint}</span>
                </button>
              ))}
            </div>

            {kind === 'lesson' && (
              <div className="flex flex-col gap-1">
                <Label htmlFor="session-lesson">שיעור</Label>
                <select
                  id="session-lesson"
                  className="w-full rounded-input border border-rule bg-sheet px-3 py-2 text-sm text-ink focus:border-clay focus:outline-none"
                  value={lessonId}
                  onChange={(e) => pickLesson(e.target.value)}
                >
                  <option value="">בחירת שיעור…</option>
                  {lessons.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.topic}{l.lessonDate ? ` · ${formatDay(l.lessonDate)}` : ''}{l.hidden ? ' (מוסתר)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <DateField label="תאריך המפגש" value={date} onChange={setDate} />
            <Input
              label={kind === 'lesson' ? 'כותרת (רשות — ברירת המחדל היא נושא השיעור)' : 'נושא המפגש (רשות)'}
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
            />
          </DialogBody>
          <DialogFooter>
            <Button type="submit" loading={save.isPending} disabled={!valid}>{session ? 'שמירה' : 'פתיחת המפגש'}</Button>
            <Button type="button" variant="outline" onClick={onClose}>ביטול</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
