import { cn } from '@/lib/utils';

interface TickerProps {
  items: string[];
  className?: string;
}

/** <Ticker /> — a quiet announcements strip (the scrolling marquee was retired). */
export function Ticker({ items, className }: TickerProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-rule bg-sheet px-4 py-2 text-xs text-ink-soft',
        className,
      )}
    >
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && <span className="text-clay" aria-hidden>·</span>}
          {item}
        </span>
      ))}
    </div>
  );
}

export default Ticker;
