import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, GripVertical, Lock } from 'lucide-react';
import { lessonsApi } from '@/api/lessons.api';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { getApiErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';

type Item = { id: string; topic: string; hidden?: boolean };

function move<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Drag-and-drop (or arrow buttons) ordering of a course's lessons. */
export function LessonReorderList({ courseId, lessons, onDone }: {
  courseId: string;
  lessons: Item[];
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [items, setItems] = useState(lessons);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const changed = items.some((l, i) => l.id !== lessons[i]?.id);

  const saveMutation = useMutation({
    mutationFn: () => lessonsApi.reorder(items.map((l, i) => ({ id: l.id, order: i }))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course', courseId] });
      toast.success('סדר השיעורים נשמר');
      onDone();
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'שמירת הסדר נכשלה')),
  });

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink/60">גררי שיעור למקום החדש, או השתמשי בחיצים. מספרי השיעורים יתעדכנו לפי הסדר.</p>
      <ol className="space-y-1.5">
        {items.map((l, i) => (
          <li
            key={l.id}
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragIndex === null || dragIndex === i) return;
              setItems((prev) => move(prev, dragIndex, i));
              setDragIndex(i);
            }}
            onDragEnd={() => setDragIndex(null)}
            className={cn(
              'flex cursor-grab items-center gap-3 rounded-lg border border-rule bg-sheet px-3 py-2 shadow-soft',
              dragIndex === i && 'border-clay opacity-60'
            )}
          >
            <GripVertical size={14} className="shrink-0 text-ink/40" />
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ground font-display text-xs font-bold tabular text-ink/60">
              {i + 1}
            </span>
            <span className="flex flex-1 items-center gap-1 text-sm font-medium text-ink">
              {l.hidden && <Lock size={11} className="shrink-0 text-ink/40" />}
              {l.topic}
            </span>
            <button
              type="button"
              disabled={i === 0}
              onClick={() => setItems((prev) => move(prev, i, i - 1))}
              className="rounded p-1 text-ink/60 hover:bg-ground disabled:opacity-30"
              aria-label="הזזה למעלה"
            >
              <ArrowUp size={14} />
            </button>
            <button
              type="button"
              disabled={i === items.length - 1}
              onClick={() => setItems((prev) => move(prev, i, i + 1))}
              className="rounded p-1 text-ink/60 hover:bg-ground disabled:opacity-30"
              aria-label="הזזה למטה"
            >
              <ArrowDown size={14} />
            </button>
          </li>
        ))}
      </ol>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onDone}>ביטול</Button>
        <Button size="sm" disabled={!changed} loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          שמירת הסדר
        </Button>
      </div>
    </div>
  );
}
