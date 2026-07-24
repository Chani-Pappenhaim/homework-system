import { cn } from '@/lib/utils';

interface LogoProps {
  /** Height in px (width scales to match the 40×48 mark). Default 28. */
  size?: number;
  /** Show the sage ✓ badge (the "click"). Off for tiny sizes. */
  withCheck?: boolean;
  className?: string;
}

/**
 * קליק כיתה mark — a ruled index card with a folded corner and (optionally) a
 * sage check badge, the "click" of a checked-off submission. Colors reference
 * the CSS palette vars so the mark flips correctly in dark mode.
 */
export function Logo({ size = 28, withCheck = false, className }: LogoProps) {
  const w = (size * 40) / 48;
  return (
    <svg
      width={w}
      height={size}
      viewBox="0 0 40 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      role="img"
      aria-label="קליק כיתה"
    >
      <rect x="1" y="1" width="38" height="46" rx="3" fill="rgb(var(--sheet))" stroke="rgb(var(--ink))" strokeWidth="1.5" />
      {/* folded top-left corner */}
      <path d="M1 14 L14 1 L14 14 Z" fill="rgb(var(--rule))" />
      <path d="M14 1 L14 14 L1 14" stroke="rgb(var(--ink))" strokeWidth="1.2" strokeLinejoin="round" fill="none" opacity="0.55" />
      {/* ruled lines — top one in clay */}
      <line x1="7" y1="20" x2="33" y2="20" stroke="rgb(var(--clay))" strokeWidth="2" strokeLinecap="round" />
      <line x1="12" y1="28" x2="33" y2="28" stroke="rgb(var(--rule))" strokeWidth="2" strokeLinecap="round" />
      <line x1="9" y1="36" x2="33" y2="36" stroke="rgb(var(--rule))" strokeWidth="2" strokeLinecap="round" />
      {withCheck && (
        <g>
          <circle cx="7" cy="42" r="7" fill="rgb(var(--sage))" stroke="rgb(var(--sheet))" strokeWidth="2" />
          <path d="M4 42 L6.2 44 L10 39.5" stroke="rgb(var(--sheet))" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </g>
      )}
    </svg>
  );
}

export default Logo;
