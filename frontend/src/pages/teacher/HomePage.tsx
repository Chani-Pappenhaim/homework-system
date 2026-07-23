import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Pencil, UploadCloud, Sparkles, CheckSquare, Square } from 'lucide-react';
import useAuthStore from '@/store/authStore';
import { groupsApi } from '@/api/groups.api';
import { coursesApi } from '@/api/courses.api';
import { gradesApi } from '@/api/grades.api';
import { aiUsageApi } from '@/api/aiUsage.api';
import { Ticker, Tape, Paperclip, StatusPill, type PillVariant } from '@/components/decor';
import { cn, formatDateTime } from '@/lib/utils';
import type { ReportRow } from '@/types';

/** Relative "לפני X" from an ISO timestamp — mono meta on each queue row. */
function relTime(iso?: string): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'עכשיו';
  if (m < 60) return `לפני ${m}′`;
  const h = Math.floor(m / 60);
  if (h < 24) return `לפני ${h}ש׳`;
  return `לפני ${Math.floor(h / 24)}י׳`;
}

function greetingWord(): string {
  const h = new Date().getHours();
  if (h < 12) return 'בוקר טוב';
  if (h < 18) return 'צהריים טובים';
  return 'ערב טוב';
}

/** Row state → StatusPill. graded = approved, submitted-not-graded = pending AI. */
function rowStatus(r: ReportRow): { variant: PillVariant; label: string } {
  if (r.contentScore != null) return { variant: 'approved', label: 'אושר' };
  if (r.submissionScore != null) return { variant: 'ai', label: 'נבדק AI' };
  return { variant: 'pending', label: 'ממתין' };
}

