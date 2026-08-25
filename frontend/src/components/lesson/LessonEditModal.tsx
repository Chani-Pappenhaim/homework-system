import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lessonsApi } from '@/api/lessons.api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { DateField } from '@/components/ui/date-field';
import { MultiUrlInput } from '@/components/ui/multi-url-input';
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
  const [githubUrls, setGithubUrls] = useState<string[]>(['']);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTopic(lesson.topic);
    setDate(lesson.lessonDate ? lesson.lessonDate.slice(0, 10) : '');
    setContentMd(lesson.contentMd ?? '');
    setGithubUrls(lesson.githubUrls.length > 0 ? lesson.githubUrls : ['']);
    setHidden(lesson.hidden);
  }, [open, lesson]);

  const saveMutation = useMutation({
    mutationFn: () => lessonsApi.update(lesson.id, {
      topic,
      lessonDate: date || undefined,
      contentMd,
      githubUrls: githubUrls.map((u) => u.trim()).filter(Boolean),
      hidden,
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
          <DateField label="תאריך" value={date} onChange={setDate} />
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
          <MultiUrlInput label="קישורים לקוד ב-GitHub (אופציונלי)" values={githubUrls} onChange={setGithubUrls} placeholder="https://github.com/..." />
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
