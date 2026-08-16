import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Trash2 } from 'lucide-react';
import { lessonsApi } from '@/api/lessons.api';
import { studentsApi } from '@/api/students.api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getApiErrorMessage } from '@/lib/errors';
import { unwrap } from '@/lib/api-utils';

/** Grants a student access to this one lesson even if she isn't in the course's group. */
export function LessonAccessPanel({ lessonId }: { lessonId: string }) {
  const qc = useQueryClient();
  const [accessEmail, setAccessEmail] = useState('');
  const [accessError, setAccessError] = useState('');

  const { data: accessData } = useQuery({
    queryKey: ['lesson-access', lessonId],
    queryFn: () => lessonsApi.getAccess(lessonId),
    enabled: Boolean(lessonId),
  });
  const accessStudents = unwrap(accessData)?.students ?? [];

  const grantAccessMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await studentsApi.findByEmail(email);
      const student = unwrap(res)?.student;
      if (!student) throw new Error('תלמידה לא נמצאה');
      return lessonsApi.grantAccess(lessonId, student.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lesson-access', lessonId] });
      setAccessEmail('');
      setAccessError('');
    },
    onError: (e: any) => setAccessError(getApiErrorMessage(e, e.message ?? 'שגיאה')),
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
        <p className="text-xs text-ink/50">מתן גישה לתלמידה שאינה בקבוצה הרגילה של הקורס</p>
        <div className="flex gap-2">
          <Input
            placeholder="אימייל תלמידה"
            type="email"
            value={accessEmail}
            onChange={(e) => setAccessEmail(e.target.value)}
            className="flex-1"
          />
          <Button
            size="sm"
            variant="secondary"
            loading={grantAccessMutation.isPending}
            onClick={() => grantAccessMutation.mutate(accessEmail)}
            disabled={!accessEmail}
          >
            <UserPlus size={13} /> הענק גישה
          </Button>
        </div>
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
