import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Clock, TrendingUp, ArrowLeft, Search } from 'lucide-react';
import useAuthStore from '@/store/authStore';
import { coursesApi } from '@/api/courses.api';
import { submissionsApi } from '@/api/submissions.api';
import { Tape } from '@/components/decor';
import { cn, formatDate, isOverdue } from '@/lib/utils';
import { unwrap } from '@/lib/api-utils';
import type { PendingAssignment } from '@/types';

// Slight rotation per card gives the row a hand-tacked, sheet-on-a-board look.
const CARD_ACCENTS = ['clay', 'indigo', 'sage', 'butter', 'coral'] as const;

// Every class Tailwind's production build needs to see must appear as a
// literal string somewhere in source — `` `bg-${accent}` `` is invisible to
// the scanner and gets purged. This map makes each combination literal.
const ACCENT_CLASSES: Record<(typeof CARD_ACCENTS)[number], { bar: string; text: string; bg: string; fill: string; ring: string }> = {
  clay: { bar: 'bg-clay', text: 'text-clay', bg: 'bg-clay', fill: 'bg-clay/60', ring: 'bg-clay/15' },
  indigo: { bar: 'bg-indigo', text: 'text-indigo', bg: 'bg-indigo', fill: 'bg-indigo/60', ring: 'bg-indigo/15' },
  sage: { bar: 'bg-sage', text: 'text-sage', bg: 'bg-sage', fill: 'bg-sage/60', ring: 'bg-sage/15' },
  butter: { bar: 'bg-butter', text: 'text-butter', bg: 'bg-butter', fill: 'bg-butter/60', ring: 'bg-butter/15' },
  coral: { bar: 'bg-coral', text: 'text-coral', bg: 'bg-coral', fill: 'bg-coral/60', ring: 'bg-coral/15' },
};

export default function StudentHomePage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  const { data: coursesData, isLoading: coursesLoading } = useQuery({ queryKey: ['courses'], queryFn: () => coursesApi.list() });
  const { data: mineData } = useQuery({ queryKey: ['mine'], queryFn: () => submissionsApi.mine() });

  const courses = coursesData?.data.data.courses ?? [];
  const mine = unwrap(mineData);
  const pending: PendingAssignment[] = mine?.pending ?? [];
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const filteredCourses = q ? courses.filter((c) => c.name?.toLowerCase().includes(q)) : courses;

  const doneTotal = courses.reduce((s, c) => s + (c.completedLessons ?? 0), 0);
  const totalLessons = courses.reduce((s, c) => s + (c.lessonCount ?? 0), 0);
  // Fixed 7 slots representing overall completion ratio, not a raw lesson
  // count — otherwise the row would need to keep growing as more lessons
  // and courses pile up instead of staying a stable at-a-glance gauge.
  const streak = totalLessons > 0 ? Math.round((doneTotal / totalLessons) * 7) : 0;
  const dateMeta = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  const groupNames = (user?.groups ?? []).map((g) => g.name);

  return (
    <div className="space-y-5" dir="rtl">
      <section className="sheet relative p-5">
        <Tape color="clay" rotate={40} className="-top-1 -right-1 w-14" />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="label mb-1">המחברת שלי · {dateMeta}</div>
            <h1 className="font-display text-2xl font-bold text-ink">שלום, {(user?.name ?? 'תלמידה').split(' ')[0]}</h1>
            {groupNames.length > 0 && (
              <p className="mt-0.5 text-xs text-ink-soft">
                {groupNames.length > 1 ? 'קבוצות: ' : 'קבוצה: '}{groupNames.join(', ')}
              </p>
            )}
          </div>
          {courses.length > 0 && (
            <div className="flex items-center gap-2 rounded-input border border-rule bg-ground/60 px-3 py-1.5 transition-colors focus-within:border-clay sm:w-56">
              <Search size={15} className="text-ink-soft" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-soft"
                placeholder="חיפוש קורס"
              />
              {search && (
                <button onClick={() => setSearch('')} className="text-xs text-ink-soft hover:text-coral">✕</button>
              )}
            </div>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="label flex items-center gap-1"><TrendingUp size={13} className="text-sage" /> התקדמות כוללת</span>
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

      {coursesLoading ? (
        <div className="sheet p-8 text-center text-sm text-ink-soft">טוען…</div>
      ) : courses.length === 0 ? (
        <div className="sheet p-8 text-center text-sm text-ink-soft">לא שויכת לאף קורס עדיין</div>
      ) : filteredCourses.length === 0 ? (
        <div className="sheet p-8 text-center text-sm text-ink-soft">{`אין תוצאות ל"${search.trim()}"`}</div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredCourses.map((c, i) => {
            const done = c.completedLessons ?? 0;
            const total = c.lessonCount || 0;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            const accent = CARD_ACCENTS[i % CARD_ACCENTS.length];
            return (
              <button
                key={c.id}
                onClick={() => navigate(`/student/courses/${c.id}`)}
                className="sheet lift relative overflow-hidden p-0 text-right"
              >
                <div className={cn('h-2 w-full opacity-50', ACCENT_CLASSES[accent].bar)} />
                <div className="relative p-4 pr-5">
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        'grid size-9 shrink-0 place-items-center rounded-full font-display text-sm font-bold',
                        ACCENT_CLASSES[accent].ring,
                        ACCENT_CLASSES[accent].text,
                      )}
                    >
                      {(c.name ?? '?').trim().charAt(0)}
                    </span>
                    <div className="min-w-0">
                      <h2 className="truncate font-display text-base font-bold leading-snug text-ink">{c.name}</h2>
                      <p className="mt-0.5 text-[11px] text-ink-soft">{total} שיעורים</p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="mb-1 flex items-center justify-between text-[11px]">
                      <span className="text-ink-soft">{done}/{total} הושלמו</span>
                      <span className={cn('font-semibold tabular', ACCENT_CLASSES[accent].text)}>{pct}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-ground">
                      <div className={cn('h-full rounded-full transition-all', ACCENT_CLASSES[accent].fill)} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

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
