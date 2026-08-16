import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lessonsApi } from '@/api/lessons.api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import type { LessonDetailDTO } from '@/types';

export function LessonEditModal({ lesson, open, onClose }: {
  lesson: LessonDetailDTO;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [topic, setTopic] = useState('');
  const [date, setDate] = useState('');
  const [contentMd, setContentMd] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTopic(lesson.topic);
    setDate(lesson.lessonDate ? lesson.lessonDate.slice(0, 10) : '');
    setContentMd(lesson.contentMd ?? '');
    setGithubUrl(lesson.githubUrl ?? '');
    setHidden(lesson.hidden);
  }, [open, lesson]);

  const saveMutation = useMutation({
    mutationFn: () => lessonsApi.update(lesson.id, {
      topic, lessonDate: date || undefined, contentMd, githubUrl, hidden,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lesson', lesson.id] });
      onClose();
      toast.success('השיעור נשמר בהצלחה');
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>עריכת שיעור</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <Input label="נושא השיעור *" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="React Hooks" />
          <Input label="תאריך (אופציונלי)" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <div className="flex flex-col gap-1">
            <Label htmlFor="lesson-content">חומר הלימוד (Markdown)</Label>
            <Textarea
              id="lesson-content"
              value={contentMd}
              onChange={(e) => setContentMd(e.target.value)}
              rows={8}
              className="resize-y font-sans"
              placeholder="# כותרת&#10;&#10;תוכן השיעור, הסברים, דוגמאות קוד..."
            />
            <p className="text-xs text-ink-soft">אפשר לעצב עם Markdown: כותרות (#), רשימות, קוד (```), קישורים ועוד</p>
          </div>
          <Input label="קישור לקוד ב-GitHub (אופציונלי)" value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} placeholder="https://github.com/..." />
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} className="accent-ink" />
            הסתר שיעור מהתלמידות
          </label>
          <p className="text-xs text-ink-soft">קבצים מצורפים מנהלים ישירות בכרטיס השיעור (לא כאן).</p>
          <Button
            className="w-full"
            loading={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
            disabled={!topic.trim()}
          >
            שמרי שינויים
          </Button>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
