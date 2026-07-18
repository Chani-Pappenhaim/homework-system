import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { submissionsApi } from '@/api/submissions.api';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
import { formatDate, formatDateTime, isOverdue } from '@/lib/utils';

export default function AssignmentsPage() {
  const { data } = useQuery({ queryKey: ['mine'], queryFn: () => submissionsApi.mine() });
  const mine = (data?.data as any)?.data;
  const pending: any[] = mine?.pending ?? [];
  const submitted: any[] = mine?.submitted ?? [];
  const [expanded, setExpanded] = useState<string | null>(null);

  const sortedPending = [...pending].sort((a, b) => {
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
  });

  return (
    <div className="max-w-2xl space-y-5" dir="rtl">
      <h1 className="text-xl font-bold">המטלות שלי</h1>

      {/* Pending */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-sm">לא הוגשו ({sortedPending.length})</h2>
        </CardHeader>
        <div className="divide-y divide-[#EEEBF5]">
          {sortedPending.length === 0 && (
            <p className="px-5 py-4 text-sm text-[#9CA3AF]">אין מטלות פתוחות 🎉</p>
          )}
          {sortedPending.map((p) => (
            <div key={p.assignmentId} className="px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{p.assignmentTitle}</p>
                <p className="text-xs text-[#9CA3AF]">{p.courseName} · {p.lessonTopic}</p>
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
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-sm">הוגשו ({submitted.length})</h2>
        </CardHeader>
        <div className="divide-y divide-[#EEEBF5]">
          {submitted.length === 0 && (
            <p className="px-5 py-4 text-sm text-[#9CA3AF]">לא הוגשו מטלות עדיין</p>
          )}
          {submitted.map((s) => (
            <div key={s.submissionId}>
              <button
                className="w-full px-5 py-3 flex items-center justify-between hover:bg-[#F8F7FC] transition text-right"
                onClick={() => setExpanded(expanded === s.submissionId ? null : s.submissionId)}
              >
                <div>
                  <p className="text-sm font-medium">{s.assignmentTitle}</p>
                  <p className="text-xs text-[#9CA3AF]">{s.courseName} · {formatDateTime(s.submittedAt)}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {s.isLate && <Badge variant="warning">איחור</Badge>}
                  {s.grade?.score != null && (
                    <span className="font-semibold text-sm text-[#1A1830]">{s.grade.score}</span>
                  )}
                  {s.grade ? (
                    expanded === s.submissionId ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                  ) : (
                    <Badge variant="muted">ממתין לציון</Badge>
                  )}
                </div>
              </button>

              {expanded === s.submissionId && s.grade && (
                <div className="px-5 pb-4 space-y-3 bg-[#F8F7FC]">
                  {s.grade.checklist?.map((c: any) => (
                    <div key={c.id} className={`text-xs flex items-center gap-1.5 ${c.checked ? 'text-[#059669]' : 'text-[#9CA3AF]'}`}>
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
  );
}
