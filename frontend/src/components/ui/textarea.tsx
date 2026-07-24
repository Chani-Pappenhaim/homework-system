import * as React from 'react';
import { cn } from '@/lib/utils';

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[80px] w-full rounded-input border border-rule bg-sheet px-3 py-2 text-sm text-ink',
        'placeholder:text-ink-soft/70 focus-visible:outline-none transition-colors duration-150 ease-out',
        'focus-visible:border-clay focus-visible:ring-2 focus-visible:ring-clay/25',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = 'Textarea';

export { Textarea };
