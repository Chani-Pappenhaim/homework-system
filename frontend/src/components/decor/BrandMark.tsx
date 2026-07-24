import { Logo } from './Logo';

/**
 * BrandMark — back-compat alias. The mark is now the ruled-card <Logo />.
 * Prefer <Brand /> for the full lockup or <Logo /> for the mark alone.
 */
export function BrandMark({ className }: { className?: string }) {
  return <Logo size={32} className={className} />;
}

export default BrandMark;
