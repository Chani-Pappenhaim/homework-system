import type { HTMLAttributes, ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';

export type LessonCardLesson = {
  topic: string;
  hidden?: boolean;
  lessonDate?: string | null;
  completedCount?: number;
  groupStudentCount?: number;
};

/**
 * A lesson tile in the teacher's course page — the same tile whether the
 * lessons are being browsed or reordered. `as` picks the wrapping element
 * (a button to open the lesson, a list item while reordering); `children`
 * adds controls under the details.
 */
export function LessonCard({ lesson, number, as: Tag = 'button', className, children, ...rest }: {
  lesson: LessonCardLesson;
  number: number;
  as?: 'button' | 'li';
  children?: ReactNode;
} & HTMLAttributes<HTMLElement>) {
  return (
    <Tag
      title={lesson.topic}
      className={cn(
        'flex w-36 flex-col items-center gap-1.5 rounded-lg border border-rule p-3 text-center shadow-soft transition-colors',
        lesson.hidden ? 'bg-ground/40' : 'bg-sheet',
        className,
      )}
      {...rest}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ground font-display text-sm font-bold tabular text-ink/60">
        {number}
      </span>
      <p className="flex min-h-[2lh] w-full items-center justify-center gap-1 text-xs font-bold text-ink line-clamp-2">
        {lesson.hidden && <Lock size={10} className="shrink-0 text-ink/40" />}
        {lesson.topic}
      </p>
      <p className="text-[10px] text-ink-soft">
        {lesson.lessonDate ? formatDate(lesson.lessonDate) : 'ללא תאריך'}
      </p>
      {Boolean(lesson.groupStudentCount) && (
        <p className="text-[10px] text-ink-soft">{lesson.completedCount ?? 0}/{lesson.groupStudentCount} סיימו</p>
      )}
      {children}
    </Tag>
  );
}
