import { useNavigate, Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BackLinkProps {
  /** Explicit parent route. When omitted, steps back one entry in browser history instead. */
  to?: string;
  label?: string;
  className?: string;
}

/** Contextual "back" control; the arrow points right to match RTL layout. */
export function BackLink({ to, label = 'חזרה', className }: BackLinkProps) {
  const navigate = useNavigate();
  const cls = cn(
    'inline-flex w-fit items-center gap-1.5 font-sans text-xs font-bold text-ink/70 transition-colors hover:text-ink',
    className,
  );
  const inner = (
    <>
      <ArrowRight size={14} /> {label}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={() => navigate(-1)} className={cls}>
      {inner}
    </button>
  );
}
