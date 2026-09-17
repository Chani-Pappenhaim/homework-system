import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { coursesApi } from '@/api/courses.api';
import { Tape } from '@/components/decor';
import { PageHeader } from '@/components/ui/page-header';
import { cn } from '@/lib/utils';

// Slight rotation per card gives the row a hand-tacked, sheet-on-a-board look.
const CARD_ACCENTS = ['clay', 'indigo', 'sage', 'butter', 'coral'] as const;
const TAPES = ['clay', 'sage', 'indigo', 'butter'] as const;

// Every class Tailwind's production build needs to see must appear as a
// literal string somewhere in source — `` `bg-${accent}` `` is invisible to
// the scanner and gets purged. This map makes each combination literal.
const ACCENT_CLASSES: Record<(typeof CARD_ACCENTS)[number], { bar: string; text: string; bg: string; ring: string }> = {
  clay: { bar: 'bg-clay', text: 'text-clay', bg: 'bg-clay', ring: 'bg-clay/15' },
  indigo: { bar: 'bg-indigo', text: 'text-indigo', bg: 'bg-indigo', ring: 'bg-indigo/15' },
  sage: { bar: 'bg-sage', text: 'text-sage', bg: 'bg-sage', ring: 'bg-sage/15' },
  butter: { bar: 'bg-butter', text: 'text-butter', bg: 'bg-butter', ring: 'bg-butter/15' },
  coral: { bar: 'bg-coral', text: 'text-coral', bg: 'bg-coral', ring: 'bg-coral/15' },
};

export default function StudentCoursesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  function prefetchCourse(courseId: string) {
    qc.prefetchQuery({ queryKey: ['course', courseId], queryFn: () => coursesApi.get(courseId) });
  }
  const { data: coursesData, isLoading } = useQuery({ queryKey: ['courses'], queryFn: () => coursesApi.list() });
  const courses = coursesData?.data.data.courses ?? [];
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const filteredCourses = q ? courses.filter((c) => c.name?.toLowerCase().includes(q)) : courses;

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        title="קורסים"
        meta={`${courses.length} קורסים`}
        actions={
          courses.length > 0 ? (
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
          ) : undefined
        }
      />

      {isLoading ? (
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
            const tape = TAPES[i % TAPES.length];
            return (
              <button
                key={c.id}
                onClick={() => navigate(`/student/courses/${c.id}`)}
                onMouseEnter={() => prefetchCourse(c.id)}
                onFocus={() => prefetchCourse(c.id)}
                className="sheet lift relative overflow-hidden p-0 text-right"
              >
                <div className={cn('relative h-2 w-full opacity-70', ACCENT_CLASSES[accent].bar)}>
                  <Tape color={tape} rotate={-6} className="-top-1 right-2 w-9" />
                  <Tape color={tape} rotate={6} className="-top-1 left-2 w-9" />
                </div>
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
                      <div className={cn('h-full rounded-full transition-all', ACCENT_CLASSES[accent].bg)} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
