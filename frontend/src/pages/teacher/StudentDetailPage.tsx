import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BarChart2, ClipboardCheck, Github, Mail, MailWarning, MessageSquare } from 'lucide-react';
import { studentsApi, type StudentProfile } from '@/api/students.api';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { STATUS_META, formatDay } from '@/lib/attendance';
import { cn, formatDate, formatDateTime } from '@/lib/utils';
import { unwrap } from '@/lib/api-utils';
import { getApiErrorMessage } from '@/lib/errors';
import { usePageTitle } from '@/hooks/usePageTitle';
import { scoreTone } from '@/lib/scores';

type Work = StudentProfile['work'][number];
type WorkFilter = 'all' | 'missing' | 'submitted';

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <h2 className="font-display text-base font-bold">{title}</h2>
        {count != null && <span className="font-sans text-xs text-ink/50">{count}</span>}
      </CardHeader>
      {children}
    </Card>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <Card className="px-4 py-3 text-center" shadow={false}>
      <div className={cn('font-display text-2xl font-black', tone ?? 'text-ink')}>{value}</div>
      <div className="font-sans text-xs text-ink/60">{label}</div>
      {sub && <div className="mt-0.5 font-sans text-[11px] text-ink/45">{sub}</div>}
    </Card>
  );
}

function WorkStatus({ w }: { w: Work }) {
  if (w.submission) return w.submission.isLate ? <Badge variant="warning">באיחור</Badge> : <Badge variant="success">הוגש</Badge>;
  if (w.overdue) return <Badge variant="destructive">חסר</Badge>;
  return <Badge variant="muted">טרם הוגש</Badge>;
}

function Score({ label, value, pending }: { label: string; value: number | null; pending?: boolean }) {
  return (
    <span className="text-xs text-ink/55">
      {label}{' '}
      <span className={cn('font-semibold', value != null ? 'text-ink' : 'text-ink/40')}>{value ?? '—'}</span>
      {pending && <span className="mr-1 text-[10px] text-clay">(טרם אושר)</span>}
    </span>
  );
}

