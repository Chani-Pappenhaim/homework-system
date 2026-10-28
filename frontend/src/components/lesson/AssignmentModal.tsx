import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { assignmentsApi } from '@/api/assignments.api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { MarkdownField } from '@/components/ui/markdown-field';
import { SubmissionTypePicker, type SubmissionTypes } from './SubmissionTypePicker';
import { AiReferenceFilesPicker } from './AiReferenceFilesPicker';
import type { AssignmentDTO, LessonFile } from '@/types';

/** A date as a local `datetime-local` value. */
function formatLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * A week after the lesson, at the end of that day, as a `datetime-local` value.
 * Without a lesson date - or when that week is already over, for a past
 * lesson - it counts from today.
 */
export function defaultDeadline(lessonDate?: string | null, now = new Date()): string {
  const weekAfter = (base: Date) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + 7, 23, 59);
  const base = lessonDate ? new Date(lessonDate) : now;
  if (Number.isNaN(base.getTime())) return '';
  const d = weekAfter(base);
  return formatLocal(d < now ? weekAfter(now) : d);
}

// The names the server accepts: they travel in GitHub URLs as is.
const GIT_TAG = /^[A-Za-z0-9._-]{1,100}$/;

function gitTagError(tag: string): string | undefined {
  const trimmed = tag.trim();
  if (!trimmed || GIT_TAG.test(trimmed)) return undefined;
  return 'רק אותיות באנגלית, ספרות, נקודה, מקף וקו תחתון (למשל lesson3)';
}

