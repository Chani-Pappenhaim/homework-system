import { Fragment } from 'react';
import { cn } from '@/lib/utils';

interface TickerProps {
  items: string[];
  className?: string;
}

/**
 * <Ticker /> — full-width black announcement strip. Items separated by a mustard
 * ◆ and scrolled RTL. Content is duplicated so the marquee loops seamlessly at
 * -50% (see .marquee-track / np-marquee in globals.css).
 */
export function Ticker({ items, className }: TickerProps) {
  const Row = () => (
    <>
      {items.map((item, i) => (
        <Fragment key={i}>
          <span className="px-4">{item}</span>
          <span className="text-mustard" aria-hidden>◆</span>
        </Fragment>
      ))}
    </>
  );

  return (
    <div className={cn('overflow-hidden bg-ink py-1.5', className)}>
      <div className="marquee-track font-sans text-[11px] font-black uppercase tracking-[0.25em] text-paper">
        {/* two copies = one seamless loop */}
        <span className="flex shrink-0"><Row /></span>
        <span className="flex shrink-0" aria-hidden><Row /></span>
      </div>
    </div>
  );
}

export default Ticker;
