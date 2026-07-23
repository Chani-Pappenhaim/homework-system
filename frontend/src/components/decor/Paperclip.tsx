import { cn } from '@/lib/utils';

interface PaperclipProps {
  /** Rotation in degrees; spec calls for ±6–12°. */
  rotate?: number;
  className?: string;
}

/**
 * <Paperclip /> — an inline-SVG paperclip stroke in --ink, clipped over the top
 * edge of a card. The parent positions it (e.g. `absolute -top-3 right-8`).
 */
export function Paperclip({ rotate = -8, className }: PaperclipProps) {
  return (
    <span
      aria-hidden
      className={cn('pointer-events-none absolute', className)}
      style={{ transform: `rotate(${rotate}deg)`, filter: 'drop-shadow(1px 1px 0 oklch(var(--ink) / 0.35))' }}
    >
      <svg width="24" height="44" viewBox="0 0 24 44" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M12 6 v24 a5 5 0 0 1-10 0 V10 a3 3 0 0 1 6 0 v20 a1.5 1.5 0 0 1-3 0 V12"
          stroke="oklch(var(--ink))"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export default Paperclip;
