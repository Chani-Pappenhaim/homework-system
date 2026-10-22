import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Download, ClipboardCheck, Upload } from 'lucide-react';
import { gradesApi } from '@/api/grades.api';
import { groupsApi } from '@/api/groups.api';
import { coursesApi } from '@/api/courses.api';
import { studentsApi } from '@/api/students.api';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { SubmissionsImportDialog } from '@/components/teacher/SubmissionsImportDialog';
import { downloadBlob, formatDate, formatDateTime, groupDisplayName, todayISO } from '@/lib/utils';
import { getDownloadErrorMessage } from '@/lib/errors';
import { dayRangeLabel, dayRangeParams } from '@/lib/date-range';
import { unwrap } from '@/lib/api-utils';
import type { ReportRow } from '@/types';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useQueryParams } from '@/hooks/useQueryParam';
import { submissionPath } from '@/components/lesson/LessonRoute';

/**
 * Option labels for a filter dropdown: a name that appears more than once
 * (two students, or two groups' courses, with the same name) gets a detail
 * that tells the options apart.
 */
export function distinctLabels<T>(items: T[], name: (item: T) => string, detail: (item: T) => string | undefined): string[] {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(name(item), (counts.get(name(item)) ?? 0) + 1);
  return items.map((item) => {
    const extra = (counts.get(name(item)) ?? 0) > 1 ? detail(item) : undefined;
    return extra ? `${name(item)} · ${extra}` : name(item);
  });
}

