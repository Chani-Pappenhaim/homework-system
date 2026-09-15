import { cn } from '@/lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-card bg-gradient-to-r from-ground via-ground/50 to-ground',
        className,
      )}
    />
  );
}

export function CourseSkeleton() {
  return (
    <div className="space-y-3 rounded-card border border-rule bg-sheet p-4 shadow-soft">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Skeleton className="size-10 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-dashed border-rule/25 pt-2 gap-2">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-8 w-20" />
      </div>
    </div>
  );
}

export function MessageSkeleton() {
  return (
    <div className="flex w-full items-center gap-3 px-4 py-3">
      <Skeleton className="size-10 shrink-0 rounded-full" />
      <div className="flex-1 min-w-0 space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-full" />
      </div>
      <Skeleton className="h-6 w-16 shrink-0" />
    </div>
  );
}
