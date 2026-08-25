import { Logo } from './Logo';

/** Back-compat alias for the logo mark. Prefer <Brand /> or <Logo /> directly. */
export function BrandMark({ className }: { className?: string }) {
  return <Logo size={32} className={className} />;
}

export default BrandMark;
