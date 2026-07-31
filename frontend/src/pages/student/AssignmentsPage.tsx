import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Search } from 'lucide-react';
import { submissionsApi } from '@/api/submissions.api';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
import { PageHeader } from '@/components/ui/page-header';
import { formatDate, formatDateTime, isOverdue } from '@/lib/utils';

export default function AssignmentsPage() {
  const { data } = useQuery({ queryKey: ['mine'], queryFn: () => submissionsApi.mine() });
  const mine = (data?.data as any)?.data;
  const pending: any[] = mine?.pending ?? [];
  const submitted: any[] = mine?.submitted ?? [];
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const sortedPending = [...pending].sort((a, b) => {
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
  });

  const q = search.trim().toLowerCase();
  const matches = (item: any) =>
    !q || [item.assignmentTitle, item.courseName].some((f) => f?.toLowerCase().includes(q));

  const filteredPending = sortedPending.filter(matches);
  const filteredSubmitted = submitted.filter(matches);

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader title="המטלות שלי" meta="מחברת · מטלות" />

      {/* Local search — filters both lists below by assignment title or course name */}
      <div className="flex items-center gap-2 rounded-input border border-rule bg-sheet px-3 py-1.5 transition-colors focus-within:border-clay sm:max-w-sm">
        <Search size={15} className="text-ink-soft" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-soft"
          placeholder="חיפוש מטלה או קורס"
        />
        {search && (
          <button onClick={() => setSearch('')} className="text-xs text-ink-soft hover:text-coral">✕</button>
        )}
      </div>

      {/* Pending + Submitted — two independent lists, side by side on wide screens */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Pending */}
        <Card accent="coral">
          <CardHeader>
            <h2 className="font-display text-base font-bold">לא הוגשו ({filteredPending.length})</h2>
          </CardHeader>
          <div className="divide-y divide-rule/20">
            {sortedPending.length === 0 ? (
              <p className="px-5 py-4 text-sm text-ink/50">אין מטלות פתוחות 🎉</p>
            ) : filteredPending.length === 0 ? (
              <p className="px-5 py-4 text-sm text-ink/50">{`אין תוצאות ל"${search.trim()}"`}</p>
            ) : null}
            {filteredPending.map((p) => (
              <div key={p.assignmentId} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{p.assignmentTitle}</p>
                  <p className="text-xs text-ink/50">{p.courseName} · {p.lessonTopic}</p>
                </div>
                {p.deadline && (
                  <Badge variant={isOverdue(p.deadline) ? 'default' : 'warning'}>
                    {isOverdue(p.deadline) ? 'פג תוקף' : formatDate(p.deadline)}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* Submitted */}
        <Card accent="sage">
          <CardHeader>
            <h2 className="font-display text-base font-bold">הוגשו ({filteredSubmitted.length})</h2>
          </CardHeader>
          <div className="divide-y divide-rule/20">
            {submitted.length === 0 ? (
              <p className="px-5 py-4 text-sm text-ink/50">לא הוגשו מטלות עדיין</p>
            ) : filteredSubmitted.length === 0 ? (
              <p className="px-5 py-4 text-sm text-ink/50">{`אין תוצאות ל"${search.trim()}"`}</p>
            ) : null}
            {filteredSubmitted.map((s) => (
              <div key={s.submissionId}>
                <button
                  className="w-full px-5 py-3 flex items-center justify-between hover:bg-ground/60 transition text-right"
                  onClick={() => setExpanded(expanded === s.submissionId ? null : s.submissionId)}
                >
                  <div>
                    <p className="text-sm font-medium">{s.assignmentTitle}</p>
                    <p className="text-xs text-ink/50">{s.courseName} · {formatDateTime(s.submittedAt)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {s.isLate && <Badge variant="warning">איחור</Badge>}
                    {s.grade?.submissionScore != null && (
                      <span className="font-semibold text-sm text-ink">{s.grade.submissionScore}</span>
                    )}
                    {s.grade ? (
                      expanded === s.submissionId ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    ) : (
                      <Badge variant="muted">ממתין לציון</Badge>
                    )}
                  </div>
                </button>

                {expanded === s.submissionId && s.grade && (
                  <div className="px-5 pb-4 space-y-3 bg-ground/60">
                    <div className="flex flex-wrap gap-4 pt-3 text-sm">
                      {s.grade.submissionScore != null && (
                        <p><span className="text-ink/50">ציון הגשה: </span><span className="font-semibold text-ink">{s.grade.submissionScore}</span></p>
                      )}
                      {s.grade.contentScore != null && (
                        <p><span className="text-ink/50">ציון תוכן: </span><span className="font-semibold text-ink">{s.grade.contentScore}</span></p>
                      )}
                    </div>
                    {s.grade.checklist?.map((c: any) => (
                      <div key={c.id} className={`text-xs flex items-center gap-1.5 ${c.checked ? 'text-sage' : 'text-ink/50'}`}>
                        <span>{c.checked ? '✓' : '✗'}</span> {c.text}
                      </div>
                    ))}
                    {s.grade.feedback && (
                      <MarkdownRenderer content={s.grade.feedback} className="text-xs" />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
