import { useMemo, useState } from 'react';
import type { CourseAttendanceDTO, RosterStudent } from '@/api/attendance.api';
import { STATUS_META, attendanceRate, shortDay, formatFullDay, dayValue } from '@/lib/attendance';
import { cn } from '@/lib/utils';

interface Props {
  data: CourseAttendanceDTO;
  roster: RosterStudent[];
  onOpenSession: (sessionId: string) => void;
}

/** Students down, meetings across — the whole term at a glance. */
export function AttendanceGrid({ data, roster, onOpenSession }: Props) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const sessions = useMemo(
    () => [...data.sessions]
      .filter((s) => (!from || dayValue(s.date) >= from) && (!to || dayValue(s.date) <= to))
      .sort((a, b) => a.date.localeCompare(b.date)),
    [data.sessions, from, to],
  );
  const lessonOf = (id: string | null) => data.lessons.find((l) => l.id === id) ?? null;

  // Every piece of homework the range covers: site assignments plus extra ones.
  const homeworkCount = sessions.reduce((n, s) => n + s.homework.length + (lessonOf(s.lessonId)?.assignments.length ?? 0), 0);

  const rows = roster.map((student) => {
    let present = 0, absent = 0, excused = 0, done = 0;
    const cells = sessions.map((s) => {
      const status = s.records.find((r) => r.studentId === student.id)?.status ?? null;
      if (status === 'PRESENT') present++;
      else if (status === 'ABSENT') absent++;
      else if (status === 'EXCUSED') excused++;
      done += s.homework.filter((h) => h.doneBy.includes(student.id)).length;
      done += lessonOf(s.lessonId)?.assignments.filter((a) => a.submittedBy.includes(student.id)).length ?? 0;
      return status;
    });
    return { student, cells, present, absent, excused, done, rate: attendanceRate(present, absent) };
  });

  const dateInput = 'rounded-input border border-rule bg-sheet px-2 py-1 text-xs text-ink focus:border-clay focus:outline-none';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
        <label className="flex items-center gap-1">מתאריך <input type="date" className={dateInput} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="flex items-center gap-1">עד <input type="date" className={dateInput} value={to} onChange={(e) => setTo(e.target.value)} /></label>
        {(from || to) && <button className="font-semibold text-clay hover:underline" onClick={() => { setFrom(''); setTo(''); }}>ניקוי</button>}
        <span className="ms-auto flex flex-wrap gap-3">
          {(['PRESENT', 'ABSENT', 'EXCUSED'] as const).map((st) => {
            const { label, icon: Icon, text } = STATUS_META[st];
            return <span key={st} className={cn('flex items-center gap-1', text)}><Icon size={12} /> {label}</span>;
          })}
          <span>· = לא סומן</span>
        </span>
      </div>

      {sessions.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-soft">אין מפגשים בטווח הזה.</p>
      ) : (
        // The one place sideways scrolling belongs: many meetings, names pinned.
        <div className="max-h-[70vh] overflow-auto rounded-lg border border-rule">
          <table className="border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-20 bg-sheet">
              <tr>
                <th className="sticky right-0 z-30 border-b border-l border-rule bg-sheet px-3 py-2 text-start text-xs font-semibold text-ink-soft">תלמידה</th>
                {sessions.map((s) => (
                  <th key={s.id} className="border-b border-rule px-1 py-1 text-center">
                    <button
                      onClick={() => onOpenSession(s.id)}
                      title={`${formatFullDay(s.date)} — ${s.title ?? lessonOf(s.lessonId)?.topic ?? 'מפגש'}`}
                      className="rounded px-1.5 py-1 text-[11px] font-semibold text-ink-soft hover:bg-ground hover:text-ink"
                    >
                      {shortDay(s.date)}
                      {!s.lessonId && <span className="block text-[9px] font-normal">לא באתר</span>}
                    </button>
                  </th>
                ))}
                <th className="border-b border-r border-rule px-3 py-2 text-xs font-semibold text-ink-soft">נוכחות</th>
                <th className="border-b border-rule px-3 py-2 text-xs font-semibold text-ink-soft">מאושרות</th>
                {homeworkCount > 0 && <th className="border-b border-rule px-3 py-2 text-xs font-semibold text-ink-soft">שיעורי בית</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ student, cells, absent, excused, done, rate }) => (
                <tr key={student.id} className="group">
                  <th scope="row" className="sticky right-0 z-10 whitespace-nowrap border-b border-l border-rule/60 bg-sheet px-3 py-1.5 text-start font-semibold text-ink group-hover:bg-ground">
                    {student.name}
                  </th>
                  {cells.map((status, i) => {
                    const meta = status ? STATUS_META[status] : null;
                    const Icon = meta?.icon;
                    return (
                      <td key={sessions[i].id} className="border-b border-rule/60 px-1 py-1.5 text-center group-hover:bg-ground/60">
                        {meta && Icon
                          ? <Icon size={15} className={cn('inline', meta.text)} aria-label={meta.label} />
                          : <span className="text-ink-soft/40" aria-label="לא סומן">·</span>}
                      </td>
                    );
                  })}
                  <td className={cn(
                    'border-b border-r border-rule/60 px-3 py-1.5 text-center font-semibold group-hover:bg-ground/60',
                    rate === null ? 'text-ink-soft' : rate >= 85 ? 'text-sage' : rate >= 70 ? 'text-clay' : 'text-coral',
                  )}>
                    {rate === null ? '—' : `${rate}%`}
                    {absent > 0 && <span className="block text-[10px] font-normal text-ink-soft">{absent} חיסורים</span>}
                  </td>
                  <td className="border-b border-rule/60 px-3 py-1.5 text-center text-ink-soft group-hover:bg-ground/60">{excused || '—'}</td>
                  {homeworkCount > 0 && (
                    <td className="border-b border-rule/60 px-3 py-1.5 text-center text-ink group-hover:bg-ground/60">{done}/{homeworkCount}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-ink-soft">אחוז הנוכחות מחושב מתוך המפגשים שסומנו; היעדרות מאושרת לא נחשבת חיסור. לחיצה על תאריך פותחת את המפגש.</p>
    </div>
  );
}
