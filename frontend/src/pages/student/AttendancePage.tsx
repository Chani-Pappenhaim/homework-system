import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, Check, Circle } from 'lucide-react';
import { attendanceApi } from '@/api/attendance.api';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { STATUS_META, STATUS_ORDER, attendanceRate, formatDay } from '@/lib/attendance';
import { cn } from '@/lib/utils';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function AttendancePage() {
  usePageTitle('הנוכחות שלי');
  const { data, isLoading, isError } = useQuery({ queryKey: ['my-attendance'], queryFn: () => attendanceApi.getMine() });
  const courses = data?.data.data.courses ?? [];
  const [courseId, setCourseId] = useState<string | null>(null);
  const course = courses.find((c) => c.courseId === courseId) ?? courses[0];

  return (
    <div className="space-y-5">
      <PageHeader title="הנוכחות שלי" meta="מחברת · נוכחות" />

      {isLoading ? (
        <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-48" /></div>
      ) : isError ? (
        <p className="py-10 text-center text-sm text-coral">טעינת הנוכחות נכשלה. נסי לרענן את הדף.</p>
      ) : !course ? (
        <EmptyState icon={<CalendarCheck size={28} className="text-ink-soft" />}>עוד לא נרשמה נוכחות באף קורס.</EmptyState>
      ) : (
        <>
          {courses.length > 1 && (
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="קורס">
              {courses.map((c) => (
                <button
                  key={c.courseId}
                  role="tab"
                  aria-selected={c.courseId === course.courseId}
                  onClick={() => setCourseId(c.courseId)}
                  className={cn(
                    'rounded-lg border border-rule px-4 py-2 text-sm font-semibold transition-colors',
                    c.courseId === course.courseId ? 'bg-ink text-sheet shadow-soft' : 'bg-sheet text-ink-soft hover:bg-ground',
                  )}
                >
                  {c.courseName}
                </button>
              ))}
            </div>
          )}

          <Summary {...course.summary} />

          {course.sessions.length === 0 ? (
            <EmptyState>עוד לא נרשמה נוכחות בקורס הזה.</EmptyState>
          ) : (
            <Card>
              <CardContent className="p-0">
                <ul className="divide-y divide-rule">
                  {course.sessions.map((s) => {
                    const meta = s.status ? STATUS_META[s.status] : null;
                    const Icon = meta?.icon;
                    return (
                      <li key={s.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3">
                        <div className="w-20 shrink-0 text-xs font-semibold text-ink-soft">{formatDay(s.date)}</div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-ink">{s.title ?? 'מפגש'}</p>
                          {s.homework.length > 0 && (
                            <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="שיעורי בית">
                              {s.homework.map((h) => (
                                <li
                                  key={h.id}
                                  className={cn(
                                    'flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                                    h.done ? 'bg-sage/15 text-sage' : 'bg-ground text-ink-soft',
                                  )}
                                >
                                  {h.done ? <Check size={11} /> : <Circle size={9} />}
                                  {h.title}
                                  <span className="sr-only">{h.done ? ' — בוצע' : ' — לא סומן כבוצע'}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        {meta && Icon ? (
                          <span className={cn('flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold', meta.active)}>
                            <Icon size={13} /> {meta.label}
                          </span>
                        ) : (
                          <span className="shrink-0 rounded-full bg-ground px-2.5 py-1 text-xs text-ink-soft">טרם סומן</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Summary({ present, absent, excused, sessions }: { present: number; absent: number; excused: number; sessions: number }) {
  const rate = attendanceRate(present, absent);
  const counts = { PRESENT: present, ABSENT: absent, EXCUSED: excused };
  return (
    <Card accent="sage">
      <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-3 pt-5">
        <div>
          <p className="text-xs font-semibold text-ink-soft">אחוז נוכחות</p>
          <p className={cn('font-display text-3xl font-bold', rate === null ? 'text-ink-soft' : rate >= 85 ? 'text-sage' : rate >= 70 ? 'text-clay' : 'text-coral')}>
            {rate === null ? '—' : `${rate}%`}
          </p>
        </div>
        {STATUS_ORDER.map((st) => {
          const { label, icon: Icon, text } = STATUS_META[st];
          return (
            <div key={st}>
              <p className={cn('flex items-center gap-1 text-xs font-semibold', text)}><Icon size={13} /> {label}</p>
              <p className="text-xl font-bold text-ink">{counts[st]}</p>
            </div>
          );
        })}
        <p className="text-xs text-ink-soft sm:ms-auto">{sessions} מפגשים · היעדרות מאושרת לא נחשבת חיסור</p>
      </CardContent>
    </Card>
  );
}
