import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, GripHorizontal } from 'lucide-react';
import { lessonsApi } from '@/api/lessons.api';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { getApiErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { LessonCard, type LessonCardLesson } from './LessonCard';

type Item = LessonCardLesson & { id: string };

function move<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Drag-and-drop (or arrow buttons) ordering of a course's lessons, laid out as
 * the same tiles the course page shows. In the right-to-left grid the right
 * arrow moves a lesson earlier and the left arrow later.
 */
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
      <p className="text-xs text-ink/60">אפשר לגרור שיעור למקום החדש, או להשתמש בחיצים. מספרי השיעורים יתעדכנו לפי הסדר.</p>
      <ol className="flex flex-wrap gap-3">
        {items.map((l, i) => (
          <LessonCard
            key={l.id}
            as="li"
            lesson={l}
            number={i + 1}
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragIndex === null || dragIndex === i) return;
              setItems((prev) => move(prev, dragIndex, i));
              setDragIndex(i);
            }}
            onDragEnd={() => setDragIndex(null)}
            className={cn('cursor-grab', dragIndex === i && 'border-clay opacity-60')}
          >
            <div className="flex w-full items-center justify-between">
              <button
                type="button"
                disabled={i === 0}
                onClick={() => setItems((prev) => move(prev, i, i - 1))}
                className="rounded p-1 text-ink/60 hover:bg-ground disabled:opacity-30"
                aria-label="הזזה אחורה"
              >
                <ChevronRight size={14} />
              </button>
              <GripHorizontal size={14} className="text-ink/40" />
              <button
                type="button"
                disabled={i === items.length - 1}
                onClick={() => setItems((prev) => move(prev, i, i + 1))}
                className="rounded p-1 text-ink/60 hover:bg-ground disabled:opacity-30"
                aria-label="הזזה קדימה"
              >
                <ChevronLeft size={14} />
              </button>
            </div>
          </LessonCard>
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
