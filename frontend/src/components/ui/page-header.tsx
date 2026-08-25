import * as React from 'react';
import { cn } from '@/lib/utils';
import { BackLink } from '@/components/ui/back-link';

interface PageHeaderProps {
  /** Serif display headline. */
  title: string;
  /** Mono meta line above the title (system chrome / breadcrumb / counter). */
  meta?: string;
  /** Right-aligned actions in RTL (buttons, filters). */
  actions?: React.ReactNode;
  /** Show a "back" control. Pass a string to link to an explicit parent route;
   *  pass `true` to step back through history. */
  back?: boolean | string;
  backLabel?: string;
  className?: string;
}

/** Shared page-title block (back link, meta line, headline, actions) so inner pages open consistently. */
export function PageHeader({ title, meta, actions, back, backLabel, className }: PageHeaderProps) {
  return (
    <div className={cn('border-b border-rule pb-3', className)}>
      {back && (
        <div className="mb-2">
          <BackLink to={typeof back === 'string' ? back : undefined} label={backLabel} />
        </div>
      )}
      {meta && (
        <div className="mb-1 font-sans text-[11px] uppercase tracking-wider text-ink/55">{meta}</div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-black text-ink md:text-3xl">{title}</h1>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
