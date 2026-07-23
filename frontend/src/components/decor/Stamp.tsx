import { cn } from '@/lib/utils';

interface StampProps {
  children: React.ReactNode;
  /** Override rotation (default -6°). */
  rotate?: number;
  className?: string;
}

/**
 * <Stamp /> — a rotated rubber stamp (tomato border + text, wide tracking,
 * uppercase serif). Used for "URGENT", "אושר", collectible stamps, etc.
 */
export function Stamp({ children, rotate, className }: StampProps) {
  return (
    <span
      className={cn('stamp', className)}
      style={rotate !== undefined ? { transform: `rotate(${rotate}deg)` } : undefined}
    >
      {children}
    </span>
  );
}

export default Stamp;