export default function ReportsPage() {
  usePageTitle('דוחות');
  const navigate = useNavigate();
  // The filters live in the address: deep-linked from a course page ("בדיקה" there
  // jumps straight to that course's reports) and from a group's student list
  // ("הגשות" there opens one student's submissions), and kept when coming back.
  const [searchParams, setParams] = useQueryParams();
  const groupId = searchParams.get('groupId') ?? '';
  const courseId = searchParams.get('courseId') ?? '';
  const studentId = searchParams.get('studentId') ?? '';
  // The days the work was handed in on
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  const backwards = !!from && !!to && from > to;
  const [exportError, setExportError] = useState('');
  const [importOpen, setImportOpen] = useState(false);

  const { data: groupsData } = useQuery({ queryKey: ['groups'], queryFn: () => groupsApi.list() });
  const { data: coursesData } = useQuery({ queryKey: ['courses'], queryFn: () => coursesApi.list() });
  // Student options: the selected group's roster, or every student when no group is chosen
  const { data: groupData } = useQuery({
    queryKey: ['group', groupId],
    queryFn: () => groupsApi.get(groupId),
    enabled: Boolean(groupId),
  });
  // The overview lists every student; the search endpoint stops at 50
  const { data: allStudentsData } = useQuery({
    queryKey: ['students', 'overview'],
    queryFn: () => studentsApi.overview(),
    enabled: !groupId,
  });

  const filters = {
    ...(groupId && { groupId }),
    ...(courseId && { courseId }),
    ...(studentId && { studentId }),
    ...(!backwards && dayRangeParams({ from, to })),
  };

  const { data: reportData, isLoading } = useQuery({
    queryKey: ['report', filters],
    queryFn: () => gradesApi.report(filters),
  });

  const groups = unwrap(groupsData)?.groups ?? [];
  // A chosen group narrows the course list to that group's courses
  const courses = (unwrap(coursesData)?.courses ?? []).filter((c) => !groupId || c.groupId === groupId);
  const courseLabels = distinctLabels(courses, (c) => c.name, (c) => c.groupName);
  const report: ReportRow[] = unwrap(reportData)?.report ?? [];
  const studentOptions: { id: string; name: string; email: string }[] = (groupId
    ? (unwrap(groupData)?.group.students ?? [])
    : (unwrap(allStudentsData)?.students ?? [])
  ).slice().sort((a, b) => a.name.localeCompare(b.name, 'he'));
  const studentLabels = distinctLabels(studentOptions, (s) => s.name, (s) => s.email);

  const changeGroup = (next: string) => {
    // A course of another group would leave the report empty with no visible reason
    const course = unwrap(coursesData)?.courses.find((c) => c.id === courseId);
    const keepCourse = !next || !course || course.groupId === next;
    setParams({ groupId: next, studentId: '', ...(!keepCourse && { courseId: '' }) });
  };

  const exportMutation = useMutation({
    mutationFn: () => gradesApi.exportReport(Object.keys(filters).length ? filters : undefined),
    onSuccess: (res) => {
      downloadBlob(res.data as Blob, `ציונים ${dayRangeLabel(filters) || todayISO()}.xlsx`);
      setExportError('');
    },
    onError: async (e) => setExportError(await getDownloadErrorMessage(e, 'ייצוא הקובץ נכשל, נסי שוב')),
  });

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        title="דוחות ציונים"
        meta="דוחות · ייצוא"
        actions={
          <>
            {exportError && <span className="font-sans text-xs text-coral">{exportError}</span>}
            <Button variant="outline" size="sm" loading={exportMutation.isPending} onClick={() => exportMutation.mutate()}>
              <Download size={13} /> ייצוא Excel
            </Button>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload size={13} /> ייבוא הגשות
            </Button>
          </>
        }
      />

      <SubmissionsImportDialog open={importOpen} onOpenChange={setImportOpen} />

      {/* Filters */}
      <Card>
        <div className="px-5 py-4 flex gap-3 flex-wrap">
          <select
            value={groupId}
            onChange={(e) => changeGroup(e.target.value)}
            aria-label="סינון לפי קבוצה"
            className="rounded-input border border-rule bg-sheet px-3 py-2 text-sm text-ink shadow-soft transition-colors focus:border-clay focus:outline-none"
          >
            <option value="">כל הקבוצות</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{groupDisplayName(g)}</option>)}
          </select>

          <select
            value={courseId}
            onChange={(e) => setParams({ courseId: e.target.value })}
            aria-label="סינון לפי קורס"
            className="rounded-input border border-rule bg-sheet px-3 py-2 text-sm text-ink shadow-soft transition-colors focus:border-clay focus:outline-none"
          >
            <option value="">כל הקורסים</option>
            {courses.map((c, i) => <option key={c.id} value={c.id}>{courseLabels[i]}</option>)}
          </select>

          <select
            value={studentId}
            onChange={(e) => setParams({ studentId: e.target.value })}
            aria-label="סינון לפי תלמידה"
            className="rounded-input border border-rule bg-sheet px-3 py-2 text-sm text-ink shadow-soft transition-colors focus:border-clay focus:outline-none"
          >
            <option value="">כל התלמידות</option>
            {studentOptions.map((s, i) => <option key={s.id} value={s.id}>{studentLabels[i]}</option>)}
          </select>

          {(['from', 'to'] as const).map((key) => (
            <label key={key} className="flex items-center gap-1.5 text-sm text-ink-soft">
              {key === 'from' ? 'מתאריך' : 'עד תאריך'}
              <input
                type="date"
                value={key === 'from' ? from : to}
                onChange={(e) => setParams({ [key]: e.target.value })}
                aria-label={key === 'from' ? 'הוגש מתאריך' : 'הוגש עד תאריך'}
                className="rounded-input border border-rule bg-sheet px-3 py-2 text-sm text-ink shadow-soft transition-colors focus:border-clay focus:outline-none"
              />
            </label>
          ))}

          {(groupId || courseId || studentId || from || to) && (
            <Button size="sm" variant="outline" onClick={() => setParams({ groupId: '', courseId: '', studentId: '', from: '', to: '' })}>
              נקה פילטרים
            </Button>
          )}
        </div>
        {backwards && <p className="px-5 pb-3 text-xs text-coral">תאריך ההתחלה מאוחר מתאריך הסיום - הסינון לפי תאריכים לא הופעל</p>}
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <h2 className="font-display text-base font-bold">תוצאות ({report.length})</h2>
        </CardHeader>
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-6 text-center font-sans text-ink/50">טוען…</div>
          ) : report.length === 0 ? (
            <EmptyState className="border-0">אין נתונים לפי הפילטרים הנבחרים</EmptyState>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-rule bg-ground/70">
                  {['תלמידה', 'קבוצה', 'קורס', 'שיעור', 'מטלה', 'מועד אחרון', 'הגשה', 'ציון הגשה', 'ציון תוכן', ''].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-right font-sans text-[11px] font-bold uppercase text-ink/60">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-dashed divide-rule/20">
                {report.map((r, i) => (
                  <tr key={i} className="transition-colors hover:bg-butter/15">
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{r.studentName}</p>
                      <p className="text-xs text-ink/50">{r.studentEmail}</p>
                    </td>
                    <td className="px-4 py-3 text-ink/70">{r.groupName}</td>
                    <td className="px-4 py-3 text-ink/70">{r.courseName}</td>
                    <td className="px-4 py-3 text-ink/70">{r.lessonTopic}</td>
                    <td className="px-4 py-3 text-ink">{r.assignmentTitle}</td>
                    <td className="px-4 py-3 text-ink/70 text-xs">{formatDate(r.deadline)}</td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-ink/70">{formatDateTime(r.submittedAt)}</p>
                      {r.isLate && <Badge variant="warning">איחור</Badge>}
                    </td>
                    <td className="px-4 py-3">
                      {r.submissionScore != null
                        ? <span className="font-semibold text-ink">{r.submissionScore}</span>
                        : <span className="text-ink/50">-</span>}
                    </td>
                    <td className="px-4 py-3">
                      {r.contentScore != null
                        ? <span className="font-semibold text-ink">{r.contentScore}</span>
                        : <span className="text-ink/50">-</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(submissionPath(r.lessonId, r.assignmentId, r.submissionId))}
                      >
                        <ClipboardCheck size={12} /> בדיקה
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}
