import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { gradesApi } from '@/api/grades.api';
import { groupsApi } from '@/api/groups.api';
import { coursesApi } from '@/api/courses.api';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatDateTime } from '@/lib/utils';
import type { ReportRow } from '@/types';

export default function ReportsPage() {
  const [groupId, setGroupId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [exportError, setExportError] = useState('');

  const { data: groupsData } = useQuery({ queryKey: ['groups'], queryFn: () => groupsApi.list() });
  const { data: coursesData } = useQuery({ queryKey: ['courses'], queryFn: () => coursesApi.list() });

  const filters = {
    ...(groupId && { groupId }),
    ...(courseId && { courseId }),
  };

  const { data: reportData, isLoading } = useQuery({
    queryKey: ['report', filters],
    queryFn: () => gradesApi.report(filters),
  });

  const groups = groupsData?.data.data.groups ?? [];
  const courses = coursesData?.data.data.courses ?? [];
  const report: ReportRow[] = (reportData?.data as any)?.data?.report ?? [];

  const exportMutation = useMutation({
    mutationFn: () => gradesApi.exportReport(Object.keys(filters).length ? filters : undefined),
    onSuccess: (res) => {
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ציונים-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setExportError('');
    },
    onError: () => setExportError('ייצוא הקובץ נכשל, נסי שוב'),
  });

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">דוחות ציונים</h1>
        <div className="flex items-center gap-2">
          {exportError && <span className="text-tomato text-xs">{exportError}</span>}
          <Button variant="outline" size="sm" loading={exportMutation.isPending} onClick={() => exportMutation.mutate()}>
            <Download size={13} /> ייצוא Excel
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <div className="px-5 py-4 flex gap-3 flex-wrap">
          <select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="px-3 py-2 border border-input bg-card rounded-input text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="">כל הקבוצות</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>

          <select
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            className="px-3 py-2 border border-input bg-card rounded-input text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="">כל הקורסים</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          {(groupId || courseId) && (
            <Button size="sm" variant="outline" onClick={() => { setGroupId(''); setCourseId(''); }}>
              נקה פילטרים
            </Button>
          )}
        </div>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">תוצאות ({report.length})</h2>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-6 text-center text-ink/50">טוען...</div>
          ) : report.length === 0 ? (
            <div className="p-6 text-center text-ink/50">אין נתונים לפי הפילטרים הנבחרים</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/20 bg-cream/60">
                  {['תלמידה', 'קבוצה', 'קורס', 'שיעור', 'מטלה', 'מועד אחרון', 'הגשה', 'ציון הגשה', 'ציון תוכן'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-right text-xs text-ink/50 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/20">
                {report.map((r, i) => (
                  <tr key={i} className="hover:bg-cream/60 transition">
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
                        : <span className="text-ink/50">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {r.contentScore != null
                        ? <span className="font-semibold text-ink">{r.contentScore}</span>
                        : <span className="text-ink/50">—</span>}
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
