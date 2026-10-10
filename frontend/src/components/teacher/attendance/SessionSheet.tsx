import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCheck, Edit, Link2, MessageSquarePlus, Plus, Trash2, Check } from 'lucide-react';
import {
  attendanceApi,
  type AttendanceStatus,
  type CourseAttendanceDTO,
  type AttendanceSessionDTO,
  type RosterStudent,
} from '@/api/attendance.api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { getApiErrorMessage } from '@/lib/errors';
import { STATUS_META, STATUS_ORDER, countStatuses, formatFullDay } from '@/lib/attendance';
import { cn } from '@/lib/utils';

type Patch = (draft: CourseAttendanceDTO) => CourseAttendanceDTO;

/** Optimistic writes: the screen changes at once and rolls back if the server refuses. */
export function useAttendanceWrite(courseId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  const key = ['attendance', courseId];
  return function write<V>(patch: (vars: V) => Patch, run: (vars: V) => Promise<unknown>) {
    return {
      mutationFn: run,
      onMutate: async (vars: V) => {
        await qc.cancelQueries({ queryKey: key });
        const previous = qc.getQueryData<{ data: { data: CourseAttendanceDTO } }>(key);
        if (previous) {
          qc.setQueryData(key, { ...previous, data: { ...previous.data, data: patch(vars)(previous.data.data) } });
        }
        return { previous };
      },
      onError: (err: unknown, _vars: V, ctx?: { previous?: unknown }) => {
        if (ctx?.previous) qc.setQueryData(key, ctx.previous);
        toast.error(getApiErrorMessage(err, 'השינוי לא נשמר'));
      },
      onSettled: () => qc.invalidateQueries({ queryKey: key }),
    };
  };
}

const mapSession = (sessionId: string, fn: (s: AttendanceSessionDTO) => AttendanceSessionDTO): Patch =>
  (d) => ({ ...d, sessions: d.sessions.map((s) => (s.id === sessionId ? fn(s) : s)) });

type Mark = { studentId: string; status: AttendanceStatus | null; note?: string | null };

function applyMarks(session: AttendanceSessionDTO, marks: Mark[]): AttendanceSessionDTO {
  let records = session.records;
  for (const m of marks) {
    const old = records.find((r) => r.studentId === m.studentId);
    records = records.filter((r) => r.studentId !== m.studentId);
    if (m.status) records = [...records, { studentId: m.studentId, status: m.status, note: m.note !== undefined ? m.note : old?.note ?? null }];
  }
  return { ...session, records };
}

interface Props {
  courseId: string;
  data: CourseAttendanceDTO;
  session: AttendanceSessionDTO;
  roster: RosterStudent[];
  onEdit: () => void;
  onDeleted: () => void;
}

