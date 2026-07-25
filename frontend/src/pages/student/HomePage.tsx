import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Clock, Flame, ArrowLeft } from 'lucide-react';
import useAuthStore from '@/store/authStore';
import { coursesApi } from '@/api/courses.api';
import { submissionsApi } from '@/api/submissions.api';
import { Tape } from '@/components/decor';
import { cn, formatDate, isOverdue } from '@/lib/utils';

// A little rotation per course card so they read like sheets tacked to a board.
const CARD_ACCENTS = ['clay', 'indigo', 'sage', 'butter', 'coral'] as const;
const TAPES = ['clay', 'sage', 'indigo', 'butter'] as const;

export default function StudentHomePage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  const { data: coursesData } = useQuery({ queryKey: ['courses'], queryFn: () => coursesApi.list() });
  const { data: mineData } = useQuery({ queryKey: ['mine'], queryFn: () => submissionsApi.mine() });

  const courses = coursesData?.data.data.courses ?? [];
  const mine = (mineData?.data as any)?.data;
  const pending: any[] = mine?.pending ?? [];

  const doneTotal = courses.reduce((s, c) => s + (c.completedLessons ?? 0), 0);
  const streak = Math.min(doneTotal, 7);
  const dateMeta = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

  return (
    <div className="mx-auto max-w-4xl space-y-5" dir="rtl">
      {/* Greeting */}
      <section className="sheet relative p-5">
        <Tape color="clay" rotate={-4} className="-top-2.5 right-8 w-20" />
        <Tape color="sage" rotate={3} className="-top-2 right-28 w-14" />
        <div className="label mb-1">המחברת שלי · {dateMeta}</div>
        <h1 className="font-display text-2xl font-bold text-ink">שלום, {(user?.name ?? 'תלמידה').split(' ')[0]}</h1>
        <div className="mt-3 flex items-center gap-2">
          <span className="label flex items-center gap-1"><Flame size={13} className="text-coral" /> רצף</span>
          <div className="flex items-center gap-1">
            {Array.from({ length: 7 }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  'grid size-5 place-items-center rounded-full text-[10px]',
                  i < streak ? 'bg-butter/40 text-clay' : 'bg-ground text-ink-soft/40',
                )}
              >
                ★
              </span>
            ))}
          </div>
          {streak >= 7 && (
            <span className="rounded-full bg-sage/15 px-2 py-0.5 text-[11px] font-semibold text-sage">צוין לשבח</span>
          )}
        </div>
      </section>

      {/* Courses */}
      {courses.length === 0 ? (
        <div className="sheet p-8 text-center text-sm text-ink-soft">לא שויכת לאף קורס עדיין</div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c, i) => {
            const done = c.completedLessons ?? 0;
            const total = c.lessonCount || 0;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            const accent = CARD_ACCENTS[i % CARD_ACCENTS.length];
            const tape = TAPES[i % TAPES.length];
            return (
              <button
                key={c.id}
                onClick={() => navigate(`/student/courses/${c.id}`)}
                className={cn(
                  'sheet lift relative p-4 pr-5 text-right',
                  'before:absolute before:inset-y-3 before:right-0 before:w-1 before:rounded-full',
                  `before:bg-${accent}`,
                )}
              >
                <Tape color={tape} rotate={i % 2 ? 4 : -4} className="-top-2 left-6 w-14" />
                <h2 className="font-display text-base font-bold leading-snug text-ink">{c.name}</h2>
                <p className="mt-0.5 text-[11px] text-ink-soft">{total} שיעורים</p>
                <div className="mt-4">
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="text-ink-soft">{done}/{total} הושלמו</span>
                    <span className={cn('font-semibold tabular', `text-${accent}`)}>{pct}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-ground">
                    <div className={cn('h-full rounded-full transition-all', `bg-${accent}`)} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Pending assignments */}
      {pending.length > 0 && (
        <section className="sheet">
          <div className="flex items-center gap-2 border-b border-rule px-4 py-3">
            <Clock size={15} className="text-coral" />
            <h2 className="font-display text-base font-bold">מטלות ממתינות</h2>
            <span className="mr-auto rounded-full bg-coral/12 px-2 py-0.5 text-[11px] font-semibold text-coral">
              {pending.length}
            </span>
          </div>
          <div className="divide-y divide-rule">
            {pending.map((p) => {
              const overdue = p.deadline && isOverdue(p.deadline);
              return (
                <button
                  key={p.assignmentId}
                  onClick={() => navigate(p.lessonId ? `/student/lessons/${p.lessonId}` : '/student/assignments')}
                  className="flex w-full items-center gap-3 px-4 py-3 text-right transition-colors hover:bg-butter/10"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{p.assignmentTitle}</p>
                    <p className="truncate text-[11px] text-ink-soft">{p.courseName} · {p.lessonTopic}</p>
                  </div>
                  {p.deadline && (
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                        overdue ? 'bg-coral/12 text-coral' : 'bg-butter/30 text-clay',
                      )}
                    >
                      {overdue ? 'פג תוקף' : `עד ${formatDate(p.deadline)}`}
                    </span>
                  )}
                  <ArrowLeft size={14} className="shrink-0 text-ink-soft" />
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
