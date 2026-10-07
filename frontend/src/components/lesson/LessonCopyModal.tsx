import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lessonsApi } from '@/api/lessons.api';
import { coursesApi } from '@/api/courses.api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { getApiErrorMessage } from '@/lib/errors';
import type { LessonDetailDTO } from '@/types';

/**
 * Duplicates a lesson in its own course or copies it to another one.
 * Files are shared, not re-uploaded; the copy starts hidden so the teacher can
 * adjust it before students see it.
 */
export function LessonCopyModal({ lesson, open, onClose }: {
  lesson: LessonDetailDTO;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [targetCourseId, setTargetCourseId] = useState(lesson.courseId);

  useEffect(() => { if (open) setTargetCourseId(lesson.courseId); }, [open, lesson.courseId]);

  const { data } = useQuery({
    queryKey: ['courses'],
    queryFn: () => coursesApi.list(),
    enabled: open,
  });
  const courses = data?.data.data.courses ?? [];

  const copyMutation = useMutation({
    mutationFn: () => lessonsApi.copy(lesson.id, targetCourseId === lesson.courseId ? undefined : targetCourseId),
    onSuccess: (res) => {
      const copy = res.data.data.lesson;
      qc.invalidateQueries({ queryKey: ['course', copy.courseId] });
      qc.invalidateQueries({ queryKey: ['courses'] });
      toast.success('השיעור הועתק — העותק מוסתר מהתלמידות עד שתציגי אותו');
      onClose();
      navigate(`/teacher/lessons/${copy.id}`);
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'העתקת השיעור נכשלה')),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>שכפול / העתקת שיעור</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            לאיזה קורס?
            <select
              value={targetCourseId}
              onChange={(e) => setTargetCourseId(e.target.value)}
              className="rounded-input border border-rule bg-sheet px-3 py-2 text-sm text-ink shadow-soft transition-colors focus:border-clay focus:outline-none"
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.id === lesson.courseId ? ' (הקורס הנוכחי — שכפול)' : ''}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-ink/60">
            יועתקו התוכן, הקבצים (בלי להעלות אותם שוב), המטלות והבוחן. הגשות וציונים לא מועתקים.
            העותק יתווסף בסוף רשימת השיעורים ויהיה מוסתר עד שתציגי אותו.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>ביטול</Button>
            <Button loading={copyMutation.isPending} onClick={() => copyMutation.mutate()}>
              {targetCourseId === lesson.courseId ? 'שכפול' : 'העתקה'}
            </Button>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
