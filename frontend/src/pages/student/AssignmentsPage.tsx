import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Github, Paperclip, Search } from 'lucide-react';
import { submissionsApi } from '@/api/submissions.api';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
import { PageHeader } from '@/components/ui/page-header';
import { cn, formatDate, formatDateTime, isOverdue } from '@/lib/utils';
import { unwrap } from '@/lib/api-utils';
import type { MySubmission, PendingAssignment } from '@/types';

type ViewingItem = { type: 'pending'; item: PendingAssignment } | { type: 'submitted'; item: MySubmission };

export default function AssignmentsPage() {
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: ['mine'], queryFn: () => submissionsApi.mine() });
  const mine = unwrap(data);
  const pending: PendingAssignment[] = mine?.pending ?? [];
  const submitted: MySubmission[] = mine?.submitted ?? [];
  const [viewing, setViewing] = useState<ViewingItem | null>(null);
  const [searchMode, setSearchMode] = useState<'assignment' | 'course'>('assignment');
  const [search, setSearch] = useState('');

  const sortedPending = [...pending].sort((a, b) => {
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
  });

  const q = search.trim().toLowerCase();
  const matches = (item: { assignmentTitle: string; courseName: string }) =>
    !q || (searchMode === 'assignment' ? item.assignmentTitle : item.courseName)?.toLowerCase().includes(q);
  const noResultsLabel = search.trim();

  const filteredPending = sortedPending.filter(matches);
  const filteredSubmitted = submitted.filter(matches);

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        title="המטלות שלי"
        meta="מחברת · מטלות"
        actions={
          <div className="flex items-center gap-2">
            <div className="flex rounded-input border border-rule bg-sheet p-0.5">
              <button
                onClick={() => setSearchMode('assignment')}
                className={cn(
                  'rounded-[6px] px-2.5 py-1 text-xs font-semibold transition-colors',
                  searchMode === 'assignment' ? 'bg-ink text-sheet' : 'text-ink-soft hover:bg-ground',
                )}
              >
                מטלה
              </button>
              <button
                onClick={() => setSearchMode('course')}
                className={cn(
                  'rounded-[6px] px-2.5 py-1 text-xs font-semibold transition-colors',
                  searchMode === 'course' ? 'bg-ink text-sheet' : 'text-ink-soft hover:bg-ground',
                )}
              >
                קורס
              </button>
            </div>
            <div className="flex items-center gap-2 rounded-input border border-rule bg-sheet px-3 py-1.5 transition-colors focus-within:border-clay">
              <Search size={15} className="text-ink-soft" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-40 bg-transparent text-sm text-ink outline-none placeholder:text-ink-soft"
                placeholder={searchMode === 'assignment' ? 'חיפוש לפי מטלה' : 'חיפוש לפי קורס'}
              />
              {search && (
                <button onClick={() => setSearch('')} className="text-xs text-ink-soft hover:text-coral">✕</button>
              )}
            </div>
          </div>
        }
      />

      {viewing ? (
        <Card accent={viewing.type === 'pending' ? 'coral' : 'sage'}>
          <CardHeader>
            <button
              onClick={() => setViewing(null)}
              className="flex items-center gap-1.5 text-xs font-semibold text-ink-soft hover:text-ink transition-colors"
            >
              <ArrowRight size={14} /> חזרה לרשימה
            </button>
          </CardHeader>
          <div className="p-5 space-y-4">
            {viewing.type === 'pending' ? (
              <PendingDetail item={viewing.item} onGoToLesson={() => navigate(`/student/lessons/${viewing.item.lessonId}`)} />
            ) : (
              <SubmittedDetail item={viewing.item} />
            )}
          </div>
        </Card>
      ) : (
        /* Two independent lists, side by side on wide screens */
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card accent="coral">
            <CardHeader>
              <h2 className="font-display text-base font-bold">לא הוגשו ({filteredPending.length})</h2>
            </CardHeader>
            <div className="divide-y divide-rule/20">
              {sortedPending.length === 0 ? (
                <p className="px-5 py-4 text-sm text-ink/50">אין מטלות פתוחות 🎉</p>
              ) : filteredPending.length === 0 ? (
                <p className="px-5 py-4 text-sm text-ink/50">{`אין תוצאות ל"${noResultsLabel}"`}</p>
              ) : null}
              {filteredPending.map((p) => (
                <button
                  key={p.assignmentId}
                  onClick={() => setViewing({ type: 'pending', item: p })}
                  className="w-full px-5 py-3 flex items-center justify-between hover:bg-ground/60 transition text-right"
                >
                  <div>
                    <p className="text-sm font-medium">{p.assignmentTitle}</p>
                    <p className="text-xs text-ink/50">{p.courseName} · {p.lessonTopic}</p>
                  </div>
                  {p.deadline && (
                    <Badge variant={isOverdue(p.deadline) ? 'default' : 'warning'}>
                      {isOverdue(p.deadline) ? 'פג תוקף' : formatDate(p.deadline)}
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          </Card>

          <Card accent="sage">
            <CardHeader>
              <h2 className="font-display text-base font-bold">הוגשו ({filteredSubmitted.length})</h2>
            </CardHeader>
            <div className="divide-y divide-rule/20">
              {submitted.length === 0 ? (
                <p className="px-5 py-4 text-sm text-ink/50">לא הוגשו מטלות עדיין</p>
              ) : filteredSubmitted.length === 0 ? (
                <p className="px-5 py-4 text-sm text-ink/50">{`אין תוצאות ל"${noResultsLabel}"`}</p>
              ) : null}
              {filteredSubmitted.map((s) => (
                <button
                  key={s.submissionId}
                  onClick={() => setViewing({ type: 'submitted', item: s })}
                  className="w-full px-5 py-3 flex items-center justify-between hover:bg-ground/60 transition text-right"
                >
                  <div>
                    <p className="text-sm font-medium">{s.assignmentTitle}</p>
                    <p className="text-xs text-ink/50">{s.courseName} · {formatDateTime(s.submittedAt)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {s.isLate && <Badge variant="warning">איחור</Badge>}
                    {s.grade?.submissionScore != null ? (
                      <span className="font-semibold text-sm text-ink">{s.grade.submissionScore}</span>
                    ) : (
                      <Badge variant="muted">ממתין לציון</Badge>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function PendingDetail({ item, onGoToLesson }: { item: PendingAssignment; onGoToLesson: () => void }) {
  const overdue = item.deadline && isOverdue(item.deadline);
  return (
    <>
      <div>
        <h3 className="font-display text-lg font-bold text-ink">{item.assignmentTitle}</h3>
        <p className="text-xs text-ink-soft mt-0.5">{item.courseName} · {item.lessonTopic}</p>
      </div>
      {item.deadline && (
        <p className="text-sm">
          <span className="text-ink-soft">מועד אחרון: </span>
          <Badge variant={overdue ? 'default' : 'warning'}>{overdue ? 'פג תוקף' : formatDate(item.deadline)}</Badge>
        </p>
      )}
      <Button onClick={onGoToLesson}>מעבר לשיעור להגשה</Button>
    </>
  );
}

function SubmittedDetail({ item }: { item: MySubmission }) {
  return (
    <>
      <div>
        <h3 className="font-display text-lg font-bold text-ink">{item.assignmentTitle}</h3>
        <p className="text-xs text-ink-soft mt-0.5">{item.courseName} · {item.lessonTopic}</p>
      </div>
      <div className="bg-sage/10 border border-sage/30 rounded-input p-3 text-sm space-y-1">
        <p className="text-ink/70 text-xs">הוגש: {formatDateTime(item.submittedAt)}</p>
        {item.isLate && <Badge variant="warning">הוגש באיחור</Badge>}
        {item.notes && <p className="text-xs text-ink/70">הערה: {item.notes}</p>}
      </div>

      {(item.githubUrl || item.fileUrl) && (
        <div className="flex flex-wrap gap-2">
          {item.githubUrl && (
            <a href={item.githubUrl} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm border border-rule/20 rounded-input px-4 py-2 text-ink hover:bg-ground/60 transition">
              <Github size={14} /> קוד ב-GitHub
            </a>
          )}
          {item.fileUrl && (
            <a href={item.fileUrl} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm border border-rule/20 rounded-input px-4 py-2 text-ink hover:bg-ground/60 transition">
              <Paperclip size={14} /> {item.fileName || 'קובץ שהוגש'}
            </a>
          )}
        </div>
      )}

      {item.aiStatus === 'done' && item.aiApproved && (
        <div className="border border-rule/15 rounded-input p-3 text-sm space-y-1">
          <p className="font-medium text-ink">בדיקת AI</p>
          <p className="font-semibold">ציון: {item.aiScore}</p>
          {item.aiVerbalReview && <p className="text-ink/70 text-xs">{item.aiVerbalReview}</p>}
        </div>
      )}

      {item.grade && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-4 text-sm">
            {item.grade.submissionScore != null && (
              <p><span className="text-ink/50">ציון הגשה: </span><span className="font-semibold text-ink">{item.grade.submissionScore}</span></p>
            )}
            {item.grade.contentScore != null && (
              <p><span className="text-ink/50">ציון תוכן: </span><span className="font-semibold text-ink">{item.grade.contentScore}</span></p>
            )}
          </div>
          {item.grade.checklist?.map((c) => (
            <div key={c.id} className={`text-xs flex items-center gap-1.5 ${c.checked ? 'text-sage' : 'text-ink/50'}`}>
              <span>{c.checked ? '✓' : '✗'}</span> {c.text}
            </div>
          ))}
          {item.grade.feedback && <MarkdownRenderer content={item.grade.feedback} className="text-xs" />}
        </div>
      )}
    </>
  );
}
