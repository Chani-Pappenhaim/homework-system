import { cn } from '@/lib/utils';
import { Logo } from './Logo';

interface BrandProps {
  /** 'header' = compact inline; 'hero' = large stacked (login). */
  variant?: 'header' | 'hero';
  /** Show the "הגשות · שיעורים · ציונים" tagline (hero only by default). */
  tagline?: boolean;
  /** Show "המורה עדי שלום" line. */
  teacher?: boolean;
  className?: string;
}

const TEACHER = 'המורה עדי שלום';
const TAGLINE = 'הגשות · שיעורים · ציונים';

/** קליק כיתה brand lockup — logo mark + wordmark, with optional tagline/teacher. */
export function Brand({ variant = 'header', tagline, teacher, className }: BrandProps) {
  if (variant === 'hero') {
    return (
      <div className={cn('flex flex-col items-center text-center', className)}>
        <Logo size={56} withCheck />
        <div className="mt-3 font-display text-2xl font-bold text-ink">קליק כיתה</div>
        {(tagline ?? true) && <div className="mt-1 text-sm text-ink-soft">{TAGLINE}</div>}
        {teacher && <div className="mt-0.5 text-sm text-ink-soft">{TEACHER}</div>}
      </div>
    );
  }
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <Logo size={30} />
      <div className="leading-tight">
        <div className="font-display text-lg font-bold text-ink">קליק כיתה</div>
        {teacher && <div className="text-[11px] text-ink-soft">{TEACHER}</div>}
      </div>
    </div>
  );
}

export default Brand;