export default function TeacherHomePage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  const { data: groupsData } = useQuery({ queryKey: ['groups'], queryFn: () => groupsApi.list() });
  const { data: coursesData } = useQuery({ queryKey: ['courses'], queryFn: () => coursesApi.list() });
  const { data: pendingData } = useQuery({ queryKey: ['pending'], queryFn: () => gradesApi.pending() });
  const { data: aiUsageData } = useQuery({ queryKey: ['ai-usage-summary'], queryFn: () => aiUsageApi.summary() });
  const { data: reportData } = useQuery({ queryKey: ['report', {}], queryFn: () => gradesApi.report() });

  const groups = groupsData?.data.data.groups ?? [];
  const courses = coursesData?.data.data.courses ?? [];
  const pending = (pendingData?.data as any)?.data?.count ?? 0;
  const aiCost = (aiUsageData?.data as any)?.data?.totalCostUsd;
  const report: ReportRow[] = (reportData?.data as any)?.data?.report ?? [];

  const queue = report.filter((r) => r.contentScore == null);
  const graded = report.filter((r) => r.contentScore != null);
  const avg =
    graded.length > 0
      ? (graded.reduce((s, r) => s + (r.contentScore ?? 0), 0) / graded.length).toFixed(1)
      : '—';
  const spotlight = queue[0]; // the "live" student in the mirror panel
  const lastGraded = graded[0];

  const dateMeta = new Intl.DateTimeFormat('he-IL', {
    weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date());
  const clock = new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit' }).format(new Date());

  const kpis = [
    { tag: '01', accent: 'cobalt' as const, value: groups.length, label: 'קבוצות', hint: 'פעילות', trend: 'יציב' },
    { tag: '02', accent: 'plum' as const, value: courses.length, label: 'קורסים', hint: 'במערכת', trend: 'עדכני' },
    { tag: '03', accent: 'tomato' as const, value: pending, label: 'ממתינות לבדיקה', hint: 'תור פתוח', trend: pending > 0 ? 'דורש טיפול' : 'ריק' },
    { tag: '04', accent: 'forest' as const, value: aiCost != null ? `$${Number(aiCost).toFixed(2)}` : '—', label: 'עלות AI', hint: 'החודש', trend: 'במסגרת' },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      {/* Ticker */}
      <Ticker
        items={[
          'שמונה מטלות ממתינות לבדיקה',
          'נעמה הגישה באיחור — לבדיקה',
          `ממוצע השבוע ${avg}`,
          'סבב חדש נפתח ביום ראשון',
        ]}
        className="border-2 border-ink"
      />

      {/* Greeting */}
      <section className="relative">
        <div className="mb-2 flex items-center gap-3 border-b-2 border-ink pb-2">
          <span className="font-mono text-[11px] uppercase tracking-wider text-ink/60">
            {dateMeta} · {clock}
          </span>
          <span className="ms-auto font-mono text-[11px] text-ink/40">DASHBOARD /01</span>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-black leading-tight text-ink md:text-5xl">
              {greetingWord()}, <span className="scribble-underline">{user?.name ?? 'מורה'}</span>.
            </h1>
            <p className="mt-2 font-display text-xl text-ink/70">
              {pending > 0 ? (
                <>
                  <span className="tabular">{pending}</span> תלמידות{' '}
                  <span className="font-bold text-tomato">ממתינות לך.</span>
                </>
              ) : (
                <span className="font-bold text-forest">התור ריק — כל הכבוד.</span>
              )}
            </p>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink/60">
              יום עמוס אבל שגרתי. עברי על יומן הבדיקה מימין, אשרי את מה שה-AI כבר בדק,
              והשאירי הערה למי שצריכה חיזוק.
            </p>
          </div>

          {/* Grade stamp */}
          <div className="shrink-0 text-center">
            <span className="pen-circle font-mono text-4xl font-bold tabular text-tomato">{avg}</span>
            <div className="mt-2 font-mono text-[10px] uppercase tracking-wider text-ink/55">
              avg · week
            </div>
          </div>
        </div>
      </section>

      {/* KPI row */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((k, i) => (
          <div
            key={k.tag}
            className="group relative border-2 border-ink bg-paper p-4 shadow-brutal transition-transform duration-150 ease-linear hover:!rotate-0"
            style={{ transform: `rotate(${i % 2 === 0 ? -0.7 : 0.7}deg)` }}
          >
            <span className={cn('absolute inset-x-0 top-0 h-[3px]', `bg-${k.accent}`)} />
            <Tape color={i % 2 === 0 ? 'mustard' : 'lilac'} rotate={i % 2 === 0 ? -5 : 5} className="-top-3 right-5 h-5 w-14" />
            <div className="font-mono text-[11px] text-ink/45">{k.tag}</div>
            <div className="mt-1 font-display text-5xl font-black tabular leading-none text-ink">{k.value}</div>
            <div className="mt-2 text-sm font-bold text-ink">{k.label}</div>
            <div className="mt-3 flex items-center justify-between border-t-2 border-dashed border-ink/30 pt-2">
              <span className="font-mono text-[10px] uppercase text-ink/50">{k.hint}</span>
              <span className="flex items-center gap-1 font-mono text-[10px] text-ink/70">
                <span className={cn('size-2', `bg-${k.accent}`)} /> {k.trend}
              </span>
            </div>
          </div>
        ))}
      </section>

      {/* Two-column: review queue + student mirror */}
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.6fr_1fr]">
        {/* Review queue */}
        <div className="relative border-2 border-ink bg-notebook shadow-brutal">
          <Paperclip rotate={-8} className="-top-4 right-10" />
          <Paperclip rotate={9} className="-top-4 left-12" />
          <div className="flex items-center gap-3 border-b-2 border-ink bg-cream/70 px-4 py-3">
            <Pencil size={16} className="text-tomato" />
            <h2 className="font-display text-lg font-bold uppercase text-ink">יומן בדיקה</h2>
            <span className="hidden font-mono text-[10px] text-ink/50 sm:inline">SLA · 24ש׳</span>
            <span className="ms-auto border-2 border-ink bg-ink px-2 py-0.5 font-mono text-[11px] font-bold text-mustard">
              {queue.length} ממתינות
            </span>
          </div>

          <div className="ps-3">
            {queue.length === 0 ? (
              <div className="py-12 text-center font-mono text-sm text-ink/50">התור ריק ✓</div>
            ) : (
              queue.slice(0, 8).map((r, i) => {
                const st = rowStatus(r);
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 border-b border-dashed border-ink/30 py-3 pe-4 transition-colors hover:bg-mustard/20"
                  >
                    <span className="w-7 font-mono text-xs text-tomato/80">
                      {String(i + 1).padStart(2, '0')}.
                    </span>
                    <span
                      className="relative grid size-11 shrink-0 place-items-center border-2 border-ink bg-lilac font-display font-black text-ink"
                      style={{ transform: 'rotate(-2deg)' }}
                    >
                      {r.studentName?.[0] ?? '?'}
                      {r.isLate && (
                        <span className="absolute -bottom-2 -left-2 border border-ink bg-tomato px-1 font-mono text-[8px] font-bold text-paper">
                          איחור
                        </span>
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-ink">{r.studentName}</div>
                      <div className="truncate font-mono text-[11px] text-ink/55">
                        {r.courseName} / {r.assignmentTitle}
                      </div>
                    </div>
                    <StatusPill variant={st.variant} className="hidden sm:inline-flex">{st.label}</StatusPill>
                    <span className="hidden w-16 text-left font-mono text-[11px] text-ink/50 md:inline">
                      {relTime(r.submittedAt)}
                    </span>
                    {r.submissionScore != null && (
                      <span className="pen-circle font-mono text-lg font-bold tabular text-tomato">
                        {r.submissionScore}
                      </span>
                    )}
                    <button
                      onClick={() => navigate('/teacher/reports')}
                      className="border-2 border-ink bg-paper px-2.5 py-1 text-xs font-bold shadow-brutal-sm hover-lift"
                    >
                      סקירה →
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between border-t-2 border-ink px-4 py-2.5">
            <span className="font-mono text-[11px] text-ink/50">
              {Math.min(queue.length, 8)}/{queue.length}
            </span>
            <button onClick={() => navigate('/teacher/reports')} className="ink-underline text-sm font-bold text-ink">
              טעני הבא ↓
            </button>
          </div>
        </div>

        {/* Student mirror */}
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-forest blink" />
            <span className="font-mono text-[11px] uppercase tracking-wider text-ink/60">
              תצוגת תלמידה · חי — MIRROR /02
            </span>
          </div>

          {/* Assignment brief — chalkboard */}
          <div className="relative border-2 border-ink bg-ink p-5 text-paper shadow-brutal">
            <Tape color="tomato" rotate={6} className="-top-3 right-6 h-5 w-16" />
            <Tape color="mustard" rotate={-6} className="-top-3 left-6 h-5 w-16" />
            <div className="absolute left-4 top-4 border-2 border-mustard bg-mustard px-2 py-0.5 font-mono text-[10px] font-bold text-ink">
              דדליין 23:59
            </div>
            <div className="font-mono text-[11px] uppercase tracking-wider text-mustard">
              {spotlight?.courseName ?? 'קורס'}
            </div>
            <h3 className="mt-1 font-display text-2xl font-bold text-paper">
              {spotlight?.assignmentTitle ?? 'אין מטלה פעילה'}
            </h3>
            <div className="mt-1 font-mono text-xs text-paper/60">
              {spotlight?.studentName ?? '—'} · {spotlight ? formatDateTime(spotlight.submittedAt) : ''}
            </div>

            <ul className="mt-4 space-y-2">
              {['פתרון מלא ומוסבר', 'הרצה ללא שגיאות', 'הגשה בזמן'].map((req, idx) => (
                <li key={req} className="flex items-center gap-2 text-sm text-paper/90">
                  <span className="grid size-4 place-items-center border-2 border-paper/70">
                    {idx < 2 ? <CheckSquare size={12} className="text-forest" /> : <Square size={12} />}
                  </span>
                  {req}
                </li>
              ))}
            </ul>

            <div className="mt-4 flex items-center justify-center gap-2 border-2 border-dashed border-paper/40 py-5 text-paper/60">
              <UploadCloud size={18} /> <span className="font-mono text-xs">גררי קובץ לכאן</span>
            </div>

            <button
              className="mt-4 w-full border-2 border-ink bg-mustard py-2.5 font-bold text-ink transition-all duration-150 ease-linear hover:-translate-x-0.5 hover:-translate-y-0.5"
              style={{ boxShadow: '5px 5px 0 0 oklch(var(--tomato))' }}
            >
              הגשה סופית
            </button>
          </div>

          {/* Grade feedback */}
          <div className="relative border-2 border-ink bg-notebook p-5 shadow-brutal">
            <Tape color="lilac" rotate={-5} className="-top-3 right-8 h-5 w-16" />
            <Paperclip rotate={8} className="-top-4 left-8" />
            <div className="font-mono text-[11px] uppercase tracking-wider text-ink/55">משוב אחרון</div>
            <h3 className="mt-1 font-display text-xl font-bold text-ink">
              <span className="scribble-underline">{lastGraded?.assignmentTitle ?? 'משוב לדוגמה'}</span>
            </h3>

            <span
              className="pen-circle my-3 inline-flex font-mono text-3xl font-bold tabular text-tomato"
              style={{ transform: 'rotate(-6deg)' }}
            >
              {lastGraded?.contentScore ?? avg}
            </span>

            <div className="space-y-2.5">
              {[
                { label: 'נכונות', frac: '9/10', accent: 'cobalt', pct: 90 },
                { label: 'קוד נקי', frac: '8/10', accent: 'plum', pct: 80 },
                { label: 'בזמן', frac: '10/10', accent: 'forest', pct: 100 },
              ].map((row) => (
                <div key={row.label} className="flex items-center gap-2">
                  <span className="w-14 text-xs font-bold text-ink">{row.label}</span>
                  <span className="w-10 font-mono text-[11px] text-ink/60">{row.frac}</span>
                  <span className="h-3 flex-1 border-2 border-ink bg-white">
                    <span className={cn('block h-full', `bg-${row.accent}`)} style={{ width: `${row.pct}%` }} />
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 border-2 border-ink bg-mustard/25 p-3">
              <div className="mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase text-ink/60">
                <Sparkles size={12} /> הערת שוליים · AI
              </div>
              <p className="font-display text-sm italic leading-relaxed text-ink">
                "{lastGraded?.feedback ?? 'עבודה יסודית. שימי לב לחלוקה לפונקציות קטנות יותר בפעם הבאה.'}"
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
