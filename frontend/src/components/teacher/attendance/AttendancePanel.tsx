import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, CalendarPlus, FileSpreadsheet, LayoutGrid, ListChecks, Plus, UserCog, AlertCircle } from 'lucide-react';
import { attendanceApi, type AttendanceSessionDTO } from '@/api/attendance.api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { getApiErrorMessage } from '@/lib/errors';
import { formatDay, countStatuses } from '@/lib/attendance';
import { cn } from '@/lib/utils';
import { SessionSheet } from './SessionSheet';
import { SessionFormDialog } from './SessionFormDialog';
import { ImportAttendanceDialog } from './ImportAttendanceDialog';
import { RosterDialog } from './RosterDialog';
import { AttendanceGrid } from './AttendanceGrid';

type View = 'sessions' | 'grid';

export function AttendancePanel({ courseId }: { courseId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [view, setView] = useState<View>('sessions');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<{ session?: AttendanceSessionDTO } | null>(null);
  const [importing, setImporting] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  const { data: res, isLoading, isError } = useQuery({
    queryKey: ['attendance', courseId],
    queryFn: () => attendanceApi.getCourse(courseId),
  });
  const data = res?.data.data;

  const roster = useMemo(() => (data?.roster ?? []).filter((s) => !s.excluded), [data]);
  const sessions = useMemo(() => [...(data?.sessions ?? [])].sort((a, b) => b.date.localeCompare(a.date)), [data]);
  const lessonsWithout = useMemo(() => {
    const used = new Set(data?.sessions.map((s) => s.lessonId));
    return (data?.lessons ?? []).filter((l) => l.lessonDate && !used.has(l.id)).length;
  }, [data]);

  // Land on the newest meeting; keep the choice while it still exists.
  useEffect(() => {
    if (!sessions.length) { setSelectedId(null); return; }
    if (!selectedId || !sessions.some((s) => s.id === selectedId)) setSelectedId(sessions[0].id);
  }, [sessions, selectedId]);

  const fromLessons = useMutation({
    mutationFn: () => attendanceApi.createSessionsFromLessons(courseId),
    onSuccess: (r) => {
      const { created, undated } = r.data.data;
      qc.invalidateQueries({ queryKey: ['attendance', courseId] });
      toast.success(created ? `נפתחו ${created} מפגשים` : 'לכל השיעורים עם תאריך כבר יש מפגש');
      if (undated) toast.error(`${undated} שיעורים בלי תאריך — אפשר לפתוח להם מפגש ידנית`);
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'פתיחת המפגשים נכשלה')),
  });

  function open(id: string) {
    setSelectedId(id);
    setView('sessions');
    // On a phone the sheet sits under the list, so bring it into view.
    requestAnimationFrame(() => {
      if (window.matchMedia?.('(max-width: 1023px)').matches) sheetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  if (isLoading) return <div className="space-y-3"><Skeleton className="h-12" /><Skeleton className="h-64" /></div>;
  if (isError || !data) return <p className="py-10 text-center text-sm text-coral">טעינת הנוכחות נכשלה. נסי לרענן את הדף.</p>;

  const selected = sessions.find((s) => s.id === selectedId) ?? null;
  const excludedCount = data.roster.length - roster.length;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-rule bg-sheet p-0.5" role="tablist" aria-label="תצוגה">
          {([['sessions', ListChecks, 'לפי מפגש'], ['grid', LayoutGrid, 'טבלת סיכום']] as const).map(([key, Icon, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={view === key}
              onClick={() => setView(key)}
              className={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors',
                view === key ? 'bg-ink text-sheet' : 'text-ink-soft hover:text-ink')}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
        <div className="ms-auto flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={() => setRosterOpen(true)}>
            <UserCog size={14} /> תלמידות ({roster.length}{excludedCount ? ` · ${excludedCount} מוחרגות` : ''})
          </Button>
          <Button size="sm" variant="outline" onClick={() => setImporting(true)}><FileSpreadsheet size={14} /> ייבוא מ-Excel</Button>
          <Button size="sm" onClick={() => setForm({})}><Plus size={14} /> מפגש חדש</Button>
        </div>
      </div>

      {sessions.length === 0 ? (
        <EmptyState icon={<CalendarCheck size={28} className="text-ink-soft" />}>
          עוד לא נפתחו מפגשים. אפשר לפתוח מפגש לכל שיעור באתר שיש לו תאריך, להוסיף מפגש ידנית (גם כזה שלא באתר) או לייבא מקובץ Excel.
        </EmptyState>
      ) : view === 'grid' ? (
        <Card><CardContent className="pt-5"><AttendanceGrid data={data} roster={roster} onOpenSession={open} /></CardContent></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
          {/* Meeting list — its own scroll so a long term never pushes the sheet away */}
          <Card className="lg:sticky lg:top-4 lg:self-start">
            <CardContent className="p-2">
              <ul className="max-h-[22rem] space-y-0.5 overflow-y-auto lg:max-h-[calc(100vh-12rem)]" aria-label="מפגשים">
                {sessions.map((s) => {
                  const counts = countStatuses(roster.map((st) => s.records.find((r) => r.studentId === st.id)?.status));
                  const lesson = data.lessons.find((l) => l.id === s.lessonId);
                  const active = s.id === selectedId;
                  return (
                    <li key={s.id}>
                      <button
                        onClick={() => open(s.id)}
                        aria-current={active ? 'true' : undefined}
                        className={cn('w-full rounded-lg px-3 py-2 text-start transition-colors', active ? 'bg-ink text-sheet' : 'hover:bg-ground')}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold">{formatDay(s.date)}</span>
                          {counts.none > 0 && roster.length > 0
                            ? <span className={cn('flex items-center gap-0.5 text-[10px] font-semibold', active ? 'text-butter' : 'text-clay')}><AlertCircle size={11} /> {counts.none} לא סומנו</span>
                            : <span className={cn('text-[10px]', active ? 'text-sheet/70' : 'text-ink-soft')}>{counts.PRESENT}/{roster.length}</span>}
                        </span>
                        <span className={cn('block truncate text-sm', active ? 'text-sheet' : 'text-ink')}>
                          {s.title ?? lesson?.topic ?? 'מפגש'}
                        </span>
                        {!lesson && <span className={cn('text-[10px]', active ? 'text-sheet/70' : 'text-ink-soft')}>לא באתר</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {lessonsWithout > 0 && (
                <button
                  onClick={() => fromLessons.mutate()}
                  disabled={fromLessons.isPending}
                  className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-rule px-3 py-2 text-xs font-semibold text-clay hover:bg-ground disabled:opacity-50"
                >
                  <CalendarPlus size={13} /> {lessonsWithout} שיעורים באתר בלי מפגש — לפתוח
                </button>
              )}
            </CardContent>
          </Card>

          <div ref={sheetRef} className="min-w-0 scroll-mt-4">
            {selected && (
              <SessionSheet
                key={selected.id}
                courseId={courseId}
                data={data}
                session={selected}
                roster={roster}
                onEdit={() => setForm({ session: selected })}
                onDeleted={() => setSelectedId(null)}
              />
            )}
          </div>
        </div>
      )}

      {sessions.length === 0 && (
        <div className="flex flex-wrap justify-center gap-2">
          {data.lessons.some((l) => l.lessonDate) && (
            <Button onClick={() => fromLessons.mutate()} loading={fromLessons.isPending}>
              <CalendarPlus size={14} /> מפגש לכל שיעור עם תאריך
            </Button>
          )}
          <Button variant="outline" onClick={() => setForm({})}><Plus size={14} /> מפגש ידני</Button>
          <Button variant="outline" onClick={() => setImporting(true)}><FileSpreadsheet size={14} /> ייבוא מ-Excel</Button>
        </div>
      )}

      {form && (
        <SessionFormDialog
          courseId={courseId}
          lessons={data.lessons}
          session={form.session}
          onClose={() => setForm(null)}
          onSaved={(id) => { setForm(null); open(id); }}
        />
      )}
      {importing && <ImportAttendanceDialog courseId={courseId} onClose={() => setImporting(false)} />}
      {rosterOpen && <RosterDialog courseId={courseId} roster={data.roster} onClose={() => setRosterOpen(false)} />}
    </div>
  );
}
