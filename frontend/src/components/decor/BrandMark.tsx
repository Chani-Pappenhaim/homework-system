import { cn } from '@/lib/utils';

interface BrandMarkProps {
  /** Tailwind size class, e.g. `size-12` (default) or `size-9`. */
  className?: string;
}

/**
 * <BrandMark /> — the "מ" (מסד) logo: a mustard square tilted -3° with a hard
 * ink border and brutal shadow, the letter in Frank Ruhl Libre 900, and a tiny
 * tomato dot (ink-bordered) pinned to its top-left corner.
 */
export function BrandMark({ className }: BrandMarkProps) {
  return (
    <span
      className={cn(
        'relative grid size-12 shrink-0 place-items-center border-2 border-ink bg-mustard shadow-brutal-sm',
        className,
      )}
      style={{ transform: 'rotate(-3deg)' }}
      aria-label="מסד"
    >
      <span className="font-display text-2xl font-black leading-none text-ink" style={{ fontWeight: 900 }}>
        מ
      </span>
      <span className="absolute -left-1 -top-1 size-2.5 rounded-full border-2 border-ink bg-tomato" />
    </span>
  );
}

export default BrandMark;
