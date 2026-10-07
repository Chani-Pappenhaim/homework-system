import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { assignmentsApi } from '@/api/assignments.api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { MarkdownField } from '@/components/ui/markdown-field';
import { SubmissionTypePicker, type SubmissionTypes } from './SubmissionTypePicker';
import type { AssignmentDTO } from '@/types';

/**
 * A week after the lesson, at the end of that day, as a `datetime-local` value.
 * Without a lesson date it counts from today.
 */
export function defaultDeadline(lessonDate?: string | null): string {
  const base = lessonDate ? new Date(lessonDate) : new Date();
  if (Number.isNaN(base.getTime())) return '';
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 7, 23, 59);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** An ISO timestamp from the API as a local `datetime-local` value. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AssignmentModal({ lessonId, lessonDate, value, onClose }: {
  lessonId: string;
  lessonDate?: string | null;
  value: AssignmentDTO | 'new' | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [aiInstructions, setAiInstructions] = useState('');
  const [types, setTypes] = useState<SubmissionTypes>({ allowGithub: true, allowFile: true, allowedTypes: [] });

  useEffect(() => {
    if (value === 'new') {
      setTitle(''); setDescription(''); setDeadline(defaultDeadline(lessonDate)); setAiInstructions('');
      setTypes({ allowGithub: true, allowFile: true, allowedTypes: [] });
    } else if (value) {
      setTitle(value.title); setDescription(value.description ?? '');
      setDeadline(value.deadline ? toLocalInput(value.deadline) : '');
      setAiInstructions(value.aiInstructions ?? '');
      setTypes({ allowGithub: value.allowGithub ?? true, allowFile: value.allowFile ?? true, allowedTypes: value.allowedTypes ?? [] });
    }
  }, [value, lessonDate]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const data = {
        title: title.trim(),
        description: description.trim(),
        // null (not undefined) so that removing the deadline of an existing
        // assignment actually clears it.
        deadline: deadline ? new Date(deadline).toISOString() : null,
        aiInstructions: aiInstructions || undefined,
        ...types,
      };
      if (value === 'new') return assignmentsApi.create(lessonId, data);
      return assignmentsApi.update((value as AssignmentDTO).id, data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lesson', lessonId] });
      const wasNew = value === 'new';
      onClose();
      toast.success(wasNew ? 'המטלה נוצרה בהצלחה' : 'המטלה נשמרה בהצלחה');
    },
  });

  return (
    <Dialog open={Boolean(value)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{value === 'new' ? 'מטלה חדשה' : 'עריכת מטלה'}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <Input
            label="כותרת המטלה"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="למשל: פרויקט גיטהב"
          />
          <MarkdownField
            id="assignment-description"
            label="תיאור המטלה *"
            value={description}
            onChange={setDescription}
            rows={4}
            placeholder="מה צריך להגיש, ולפי מה העבודה תיבדק..."
            required
          />
          <div className="flex flex-col gap-1">
            {deadline ? (
              <>
                <Input
                  label="מועד אחרון"
                  type="datetime-local"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
                <button type="button" onClick={() => setDeadline('')} className="self-start text-xs font-semibold text-coral hover:underline">
                  ללא מועד אחרון
                </button>
              </>
            ) : (
              <>
                <Label>מועד אחרון</Label>
                <p className="text-sm text-ink/60">אין מועד אחרון למטלה זו</p>
                <button type="button" onClick={() => setDeadline(defaultDeadline(lessonDate))} className="self-start text-xs font-semibold text-indigo hover:underline">
                  הגדרת מועד אחרון (שבוע אחרי השיעור)
                </button>
              </>
            )}
          </div>
          <SubmissionTypePicker value={types} onChange={setTypes} />
          <div className="flex flex-col gap-1">
            <Label htmlFor="assignment-ai-instructions">הנחיות לבדיקת AI (אופציונלי)</Label>
            <Textarea
              id="assignment-ai-instructions"
              value={aiInstructions}
              onChange={(e) => setAiInstructions(e.target.value)}
              rows={3}
              className="resize-none"
              placeholder="למשל: בדקי שיש שימוש ב-async/await, שהקוד מחולק לפונקציות, ושיש טיפול בשגיאות..."
            />
            <p className="text-xs text-ink-soft">הנחיות אלו יישלחו ל-AI בעת בדיקת עבודות התלמידות</p>
          </div>
          <Button
            className="w-full"
            loading={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
            disabled={!title.trim() || !description.trim() || (!types.allowGithub && !types.allowFile)}
          >
            {value === 'new' ? 'צרי מטלה' : 'שמרי שינויים'}
          </Button>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
