import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { coursesApi } from '@/api/courses.api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { getApiErrorMessage } from '@/lib/errors';
import { unwrap } from '@/lib/api-utils';
import { StudentGrantPicker } from './StudentGrantPicker';

/**
 * Students outside the course's group who still get the whole course —
 * every lesson in it, including ones added later.
 */
export function CourseAccessPanel({ courseId }: { courseId: string }) {
  const qc = useQueryClient();
  const toast = useToast();

  const { data } = useQuery({
    queryKey: ['course-access', courseId],
    queryFn: () => coursesApi.getAccess(courseId),
  });
  const students = unwrap(data)?.students ?? [];

  const grantMutation = useMutation({
    mutationFn: (studentId: string) => coursesApi.grantAccess(courseId, studentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course-access', courseId] });
      toast.success('הוענקה גישה לקורס');
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'שגיאה במתן גישה')),
  });

  const revokeMutation = useMutation({
    mutationFn: (studentId: string) => coursesApi.revokeAccess(courseId, studentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['course-access', courseId] }),
    onError: (err) => toast.error(getApiErrorMessage(err, 'שגיאה בביטול הגישה')),
  });

  return (
    <Card>
      <CardHeader>
        <h2 className="font-display text-base font-bold">תלמידות נוספות בקורס</h2>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-ink/50">
          גישה לכל הקורס לתלמידות שאינן בקבוצה שלו — למשל תלמידה פרטית. לגישה לשיעור בודד בלבד יש לשייך מתוך דף השיעור.
        </p>
        <StudentGrantPicker onGrant={(id) => grantMutation.mutate(id)} />
        {students.length > 0 && (
          <div className="divide-y divide-rule/20 rounded-card border border-rule/20">
            {students.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-4 py-2">
                <div>
                  <p className="text-sm font-medium">{s.name}</p>
                  <p className="text-xs text-ink/50">{s.email}</p>
                </div>
                <Button size="sm" variant="destructive" title="ביטול הגישה" onClick={() => revokeMutation.mutate(s.id)}>
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
