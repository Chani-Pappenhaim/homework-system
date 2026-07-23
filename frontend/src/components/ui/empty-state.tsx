import * as React from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  /** Message shown centered on a dashed "blank page". */
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

/**
 * EmptyState — a blank ruled page for "nothing here yet". Dashed ink border,
 * mono copy. Used wherever a list/table comes back empty.
 */
export function EmptyState({ children, icon, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 border-2 border-dashed border-ink/40 bg-paper px-6 py-12 text-center',
        className,
      )}
    >
      {icon && <div className="text-ink/40">{icon}</div>}
      <p className="font-mono text-sm text-ink/50">{children}</p>
    </div>
  );
}
