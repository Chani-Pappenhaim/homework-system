import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, MessageSquare, AlertCircle, Clock } from 'lucide-react';
import { studentsApi, type StudentOverview } from '@/api/students.api';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { unwrap } from '@/lib/api-utils';
import { cn } from '@/lib/utils';
import { scoreTone } from '@/lib/scores';
import { usePageTitle } from '@/hooks/usePageTitle';

const selectClass =
  'rounded-input border border-rule bg-sheet px-3 py-2 text-sm text-ink shadow-soft transition-colors focus:border-clay focus:outline-none';

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-ground/60 px-2 py-2 text-center">
      <div className={cn('font-display text-lg font-black leading-tight', tone ?? 'text-ink')}>{value}</div>
      <div className="font-sans text-[11px] text-ink/55">{label}</div>
    </div>
  );
}

function StudentCard({ s }: { s: StudentOverview }) {
  const { total, submitted, late, missing } = s.assignments;
  const submittedPct = total ? Math.round((submitted * 100) / total) : null;
  return (
    <Link to={`/teacher/students/${s.id}`} className="group block focus:outline-none">
      <Card className="h-full p-4 transition-shadow group-hover:shadow-lift group-focus-visible:ring-2 group-focus-visible:ring-clay">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-display text-base font-bold text-ink">{s.name}</p>
            <p className="truncate text-xs text-ink/50" dir="ltr">{s.email}</p>
          </div>
          {s.unreadMessages > 0 && (
            <Badge variant="destructive" title="הודעות שלא נקראו">
              <MessageSquare size={11} /> {s.unreadMessages}
            </Badge>
          )}
        </div>

        {s.groupNames.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {s.groupNames.map((g) => <Badge key={g}>{g}</Badge>)}
          </div>
        )}

        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat label="הגשות" value={total ? `${submitted}/${total}` : '—'} tone={scoreTone(submittedPct)} />
          <Stat label="ממוצע תוכן" value={s.averageContentScore != null ? String(s.averageContentScore) : '—'} tone={scoreTone(s.averageContentScore)} />
          <Stat label="נוכחות" value={s.attendance.rate != null ? `${s.attendance.rate}%` : '—'} tone={scoreTone(s.attendance.rate)} />
        </div>

        {(missing > 0 || late > 0) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {missing > 0 && <Badge variant="destructive"><AlertCircle size={11} /> {missing} חסרות</Badge>}
            {late > 0 && <Badge variant="warning"><Clock size={11} /> {late} באיחור</Badge>}
          </div>
        )}
      </Card>
    </Link>
  );
}

export default function StudentsPage() {
  usePageTitle('תלמידות');
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const [onlyAttention, setOnlyAttention] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ['students', 'overview'], queryFn: () => studentsApi.overview() });
  const students = unwrap(data)?.students ?? [];

  const groupOptions = useMemo(
    () => [...new Set(students.flatMap((s) => s.groupNames))].sort((a, b) => a.localeCompare(b, 'he')),
    [students],
  );

  const q = query.trim().toLowerCase();
  const shown = students.filter((s) =>
    (!q || s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q))
    && (!group || (group === '__none' ? s.groupNames.length === 0 : s.groupNames.includes(group)))
    && (!onlyAttention || s.assignments.missing > 0 || s.unreadMessages > 0));

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader title="תלמידות" meta={`תלמידות · ${students.length}`} />

      <Card>
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-input border border-rule bg-sheet px-3 py-2 shadow-soft focus-within:border-clay">
            <Search size={15} className="text-ink-soft" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="חיפוש לפי שם או מייל"
              aria-label="חיפוש תלמידה"
              className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-soft"
            />
          </label>
          <select value={group} onChange={(e) => setGroup(e.target.value)} className={selectClass} aria-label="סינון לפי קבוצה">
            <option value="">כל הקבוצות</option>
            {groupOptions.map((g) => <option key={g} value={g}>{g}</option>)}
            <option value="__none">ללא קבוצה</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-ink/80">
            <input type="checkbox" checked={onlyAttention} onChange={(e) => setOnlyAttention(e.target.checked)} className="accent-clay" />
            דורשות תשומת לב
          </label>
        </div>
      </Card>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-44" />)}
        </div>
      ) : shown.length === 0 ? (
        <EmptyState>{students.length === 0 ? 'עדיין אין תלמידות במערכת' : 'אין תלמידות שמתאימות לחיפוש'}</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((s) => <StudentCard key={s.id} s={s} />)}
        </div>
      )}
    </div>
  );
}