function WorkList({ work }: { work: Work[] }) {
  const [filter, setFilter] = useState<WorkFilter>('all');
  const shown = work.filter((w) =>
    filter === 'all' || (filter === 'missing' ? !w.submission && w.overdue : !!w.submission));
  const filters: [WorkFilter, string][] = [['all', 'הכל'], ['missing', 'חסרות'], ['submitted', 'הוגשו']];

  return (
    <Section title="הגשות וציונים" count={work.length}>
      <div className="flex gap-1.5 border-b border-rule px-5 py-2.5">
        {filters.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cn(
              'rounded-full px-3 py-1 text-xs transition-colors',
              filter === key ? 'bg-ink text-sheet' : 'text-ink/60 hover:bg-ground',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <EmptyState className="border-0">אין מטלות להצגה</EmptyState>
      ) : (
        <ul className="divide-y divide-dashed divide-rule/40">
          {shown.map((w) => (
            <li key={w.assignmentId} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{w.title}</p>
                <p className="truncate text-xs text-ink/50">
                  {w.courseName} · {w.lessonTopic}
                  {w.submission
                    ? ` · הוגש ${formatDateTime(w.submission.submittedAt)}`
                    : w.deadline ? ` · עד ${formatDate(w.deadline)}` : ''}
                </p>
              </div>
              <WorkStatus w={w} />
              {w.submission && (
                <>
                  <div className="flex gap-3">
                    <Score label="הגשה" value={w.submission.submissionScore} />
                    <Score
                      label="תוכן"
                      value={w.submission.contentScore}
                      pending={w.submission.contentScore != null && !w.submission.contentApproved}
                    />
                  </div>
                  <Link
                    to={`/teacher/lessons/${w.lessonId}?assignmentId=${w.assignmentId}&submissionId=${w.submission.id}`}
                    className="inline-flex items-center gap-1 text-xs text-clay hover:underline"
                  >
                    <ClipboardCheck size={12} /> בדיקה
                  </Link>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function AttendanceList({ courses }: { courses: StudentProfile['attendance'] }) {
  const tracked = courses.filter((c) => c.summary.sessions > 0);
  return (
    <Section title="נוכחות">
      {tracked.length === 0 ? (
        <EmptyState className="border-0">עדיין לא נרשמה נוכחות</EmptyState>
      ) : (
        <ul className="divide-y divide-dashed divide-rule/40">
          {tracked.map((c) => {
            const notes = c.sessions.filter((s) => s.note);
            return (
              <li key={c.courseId} className="space-y-2 px-5 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-medium text-ink">{c.courseName}</p>
                  <span className={cn('font-display text-lg font-black', scoreTone(c.summary.rate))}>
                    {c.summary.rate != null ? `${c.summary.rate}%` : '—'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-3 text-xs">
                  {(['PRESENT', 'ABSENT', 'EXCUSED'] as const).map((st) => {
                    const { icon: Icon, label, text } = STATUS_META[st];
                    const n = c.summary[st === 'PRESENT' ? 'present' : st === 'ABSENT' ? 'absent' : 'excused'];
                    return (
                      <span key={st} className={cn('inline-flex items-center gap-1', text)}>
                        <Icon size={12} /> {label} {n}
                      </span>
                    );
                  })}
                </div>
                {/* Oldest meeting first, so the strip reads like a timeline. */}
                <div className="flex flex-wrap gap-1" aria-hidden>
                  {[...c.sessions].reverse().map((s) => (
                    <span
                      key={s.id}
                      title={`${formatDay(s.date)}${s.title ? ` · ${s.title}` : ''} · ${s.status ? STATUS_META[s.status].label : 'לא סומן'}`}
                      className={cn(
                        'size-3 rounded-sm',
                        s.status === 'PRESENT' ? 'bg-sage' : s.status === 'ABSENT' ? 'bg-coral' : s.status === 'EXCUSED' ? 'bg-butter' : 'bg-rule/40',
                      )}
                    />
                  ))}
                </div>
                {notes.length > 0 && (
                  <ul className="space-y-0.5 text-xs text-ink/65">
                    {notes.map((s) => <li key={s.id}><span className="text-ink/45">{formatDay(s.date)}:</span> {s.note}</li>)}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

function QuizList({ quizzes }: { quizzes: StudentProfile['quizzes'] }) {
  return (
    <Section title="חידונים" count={quizzes.length}>
      {quizzes.length === 0 ? (
        <EmptyState className="border-0">עדיין לא נפתר אף חידון</EmptyState>
      ) : (
        <ul className="divide-y divide-dashed divide-rule/40">
          {quizzes.map((q) => (
            <li key={q.quizId} className="flex items-center justify-between gap-3 px-5 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{q.lessonTopic}</p>
                <p className="truncate text-xs text-ink/50">
                  {q.courseName} · {formatDate(q.takenAt)}
                  {q.attempts > 1 && ` · ${q.attempts - 1} ניסיונות תרגול (הכי גבוה ${Math.round(q.bestScore)})`}
                </p>
              </div>
              <span className={cn('font-display text-lg font-black', scoreTone(q.officialScore))}>
                {q.officialScore != null ? Math.round(q.officialScore) : '—'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function MessageList({ messages }: { messages: StudentProfile['messages'] }) {
  return (
    <Section title="הודעות" count={messages.length}>
      {messages.length === 0 ? (
        <EmptyState className="border-0">אין הודעות</EmptyState>
      ) : (
        <ul className="divide-y divide-dashed divide-rule/40">
          {messages.map((m) => (
            <li key={m.id}>
              <Link to={`/teacher/messages?highlight=${m.id}`} className="block px-5 py-2.5 transition-colors hover:bg-butter/15">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium text-ink">{m.assignmentTitle ? `בקשה: ${m.assignmentTitle}` : 'שיחה'}</p>
                  {m.unread > 0 && <Badge variant="destructive">{m.unread} חדשות</Badge>}
                </div>
                <p className="truncate text-xs text-ink/55">
                  <span className="text-ink/40">{m.lastFromTeacher ? 'את: ' : ''}</span>{m.preview}
                </p>
                <p className="text-[11px] text-ink/40">{formatDateTime(m.lastAt)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ['students', 'profile', id],
    queryFn: () => studentsApi.profile(id!),
    enabled: Boolean(id),
  });
  const profile = unwrap(data);
  usePageTitle(profile?.student.name, 'תלמידות');

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-16" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (error || !profile) {
    return <EmptyState>{error ? getApiErrorMessage(error) : 'התלמידה לא נמצאה'}</EmptyState>;
  }

  const { student, work, attendance, quizzes, messages } = profile;
  const submitted = work.filter((w) => w.submission);
  const missing = work.filter((w) => !w.submission && w.overdue).length;
  const late = submitted.filter((w) => w.submission!.isLate).length;
  const contentScores = submitted.flatMap((w) => (w.submission!.contentScore != null ? [w.submission!.contentScore] : []));
  const avgContent = contentScores.length ? Math.round(contentScores.reduce((a, b) => a + b, 0) / contentScores.length) : null;
  const present = attendance.reduce((n, c) => n + c.summary.present, 0);
  const absent = attendance.reduce((n, c) => n + c.summary.absent, 0);
  const rate = present + absent ? Math.round((present * 100) / (present + absent)) : null;
  const official = quizzes.flatMap((q) => (q.officialScore != null ? [q.officialScore] : []));
  const avgQuiz = official.length ? Math.round(official.reduce((a, b) => a + b, 0) / official.length) : null;

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        back="/teacher/students"
        backLabel="לכל התלמידות"
        title={student.name}
        meta={['תלמידות', ...student.groupNames].join(' · ')}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to={`/teacher/reports?studentId=${student.id}`}><BarChart2 size={13} /> בדוח הציונים</Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink/70">
        <a href={`mailto:${student.email}`} className="inline-flex items-center gap-1.5 hover:text-clay" dir="ltr">
          <Mail size={14} /> {student.email}
        </a>
        {!student.emailVerified && (
          <span className="inline-flex items-center gap-1 text-xs text-clay"><MailWarning size={13} /> המייל לא אומת</span>
        )}
        {student.githubUsername && (
          <a
            href={`https://github.com/${student.githubUsername}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 hover:text-clay"
            dir="ltr"
          >
            <Github size={14} /> {student.githubUsername}
          </a>
        )}
        {student.extraCourses.length > 0 && <span className="text-xs">קורסים נוספים: {student.extraCourses.join(', ')}</span>}
        {student.extraLessons.length > 0 && <span className="text-xs">שיעורים נוספים: {student.extraLessons.join(', ')}</span>}
        {messages.some((m) => m.unread > 0) && (
          <span className="inline-flex items-center gap-1 text-xs text-coral"><MessageSquare size={13} /> יש הודעות שלא נקראו</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile
          label="הגשות"
          value={work.length ? `${submitted.length}/${work.length}` : '—'}
          sub={[missing && `${missing} חסרות`, late && `${late} באיחור`].filter(Boolean).join(' · ') || undefined}
          tone={scoreTone(work.length ? Math.round((submitted.length * 100) / work.length) : null)}
        />
        <Tile label="ממוצע ציון תוכן" value={avgContent != null ? String(avgContent) : '—'} tone={scoreTone(avgContent)} />
        <Tile label="נוכחות" value={rate != null ? `${rate}%` : '—'} sub={rate != null ? `${present} מתוך ${present + absent}` : undefined} tone={scoreTone(rate)} />
        <Tile label="ממוצע חידונים" value={avgQuiz != null ? String(avgQuiz) : '—'} sub={quizzes.length ? `${quizzes.length} חידונים` : undefined} tone={scoreTone(avgQuiz)} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5 lg:items-start">
        <div className="lg:col-span-3">
          <WorkList work={work} />
        </div>
        <div className="space-y-5 lg:col-span-2">
          <AttendanceList courses={attendance} />
          <QuizList quizzes={quizzes} />
          <MessageList messages={messages} />
        </div>
      </div>
    </div>
  );
}
