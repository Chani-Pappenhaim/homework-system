import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Pencil, Sparkles } from 'lucide-react';
import useAuthStore from '@/store/authStore';
import useUiStore from '@/store/uiStore';
import { groupsApi } from '@/api/groups.api';
import { coursesApi } from '@/api/courses.api';
import { gradesApi } from '@/api/grades.api';
import { aiUsageApi } from '@/api/aiUsage.api';
import { Tape, StatusPill, type PillVariant } from '@/components/decor';
import { cn } from '@/lib/utils';
import type { ReportRow } from '@/types';

function relTime(iso?: string): string {
  if (!iso) return '—';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'עכשיו';
  if (m < 60) return `לפני ${m}′`;
  const h = Math.floor(m / 60);
  if (h < 24) return `לפני ${h}ש׳`;
  return `לפני ${Math.floor(h / 24)}י׳`;
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'בוקר טוב' : h < 18 ? 'צהריים טובים' : 'ערב טוב';
}

function rowStatus(r: ReportRow): { variant: PillVariant; label: string } {
  if (r.contentScore != null) return { variant: 'approved', label: 'אושר' };
  if (r.submissionScore != null) return { variant: 'ai', label: 'נבדק AI' };
  return { variant: 'pending', label: 'ממתין' };
}

export default function TeacherHomePage() {
  const user = useAuthStore((s) => s.user);
  const search = useUiStore((s) => s.search);
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);

  const { data: groupsData } = useQuery({ queryKey: ['groups'], queryFn: () => groupsApi.list() });
  const { data: coursesData } = useQuery({ queryKey: ['courses'], queryFn: () => coursesApi.list() });
  const { data: pendingData } = useQuery({ queryKey: ['pending'], queryFn: () => gradesApi.pending() });
  const { data: aiUsageData } = useQuery({ queryKey: ['ai-usage-summary'], queryFn: () => aiUsageApi.summary() });
  const { data: reportData, isLoading: reportLoading } = useQuery({ queryKey: ['report', {}], queryFn: () => gradesApi.report() });

  const groups = groupsData?.data.data.groups ?? [];
  const courses = coursesData?.data.data.courses ?? [];
  const pending = (pendingData?.data as any)?.data?.count ?? 0;
  const aiCost = (aiUsageData?.data as any)?.data?.totalCostUsd;
  const report: ReportRow[] = (reportData?.data as any)?.data?.report ?? [];

  const q = search.trim().toLowerCase();
  const matches = (r: ReportRow) =>
    !q || [r.studentName, r.courseName, r.assignmentTitle, r.groupName].some((f) => f?.toLowerCase().includes(q));

  const queue = report.filter((r) => r.contentScore == null && matches(r));
  const graded = report.filter((r) => r.contentScore != null);
  const visible = showAll ? queue : queue.slice(0, 8);
  const avg = graded.length
    ? (graded.reduce((s, r) => s + (r.contentScore ?? 0), 0) / graded.length).toFixed(1)
    : '—';

  const dateMeta = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  // "שלום, עדי!" — a hello that is also the teacher's name (עדי שלום).
  const firstName = (user?.name ?? 'עדי שלום').split(' ')[0];

  const kpis = [
    { value: groups.length, label: 'קבוצות', accent: 'indigo' as const, to: '/teacher/groups' },
    { value: courses.length, label: 'קורסים', accent: 'clay' as const, to: '/teacher/courses' },
    { value: pending, label: 'ממתינות לבדיקה', accent: 'coral' as const, to: '/teacher/reports' },
    { value: aiCost != null ? `$${Number(aiCost).toFixed(2)}` : '—', label: 'עלות AI', accent: 'sage' as const, to: '/teacher/ai-usage' },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5" dir="rtl">
      {/* Greeting sheet */}
      <section className="sheet relative p-5">
        <Tape color="indigo" rotate={2.5} className="-top-2.5 left-8 w-20" />
        <div className="label mb-1">{greeting()} · {dateMeta} · {pending > 0 ? `${pending} הגשות ממתינות` : 'אין ממתינות'}</div>
        <h1 className="font-display text-2xl font-bold text-ink">שלום, {firstName}!</h1>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {kpis.map((k) => (
            <button key={k.label} onClick={() => navigate(k.to)} className="text-right">
              <div className="label mb-1">{k.label}</div>
              <div className={cn('font-display text-2xl font-bold tabular', `text-${k.accent}`)}>{k.value}</div>
            </button>
          ))}
        </div>
      </section>

      {/* Review queue */}
      <section className="sheet">
        <div className="flex items-center gap-2 border-b border-rule px-4 py-3">
          <Pencil size={15} className="text-clay" />
          <h2 className="font-display text-base font-bold">יומן בדיקה</h2>
          <span className="label mr-auto">{queue.length} ממתינות</span>
        </div>

        <div className="bg-margin">
          {reportLoading ? (
            <div className="py-12 text-center text-sm text-ink-soft">טוען…</div>
          ) : queue.length === 0 ? (
            <div className="py-12 text-center text-sm text-ink-soft">
              {search ? `אין תוצאות ל"${search}"` : 'התור ריק — כל הכבוד'}
            </div>
          ) : (
            visible.map((r, i) => {
              const st = rowStatus(r);
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 border-b border-rule/60 px-4 py-2.5 pr-12 transition-colors hover:bg-butter/10"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-indigo/12 text-xs font-semibold text-indigo">
                    {r.studentName?.[0] ?? '?'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-ink">{r.studentName}</div>
                    <div className="truncate text-[11px] text-ink-soft">{r.courseName} · {r.assignmentTitle}</div>
                  </div>
                  {r.isLate && <span className="hidden text-[10px] font-semibold text-coral sm:inline">איחור</span>}
                  <StatusPill variant={st.variant} className="hidden sm:inline-flex">{st.label}</StatusPill>
                  <span className="hidden w-16 text-left text-[11px] text-ink-soft md:inline">{relTime(r.submittedAt)}</span>
                  {r.submissionScore != null && (
                    <span className="w-8 text-left font-display text-base font-bold tabular text-clay">{r.submissionScore}</span>
                  )}
                  <button
                    onClick={() => navigate('/teacher/reports')}
                    className="rounded-input border border-rule px-2.5 py-1 text-xs font-semibold text-ink transition-colors hover:bg-ground"
                  >
                    סקירה
                  </button>
                </div>
              );
            })
          )}
        </div>

        {queue.length > 8 && (
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="label">{visible.length}/{queue.length}</span>
            <button onClick={() => setShowAll((v) => !v)} className="text-sm font-semibold text-clay hover:underline">
              {showAll ? 'הצג פחות' : 'טעני הבא'}
            </button>
          </div>
        )}
      </section>

      {/* Last feedback */}
      {graded[0]?.feedback && (
        <section className="sheet relative p-5">
          <div className="label mb-1 flex items-center gap-1.5"><Sparkles size={13} className="text-clay" /> משוב אחרון · {graded[0].assignmentTitle}</div>
          <p className="text-sm leading-relaxed text-ink">"{graded[0].feedback}"</p>
          <div className="mt-2 text-xs text-ink-soft">ממוצע השבוע: <span className="font-semibold text-clay tabular">{avg}</span></div>
        </section>
      )}
    </div>
  );
}