export function SessionSheet({ courseId, data, session, roster, onEdit, onDeleted }: Props) {
  const write = useAttendanceWrite(courseId);
  const qc = useQueryClient();
  const toast = useToast();
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [newHomework, setNewHomework] = useState('');
  const [addingHomework, setAddingHomework] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [homeworkToDelete, setHomeworkToDelete] = useState<{ id: string; title: string } | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);

  const lesson = data.lessons.find((l) => l.id === session.lessonId) ?? null;
  const recordOf = (studentId: string) => session.records.find((r) => r.studentId === studentId);
  const counts = countStatuses(roster.map((s) => recordOf(s.id)?.status));

  const marks = useMutation(write<Mark[]>(
    (m) => mapSession(session.id, (s) => applyMarks(s, m)),
    (m) => attendanceApi.saveRecords(session.id, m),
  ));
  const homeworkMark = useMutation(write<{ homeworkId: string; studentId: string; done: boolean }>(
    (v) => mapSession(session.id, (s) => ({
      ...s,
      homework: s.homework.map((h) => (h.id !== v.homeworkId ? h : {
        ...h, doneBy: v.done ? [...h.doneBy, v.studentId] : h.doneBy.filter((id) => id !== v.studentId),
      })),
    })),
    (v) => attendanceApi.saveHomeworkMarks(v.homeworkId, [{ studentId: v.studentId, done: v.done }]),
  ));
  const invalidate = () => qc.invalidateQueries({ queryKey: ['attendance', courseId] });
  const addHomework = useMutation({
    mutationFn: (title: string) => attendanceApi.addHomework(session.id, title),
    onSuccess: () => { setNewHomework(''); setAddingHomework(false); invalidate(); },
    onError: (e) => toast.error(getApiErrorMessage(e, 'שיעורי הבית לא נוספו')),
  });
  const renameHomework = useMutation({
    mutationFn: (v: { id: string; title: string }) => attendanceApi.renameHomework(v.id, v.title),
    onSuccess: () => { setRenaming(null); invalidate(); },
    onError: (e) => toast.error(getApiErrorMessage(e, 'השם לא נשמר')),
  });
  const deleteHomework = useMutation({
    mutationFn: (id: string) => attendanceApi.deleteHomework(id),
    onSuccess: () => { setHomeworkToDelete(null); invalidate(); },
    onError: (e) => toast.error(getApiErrorMessage(e, 'המחיקה נכשלה')),
  });
  const deleteSession = useMutation({
    mutationFn: () => attendanceApi.deleteSession(session.id),
    onSuccess: () => { setConfirmDelete(false); onDeleted(); invalidate(); toast.success('המפגש נמחק'); },
    onError: (e) => toast.error(getApiErrorMessage(e, 'המחיקה נכשלה')),
  });

  function setStatus(studentId: string, status: AttendanceStatus) {
    // Pressing the current status again takes the mark away.
    const current = recordOf(studentId)?.status;
    marks.mutate([{ studentId, status: current === status ? null : status }]);
  }

  function markRestPresent() {
    const rest = roster.filter((s) => !recordOf(s.id)).map((s) => ({ studentId: s.id, status: 'PRESENT' as const }));
    if (rest.length) marks.mutate(rest);
  }

  function saveNote(studentId: string) {
    const record = recordOf(studentId);
    setNoteFor(null);
    if (!record || (record.note ?? '') === noteDraft.trim()) return;
    marks.mutate([{ studentId, status: record.status, note: noteDraft.trim() || null }]);
  }

  const siteWork = lesson?.assignments ?? [];
  const title = session.title ?? lesson?.topic ?? 'מפגש';

  return (
    <Card accent="indigo">
      <CardContent className="space-y-4 pt-5">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-ink-soft">{formatFullDay(session.date)}</p>
            <h2 className="font-display text-xl font-bold text-ink">{title}</h2>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {lesson
                ? <Badge variant="secondary"><Link2 size={11} /> שיעור באתר{lesson.hidden ? ' (מוסתר)' : ''}</Badge>
                : <Badge variant="muted">מפגש שלא באתר</Badge>}
            </div>
          </div>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" onClick={onEdit}><Edit size={13} /> עריכה</Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} aria-label="מחיקת המפגש"><Trash2 size={13} /></Button>
          </div>
        </div>

        {/* Running tally + the one bulk action that matters */}
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-ground px-3 py-2 text-sm" aria-live="polite">
          {STATUS_ORDER.map((st) => {
            const { label, icon: Icon, text } = STATUS_META[st];
            return <span key={st} className={cn('flex items-center gap-1 font-semibold', text)}><Icon size={14} /> {label}: {counts[st]}</span>;
          })}
          <span className={cn('font-semibold', counts.none ? 'text-ink' : 'text-ink-soft')}>לא סומנו: {counts.none}</span>
          {counts.none > 0 && (
            <Button size="sm" variant="secondary" className="ms-auto" onClick={markRestPresent} loading={marks.isPending}>
              <CheckCheck size={14} /> {counts.none === roster.length ? 'כולן נוכחות' : 'כל השאר נוכחות'}
            </Button>
          )}
        </div>

        {roster.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-soft">אין תלמידות רשומות לקורס.</p>
        ) : (
          // Sideways scroll only when homework columns outgrow a narrow screen.
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-right text-xs text-ink-soft">
                  <th className="border-b border-rule py-2 pe-3 font-semibold">תלמידה</th>
                  <th className="border-b border-rule py-2 pe-3 font-semibold">נוכחות</th>
                  {siteWork.map((a) => (
                    <th key={a.id} className="border-b border-rule px-2 py-2 text-center font-semibold" title="מטלה מהאתר — מסומנת אוטומטית לפי הגשה">
                      <span className="block max-w-[7rem] truncate">{a.title}</span>
                      <span className="block text-[10px] font-normal">מהאתר · {a.submittedBy.length} הגישו</span>
                    </th>
                  ))}
                  {session.homework.map((h) => (
                    <th key={h.id} className="border-b border-rule px-2 py-2 text-center font-semibold">
                      <span className="flex items-center justify-center gap-0.5">
                        <button className="max-w-[7rem] truncate hover:text-ink" title={`${h.title} — לחיצה לשינוי השם`} onClick={() => setRenaming({ id: h.id, title: h.title })}>{h.title}</button>
                        <button aria-label={`מחיקת ${h.title}`} className="text-ink-soft/60 hover:text-coral" onClick={() => setHomeworkToDelete(h)}><Trash2 size={11} /></button>
                      </span>
                      <span className="block text-[10px] font-normal">נוסף · {h.doneBy.length} הכינו</span>
                    </th>
                  ))}
                  <th className="border-b border-rule py-2 font-semibold">הערה</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((s) => {
                  const record = recordOf(s.id);
                  return (
                    <tr key={s.id} className="hover:bg-ground/60">
                      <td className="border-b border-rule/60 py-2 pe-3">
                        <span className="font-semibold text-ink">{s.name}</span>
                        {s.source === 'access' && <span className="ms-1.5 text-[10px] text-ink-soft">גישה אישית</span>}
                      </td>
                      <td className="border-b border-rule/60 py-2 pe-3">
                        <div role="radiogroup" aria-label={`נוכחות — ${s.name}`} className="inline-flex overflow-hidden rounded-lg border border-rule">
                          {STATUS_ORDER.map((st) => {
                            const { label, icon: Icon, active } = STATUS_META[st];
                            const on = record?.status === st;
                            return (
                              <button
                                key={st}
                                role="radio"
                                aria-checked={on}
                                onClick={() => setStatus(s.id, st)}
                                className={cn(
                                  'flex items-center gap-1 border-s border-rule px-2.5 py-1.5 text-xs font-semibold transition-colors first:border-s-0',
                                  on ? active : 'bg-sheet text-ink-soft hover:bg-ground hover:text-ink',
                                )}
                              >
                                <Icon size={13} /> <span className="hidden sm:inline">{label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </td>
                      {siteWork.map((a) => {
                        const done = a.submittedBy.includes(s.id);
                        return (
                          <td key={a.id} className="border-b border-rule/60 px-2 py-2 text-center">
                            {done
                              ? <Check size={15} className="inline text-sage" aria-label="הגישה" />
                              : <span className="text-ink-soft/50" aria-label="לא הגישה">—</span>}
                          </td>
                        );
                      })}
                      {session.homework.map((h) => {
                        const done = h.doneBy.includes(s.id);
                        return (
                          <td key={h.id} className="border-b border-rule/60 px-2 py-2 text-center">
                            <input
                              type="checkbox"
                              className="size-4 accent-sage"
                              checked={done}
                              aria-label={`${h.title} — ${s.name}`}
                              onChange={() => homeworkMark.mutate({ homeworkId: h.id, studentId: s.id, done: !done })}
                            />
                          </td>
                        );
                      })}
                      <td className="border-b border-rule/60 py-2">
                        {noteFor === s.id ? (
                          <input
                            autoFocus
                            className="w-full min-w-[10rem] rounded-input border border-clay bg-sheet px-2 py-1 text-xs focus:outline-none"
                            value={noteDraft}
                            maxLength={500}
                            placeholder="הערה פנימית — התלמידה לא רואה"
                            onChange={(e) => setNoteDraft(e.target.value)}
                            onBlur={() => saveNote(s.id)}
                            onKeyDown={(e) => { if (e.key === 'Enter') saveNote(s.id); if (e.key === 'Escape') setNoteFor(null); }}
                          />
                        ) : record?.note ? (
                          <button className="max-w-[14rem] truncate text-start text-xs text-ink hover:underline" title={record.note} onClick={() => { setNoteFor(s.id); setNoteDraft(record.note ?? ''); }}>
                            {record.note}
                          </button>
                        ) : (
                          <button
                            className="flex items-center gap-1 text-xs text-ink-soft/70 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                            disabled={!record}
                            title={record ? 'הוספת הערה' : 'קודם מסמנים נוכחות, ואז אפשר להוסיף הערה'}
                            onClick={() => { setNoteFor(s.id); setNoteDraft(''); }}
                          >
                            <MessageSquarePlus size={13} /> הערה
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Extra homework */}
        <div className="flex flex-wrap items-center gap-2 border-t border-rule pt-3">
          {addingHomework ? (
            <form
              className="flex flex-1 flex-wrap items-center gap-2"
              onSubmit={(e) => { e.preventDefault(); if (newHomework.trim()) addHomework.mutate(newHomework.trim()); }}
            >
              <input
                autoFocus
                className="min-w-[12rem] flex-1 rounded-input border border-rule bg-sheet px-3 py-1.5 text-sm focus:border-clay focus:outline-none"
                placeholder="מה היו שיעורי הבית? למשל: תרגילים 1–5 בעמוד 40"
                value={newHomework}
                maxLength={200}
                onChange={(e) => setNewHomework(e.target.value)}
              />
              <Button size="sm" type="submit" loading={addHomework.isPending} disabled={!newHomework.trim()}>הוספה</Button>
              <Button size="sm" variant="ghost" type="button" onClick={() => setAddingHomework(false)}>ביטול</Button>
            </form>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setAddingHomework(true)}><Plus size={13} /> שיעורי בית נוספים</Button>
          )}
          <p className="text-xs text-ink-soft">
            {siteWork.length > 0
              ? 'מטלות מהאתר מסומנות לבד לפי הגשה; שיעורי בית נוספים מסמנים כאן ידנית.'
              : 'שיעורי בית שניתנו במפגש ולא הוגשו דרך האתר — מסמנים כאן מי הכינה.'}
          </p>
        </div>
      </CardContent>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="למחוק את המפגש?"
        description="סימוני הנוכחות, ההערות ושיעורי הבית הנוספים של המפגש יימחקו. השיעור באתר והמטלות שלו לא ייפגעו."
        confirmLabel="מחיקה"
        loading={deleteSession.isPending}
        onConfirm={() => deleteSession.mutate()}
      />
      <ConfirmDialog
        open={!!homeworkToDelete}
        onOpenChange={(o) => !o && setHomeworkToDelete(null)}
        title={`למחוק את "${homeworkToDelete?.title ?? ''}"?`}
        description="הסימונים של מי הכינה יימחקו יחד איתם."
        confirmLabel="מחיקה"
        loading={deleteHomework.isPending}
        onConfirm={() => homeworkToDelete && deleteHomework.mutate(homeworkToDelete.id)}
      />
      <RenameDialog
        homework={renaming}
        loading={renameHomework.isPending}
        onClose={() => setRenaming(null)}
        onSave={(title) => renaming && renameHomework.mutate({ id: renaming.id, title })}
      />
    </Card>
  );
}

function RenameDialog({ homework, loading, onClose, onSave }: {
  homework: { id: string; title: string } | null;
  loading: boolean;
  onClose: () => void;
  onSave: (title: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [forId, setForId] = useState<string | null>(null);
  // Reset the field whenever a different homework is opened.
  if (homework && homework.id !== forId) { setForId(homework.id); setTitle(homework.title); }
  return (
    <Dialog open={!!homework} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm">
        <form onSubmit={(e) => { e.preventDefault(); if (title.trim()) onSave(title.trim()); }}>
          <DialogHeader><DialogTitle>שינוי שם שיעורי הבית</DialogTitle></DialogHeader>
          <DialogBody>
            <Input label="שם" value={title} maxLength={200} autoFocus onChange={(e) => setTitle(e.target.value)} />
          </DialogBody>
          <DialogFooter>
            <Button type="submit" loading={loading} disabled={!title.trim()}>שמירה</Button>
            <Button type="button" variant="outline" onClick={onClose}>ביטול</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
