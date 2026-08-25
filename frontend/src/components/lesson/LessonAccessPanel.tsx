import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Trash2 } from 'lucide-react';
import { lessonsApi } from '@/api/lessons.api';
import { groupsApi } from '@/api/groups.api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StudentAutocomplete } from '@/components/ui/student-autocomplete';
import { useToast } from '@/components/ui/toast';
import { getApiErrorMessage } from '@/lib/errors';
import { unwrap } from '@/lib/api-utils';

/**
 * Grants a student access to this one lesson even if she isn't in the
 * course's group — for a single student (search by name/email), a whole
 * other group, or a batch of emails pasted from a file.
 */
export function LessonAccessPanel({ lessonId }: { lessonId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [accessError, setAccessError] = useState('');
  const [accessTab, setAccessTab] = useState<'student' | 'group' | 'file'>('student');
  const [accessGroupId, setAccessGroupId] = useState('');
  const [accessFileEmails, setAccessFileEmails] = useState<string[]>([]);
  const [accessFileName, setAccessFileName] = useState('');

  const { data: accessData } = useQuery({
    queryKey: ['lesson-access', lessonId],
    queryFn: () => lessonsApi.getAccess(lessonId),
    enabled: Boolean(lessonId),
  });
  const accessStudents = unwrap(accessData)?.students ?? [];

  const { data: groupsData } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsApi.list(),
  });
  const allGroups = unwrap(groupsData)?.groups ?? [];

  const grantAccessMutation = useMutation({
    mutationFn: (studentId: string) => lessonsApi.grantAccess(lessonId, studentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lesson-access', lessonId] });
      setAccessError('');
    },
    onError: (e: any) => setAccessError(getApiErrorMessage(e, 'שגיאה במתן הרשאה')),
  });

  const grantAccessBulkMutation = useMutation({
    mutationFn: (data: { groupId?: string; emails?: string[] }) => lessonsApi.grantAccessBulk(lessonId, data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['lesson-access', lessonId] });
      const { granted, notFound } = unwrap(res)!;
      setAccessGroupId('');
      setAccessFileEmails([]);
      setAccessFileName('');
      if (notFound && notFound.length > 0) {
        setAccessError(`הוענקה גישה ל-${granted} תלמידות. לא נמצאו: ${notFound.join(', ')}`);
      } else {
        setAccessError('');
        toast.success(`הוענקה גישה ל-${granted} תלמידות`);
      }
    },
    onError: (e: any) => setAccessError(getApiErrorMessage(e, 'שגיאה במתן הרשאה')),
  });

  const revokeAccessMutation = useMutation({
    mutationFn: (studentId: string) => lessonsApi.revokeAccess(lessonId, studentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lesson-access', lessonId] }),
  });

  return (
    <Card>
      <CardHeader>
        <h2 className="font-display text-base font-bold">הרשאת גישה חריגה לשיעור זה</h2>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-ink/50">מתן גישה לתלמידה, לקבוצה שלמה, או לרשימת מיילים מקובץ — שאינן בקבוצה הרגילה של הקורס</p>

        <div className="flex gap-2">
          {([
            ['student', 'תלמידה בודדת'],
            ['group', 'קבוצה שלמה'],
            ['file', 'קובץ מיילים'],
          ] as const).map(([t, label]) => (
            <button key={t} onClick={() => { setAccessTab(t); setAccessError(''); }}
              className={`rounded-input border px-3 py-1.5 text-xs font-bold transition-colors ${accessTab === t ? 'border-rule bg-ink text-sheet' : 'border-rule/30 text-ink/70 hover:border-rule'}`}>
              {label}
            </button>
          ))}
        </div>

        {accessTab === 'student' && (
          <StudentAutocomplete onSelect={(s) => grantAccessMutation.mutate(s.id)} />
        )}

        {accessTab === 'group' && (
          <div className="flex gap-2">
            <select
              value={accessGroupId}
              onChange={(e) => setAccessGroupId(e.target.value)}
              className="flex-1 rounded-input border border-rule bg-sheet px-3 py-2 text-sm"
            >
              <option value="">בחרי קבוצה...</option>
              {allGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <Button
              size="sm"
              variant="secondary"
              loading={grantAccessBulkMutation.isPending}
              onClick={() => grantAccessBulkMutation.mutate({ groupId: accessGroupId })}
              disabled={!accessGroupId}
            >
              <UserPlus size={13} /> הענק לכל הקבוצה
            </Button>
          </div>
        )}

        {accessTab === 'file' && (
          <div className="space-y-2">
            <input
              type="file"
              accept=".txt,.csv"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                const text = await file.text();
                const emails = text.split(/[\n,;\r]+/).map((s) => s.trim()).filter((s) => /\S+@\S+\.\S+/.test(s));
                setAccessFileEmails(emails);
                setAccessFileName(file.name);
              }}
              className="text-sm"
            />
            {accessFileEmails.length > 0 && (
              <>
                <p className="text-xs text-ink/50">{accessFileName}: נמצאו {accessFileEmails.length} כתובות מייל</p>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={grantAccessBulkMutation.isPending}
                  onClick={() => grantAccessBulkMutation.mutate({ emails: accessFileEmails })}
                >
                  <UserPlus size={13} /> הענק גישה לכולן
                </Button>
              </>
            )}
            <p className="text-xs text-ink/40">קובץ txt/csv עם כתובת מייל אחת בכל שורה (או מופרדות בפסיקים)</p>
          </div>
        )}

        {accessError && <p className="text-coral text-xs">{accessError}</p>}
        {accessStudents.length > 0 && (
          <div className="divide-y divide-rule/20 border border-rule/20 rounded-card">
            {accessStudents.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-4 py-2">
                <div>
                  <p className="text-sm font-medium">{s.name}</p>
                  <p className="text-xs text-ink/50">{s.email}</p>
                </div>
                <Button size="sm" variant="destructive" onClick={() => revokeAccessMutation.mutate(s.id)}>
                  <Trash2 size={12} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
