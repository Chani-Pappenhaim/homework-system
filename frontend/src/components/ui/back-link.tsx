import { useNavigate, Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BackLinkProps {
  /**
   * Explicit parent route. When omitted, goes back one step in history
   * (navigate(-1)) — i.e. up the path the user actually walked, not to a
   * reset top-level tab.
   */
  to?: string;
  label?: string;
  className?: string;
}

/**
 * BackLink — contextual "back" control. In RTL the arrow points right (→),
 * the direction of "back". Prefer an explicit `to` when the parent is known;
 * otherwise it steps back through history.
 */
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
