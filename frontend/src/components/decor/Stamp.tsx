import { cn } from '@/lib/utils';

interface StampProps {
  children: React.ReactNode;
  rotate?: number;
  className?: string;
}

/** <Stamp /> — a small clay-outlined chip (softened from the rubber stamp). */
export function Stamp({ children, className }: StampProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border border-clay/55 px-2 py-0.5 text-[11px] font-semibold text-clay',
        className,
      )}
    >
      {children}
    </span>
  );
}

export default Stamp;
