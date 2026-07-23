import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Clock, Flame } from 'lucide-react';
import useAuthStore from '@/store/authStore';
import { coursesApi } from '@/api/courses.api';
import { submissionsApi } from '@/api/submissions.api';
import { Tape, Paperclip, Stamp } from '@/components/decor';
import { cn, formatDate, isOverdue } from '@/lib/utils';

/** Tape color by quest progress — re-colors as the notebook page fills up. */
function progressTape(pct: number): 'tomato' | 'mustard' | 'lilac' | 'cobalt' {
  if (pct >= 100) return 'cobalt';
  if (pct >= 60) return 'mustard';
  if (pct > 0) return 'lilac';
  return 'tomato';
}

export default function StudentHomePage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  const { data: coursesData } = useQuery({ queryKey: ['courses'], queryFn: () => coursesApi.list() });
  const { data: mineData } = useQuery({ queryKey: ['mine'], queryFn: () => submissionsApi.mine() });

  const courses = coursesData?.data.data.courses ?? [];
  const mine = (mineData?.data as any)?.data;
  const pending: any[] = mine?.pending ?? [];

  const doneTotal = courses.reduce((s, c) => s + (c.completedLessons ?? 0), 0);
  // Sticker streak: one sticker per completed lesson (max 7 shown); 7 unlocks the stamp.
  const streak = Math.min(doneTotal, 7);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Greeting + streak */}
      <section className="border-b-2 border-ink pb-4">
        <div className="mb-1 font-mono text-[11px] uppercase tracking-wider text-ink/55">
          המחברת שלי · {new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}
        </div>
        <h1 className="font-display text-3xl font-black text-ink md:text-4xl">
          שלום, <span className="scribble-underline">{user?.name ?? 'תלמידה'}</span>.
        </h1>

        {/* Sticker streak (feature #2) */}
        <div className="mt-3 flex items-center gap-2">
          <span className="flex items-center gap-1 font-mono text-[11px] uppercase text-ink/60">
            <Flame size={13} className="text-tomato" /> רצף
          </span>
          <div className="flex items-center gap-1">
            {Array.from({ length: 7 }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  'grid size-6 place-items-center rounded-full border-2 border-ink text-[11px]',
                  i < streak ? 'bg-mustard text-ink' : 'bg-paper text-ink/25',
                )}
                style={{ transform: `rotate(${(i % 2 ? 1 : -1) * 4}deg)` }}
              >
                ★
              </span>
            ))}
          </div>
          {streak >= 7 && <Stamp>צוין לשבח</Stamp>}
        </div>
      </section>

      {/* Quest cards (feature #1) */}
      {courses.length === 0 ? (
        <div className="border-2 border-ink bg-paper p-8 text-center font-mono text-sm text-ink/50 shadow-brutal-sm">
          לא שויכת לאף קורס עדיין
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c, i) => {
            const done = c.completedLessons ?? 0;
            const total = c.lessonCount || 0;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            return (
              <button
                key={c.id}
                onClick={() => navigate(`/student/courses/${c.id}`)}
                className="relative border-2 border-ink bg-ruled p-5 text-right shadow-brutal hover-lift"
                style={{ transform: `rotate(${i % 2 ? 0.6 : -0.6}deg)` }}
              >
                <Tape color={progressTape(pct)} rotate={i % 2 ? 5 : -5} className="-top-3 right-6 h-5 w-20" />
                <div className="font-mono text-[10px] text-ink/50">קווסט {String(i + 1).padStart(2, '0')}</div>
                <h2 className="mt-1 font-display text-lg font-bold leading-snug text-ink">{c.name}</h2>
                <p className="mt-0.5 font-mono text-[11px] text-ink/55">{total} שיעורים</p>

                {/* Measuring-tape progress (feature #7) */}
                <div className="mt-4">
                  <div className="mb-1 flex items-center justify-between font-mono text-[11px]">
                    <span className="text-ink/60">{done}/{total} הושלמו</span>
                    <span className="font-bold text-tomato tabular">{pct}%</span>
                  </div>
                  <div className="relative h-4 border-2 border-ink bg-paper">
                    <div className="h-full bg-forest" style={{ width: `${pct}%` }} />
                    {/* tick marks */}
                    <div className="pointer-events-none absolute inset-0 flex justify-between px-0.5">
                      {Array.from({ length: 9 }).map((_, t) => (
                        <span key={t} className="w-px bg-ink/30" />
                      ))}
                    </div>
                  </div>
                </div>
                {pct === 100 && total > 0 && (
                  <div className="mt-3"><Stamp rotate={-4}>הושלם</Stamp></div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Pending assignments as red sticky notes */}
      {pending.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Clock size={15} className="text-tomato" />
            <h2 className="font-display text-lg font-bold text-ink">מטלות ממתינות</h2>
            <span className="border-2 border-ink bg-tomato px-2 py-0.5 font-mono text-[11px] font-bold text-paper">
              {pending.length}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pending.map((p, i) => {
              const overdue = p.deadline && isOverdue(p.deadline);
              return (
                <button
                  key={p.assignmentId}
                  onClick={() => navigate(p.lessonId ? `/student/lessons/${p.lessonId}` : '/student/assignments')}
                  className={cn(
                    'relative border-2 border-ink p-4 text-right shadow-brutal hover-lift',
                    overdue ? 'bg-tomato/20' : 'bg-mustard/30',
                  )}
                  style={{ transform: `rotate(${i % 2 ? 1 : -1}deg)` }}
                >
                  <Paperclip rotate={i % 2 ? 8 : -8} className="-top-4 left-6" />
                  <p className="text-sm font-bold text-ink">{p.assignmentTitle}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-ink/60">{p.courseName} · {p.lessonTopic}</p>
                  {p.deadline && (
                    <span
                      className={cn(
                        'mt-3 inline-block border-2 border-ink px-2 py-0.5 font-mono text-[11px] font-bold',
                        overdue ? 'bg-tomato text-paper' : 'bg-paper text-ink',
                      )}
                    >
                      {overdue ? 'פג תוקף' : `עד ${formatDate(p.deadline)}`}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
