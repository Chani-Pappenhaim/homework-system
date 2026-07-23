import * as React from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  /** Serif display headline. */
  title: string;
  /** Mono meta line above the title (system chrome / breadcrumb / counter). */
  meta?: string;
  /** Right-aligned actions in RTL (buttons, filters). */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * PageHeader — the notebook page-title block: a thin ink rule, an optional mono
 * meta line, a Frank Ruhl Libre headline, and an actions slot. One place so
 * every inner page opens the same way instead of re-inventing the markup.
 */
export function PageHeader({ title, meta, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('border-b-2 border-ink pb-3', className)}>
      {meta && (
        <div className="mb-1 font-mono text-[11px] uppercase tracking-wider text-ink/55">{meta}</div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-black text-ink md:text-3xl">{title}</h1>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
