import { cn } from '@/lib/utils';

type TapeColor = 'mustard' | 'lilac' | 'tomato' | 'cobalt';

const fills: Record<TapeColor, string> = {
  mustard: 'oklch(var(--mustard) / 0.8)',
  lilac: 'oklch(var(--lilac) / 0.8)',
  tomato: 'oklch(var(--tomato) / 0.72)',
  cobalt: 'oklch(var(--cobalt) / 0.72)',
};

interface TapeProps {
  color?: TapeColor;
  /** Rotation in degrees; spec calls for ±3–6°. */
  rotate?: number;
  /** Positioning + size handed in by the parent (absolute placement). */
  className?: string;
}

/**
 * <Tape /> — a strip of washi tape. Colored translucent fill, a 45° hatch
 * overlay, a hairline ink border and a tiny hard shadow. Purely decorative:
 * the parent owns absolute positioning (e.g. `-top-3 right-6 w-20 h-7`).
 */
export function Tape({ color = 'mustard', rotate = -4, className }: TapeProps) {
  return (
    <span
      aria-hidden
      className={cn('tape-hatch pointer-events-none absolute h-6 w-16 border', className)}
      style={{
        backgroundColor: fills[color],
        borderColor: 'oklch(var(--ink) / 0.25)',
        boxShadow: '1px 1px 0 0 oklch(var(--ink) / 0.35)',
        transform: `rotate(${rotate}deg)`,
      }}
    />
  );
}

export default Tape;
