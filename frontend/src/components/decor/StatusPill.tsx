import { cn } from '@/lib/utils';

export type PillVariant =
  | 'ai' // נבדק ע"י AI
  | 'pending' // ממתין
  | 'fix' // דורש תיקון
  | 'approved' // אושר
  | 'neutral';

const styles: Record<PillVariant, string> = {
  ai: 'bg-lilac text-ink',
  pending: 'bg-mustard text-ink',
  fix: 'bg-tomato text-paper',
  approved: 'bg-forest text-paper',
  neutral: 'bg-paper text-ink',
};

interface StatusPillProps {
  variant?: PillVariant;
  children: React.ReactNode;
  className?: string;
}

/**
 * <StatusPill /> — a taped label, not a colored button: uppercase 11px mono,
 * 2px ink border, hard-cornered, colored fill by state.
 */
export function StatusPill({ variant = 'neutral', children, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 border-2 border-ink px-2 py-0.5',
        'font-mono text-[11px] font-bold uppercase leading-none tracking-wider',
        styles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

export default StatusPill;
