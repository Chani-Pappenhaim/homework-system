import { cn } from '@/lib/utils';

export type PillVariant = 'ai' | 'pending' | 'fix' | 'approved' | 'neutral';

const styles: Record<PillVariant, string> = {
  ai: 'bg-indigo/12 text-indigo',
  pending: 'bg-butter/30 text-clay',
  fix: 'bg-coral/12 text-coral',
  approved: 'bg-sage/15 text-sage',
  neutral: 'bg-ground text-ink-soft',
};

interface StatusPillProps {
  variant?: PillVariant;
  children: React.ReactNode;
  className?: string;
}

/** <StatusPill /> — a soft tinted status chip. */
export function StatusPill({ variant = 'neutral', children, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold',
        styles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

export default StatusPill;
