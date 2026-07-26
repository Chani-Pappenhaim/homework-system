import { cn } from '@/lib/utils';

type TapeColor = 'mustard' | 'lilac' | 'tomato' | 'cobalt' | 'clay' | 'indigo' | 'sage' | 'butter' | 'coral';

// Old + new color names both map to translucent washi tints.
const fills: Record<TapeColor, string> = {
  mustard: 'rgb(var(--butter) / 0.4)',
  butter: 'rgb(var(--butter) / 0.4)',
  lilac: 'rgb(var(--indigo) / 0.28)',
  indigo: 'rgb(var(--indigo) / 0.28)',
  tomato: 'rgb(var(--coral) / 0.3)',
  cobalt: 'rgb(var(--indigo) / 0.3)',
  clay: 'rgb(var(--clay) / 0.32)',
  sage: 'rgb(var(--sage) / 0.32)',
  coral: 'rgb(var(--coral) / 0.3)',
};

interface TapeProps {
  color?: TapeColor;
  rotate?: number;
  className?: string;
}

/** <Tape /> — a translucent washi strip. Parent owns absolute placement. */
export function Tape({ color = 'clay', rotate = -3, className }: TapeProps) {
  return (
    <span
      aria-hidden
      className={cn('tape pointer-events-none absolute h-[18px] w-16', className)}
      style={{ backgroundColor: fills[color], transform: `rotate(${rotate}deg)` }}
    />
  );
}

export default Tape;
