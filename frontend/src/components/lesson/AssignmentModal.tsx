import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { assignmentsApi } from '@/api/assignments.api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import type { AssignmentDTO } from '@/types';

export function AssignmentModal({ lessonId, value, onClose }: {
  lessonId: string;
  value: AssignmentDTO | 'new' | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [aiInstructions, setAiInstructions] = useState('');

  useEffect(() => {
    if (value === 'new') {
      setTitle(''); setDescription(''); setDeadline(''); setAiInstructions('');
    } else if (value) {
      setTitle(value.title); setDescription(value.description ?? '');
      setDeadline(value.deadline ? value.deadline.slice(0, 16) : '');
      setAiInstructions(value.aiInstructions ?? '');
    }
  }, [value]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const data = {
        title,
        description: description || undefined,
        deadline: deadline || undefined,
        aiInstructions: aiInstructions || undefined,
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
          <div className="flex flex-col gap-1">
            <Label htmlFor="assignment-description">תיאור (אופציונלי)</Label>
            <Textarea
              id="assignment-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="resize-none"
              placeholder="הוראות לתלמידה..."
            />
          </div>
          <Input
            label="מועד אחרון (אופציונלי)"
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
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
            disabled={!title.trim()}
          >
            {value === 'new' ? 'צרי מטלה' : 'שמרי שינויים'}
          </Button>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