/** An ISO timestamp from the API as a local `datetime-local` value. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return formatLocal(d);
}

export function AssignmentModal({ lessonId, lessonDate, lessonFiles = [], value, onClose }: {
  lessonId: string;
  lessonDate?: string | null;
  /** The lesson's files, for picking the ones the AI review relies on. */
  lessonFiles?: LessonFile[];
  value: AssignmentDTO | 'new' | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [aiInstructions, setAiInstructions] = useState('');
  const [aiReviewEnabled, setAiReviewEnabled] = useState(true);
  const [aiReviewLarge, setAiReviewLarge] = useState(false);
  const [aiGitFromTag, setAiGitFromTag] = useState('');
  const [aiGitToTag, setAiGitToTag] = useState('');
  const [aiReferenceFileIds, setAiReferenceFileIds] = useState<string[]>([]);
  const [types, setTypes] = useState<SubmissionTypes>({ allowGithub: true, allowFile: true, allowedTypes: [] });

  useEffect(() => {
    if (value === 'new') {
      setTitle(''); setDescription(''); setDeadline(defaultDeadline(lessonDate)); setAiInstructions('');
      setAiReviewEnabled(true);
      setAiReviewLarge(false);
      setAiGitFromTag(''); setAiGitToTag('');
      setAiReferenceFileIds([]);
      setTypes({ allowGithub: true, allowFile: true, allowedTypes: [] });
    } else if (value) {
      setTitle(value.title); setDescription(value.description ?? '');
      setDeadline(value.deadline ? toLocalInput(value.deadline) : '');
      setAiInstructions(value.aiInstructions ?? '');
      setAiReviewEnabled(value.aiReviewEnabled ?? true);
      setAiReviewLarge(value.aiReviewLarge ?? false);
      setAiGitFromTag(value.aiGitFromTag ?? ''); setAiGitToTag(value.aiGitToTag ?? '');
      setAiReferenceFileIds(value.aiReferenceFileIds ?? []);
      setTypes({ allowGithub: value.allowGithub ?? true, allowFile: value.allowFile ?? true, allowedTypes: value.allowedTypes ?? [] });
    }
  }, [value, lessonDate]);

  // A deadline that is being set or changed must be in the future; the one an
  // existing assignment already had is kept as it is, even after it passed.
  const savedDeadline = value && value !== 'new' && value.deadline ? toLocalInput(value.deadline) : '';
  const deadlineInPast = Boolean(deadline) && deadline !== savedDeadline && new Date(deadline) < new Date();
  const fromTagError = gitTagError(aiGitFromTag);
  const toTagError = gitTagError(aiGitToTag)
    ?? (aiGitToTag.trim() && aiGitToTag.trim() === aiGitFromTag.trim() ? 'תגית הסיום זהה לתגית ההתחלה' : undefined);

  const saveMutation = useMutation({
    mutationFn: () => {
      const data = {
        title: title.trim(),
        description: description.trim(),
        // null (not undefined) so that removing the deadline of an existing
        // assignment actually clears it.
        deadline: deadline ? new Date(deadline).toISOString() : null,
        aiInstructions: aiInstructions.trim() ? aiInstructions : null,
        aiReviewEnabled,
        aiReviewLarge,
        aiGitFromTag: aiGitFromTag.trim() || null,
        aiGitToTag: aiGitToTag.trim() || null,
        // Only files still in the lesson: one deleted since is no longer a choice.
        aiReferenceFileIds: aiReferenceFileIds.filter((id) => lessonFiles.some((f) => f.id === id)),
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
                  min={formatLocal(new Date())}
                  onChange={(e) => setDeadline(e.target.value)}
                  error={deadlineInPast ? 'המועד האחרון כבר עבר - בחרי תאריך עתידי' : undefined}
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
                  הגדרת מועד אחרון
                </button>
              </>
            )}
          </div>
          <SubmissionTypePicker value={types} onChange={setTypes} />
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={aiReviewEnabled}
              onChange={(e) => setAiReviewEnabled(e.target.checked)}
              className="mt-1 accent-ink"
            />
            <span>
              לאפשר בדיקת AI למטלה זו
              <span className="block text-xs text-ink-soft">
                {aiReviewEnabled
                  ? 'התלמידות יוכלו לבקש בדיקת AI לעבודה שהגישו'
                  : 'העבודות ייבדקו רק על ידך - בלי כפתור בדיקת AI'}
              </span>
            </span>
          </label>
          {/* The instructions stay in state while AI is off, so ticking it back on restores them. */}
          {aiReviewEnabled && (
            <div className="flex flex-col gap-1">
              <MarkdownField
                id="assignment-ai-instructions"
                label="הנחיות לבדיקת AI (אופציונלי)"
                value={aiInstructions}
                onChange={setAiInstructions}
                rows={3}
                placeholder="למשל: בדקי שיש שימוש ב-async/await, שהקוד מחולק לפונקציות, ושיש טיפול בשגיאות..."
              />
              <p className="text-xs text-ink-soft">הנחיות אלו יישלחו ל-AI בעת בדיקת עבודות התלמידות</p>
            </div>
          )}
          {aiReviewEnabled && (
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={aiReviewLarge}
                onChange={(e) => setAiReviewLarge(e.target.checked)}
                className="mt-1 accent-ink"
              />
              <span>
                תרגיל גדול
                <span className="block text-xs text-ink-soft">
                  ה-AI יקרא עד 50 קבצי קוד באורך עד 12,000 תווים כל אחד (במקום 20 קבצים עד 5,000 תווים). כל בדיקה צורכת יותר מהמכסה.
                </span>
              </span>
            </label>
          )}
          {aiReviewEnabled && types.allowGithub && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-ink">תרגיל בהמשכים - תגיות git (אופציונלי)</legend>
              <p className="text-xs text-ink-soft">
                להגשות GitHub בלבד. ה-AI יקרא את הקוד כפי שהוא בתגית הסיום (בלי תגית - את הקוד העדכני), ויקבל גם את
                השינויים מאז תגית ההתחלה. התלמידות רואות את שמות התגיות, וצריכות ליצור אותן בריפו ולדחוף ל-GitHub.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="תגית התחלה"
                  dir="ltr"
                  value={aiGitFromTag}
                  onChange={(e) => setAiGitFromTag(e.target.value)}
                  placeholder="lesson1"
                  error={fromTagError}
                />
                <Input
                  label="תגית סיום"
                  dir="ltr"
                  value={aiGitToTag}
                  onChange={(e) => setAiGitToTag(e.target.value)}
                  placeholder="lesson3"
                  error={toTagError}
                />
              </div>
            </fieldset>
          )}
          {aiReviewEnabled && (
            <AiReferenceFilesPicker files={lessonFiles} value={aiReferenceFileIds} onChange={setAiReferenceFileIds} />
          )}
          <Button
            className="w-full"
            loading={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
            disabled={
              !title.trim() || !description.trim() || (!types.allowGithub && !types.allowFile) || deadlineInPast
              || Boolean(fromTagError || toTagError)
            }
          >
            {value === 'new' ? 'צרי מטלה' : 'שמרי שינויים'}
          </Button>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
