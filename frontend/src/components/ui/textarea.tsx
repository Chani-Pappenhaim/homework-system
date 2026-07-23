import * as React from 'react';
import { cn } from '@/lib/utils';

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[80px] w-full border-2 border-ink bg-paper px-3 py-2 text-sm text-ink shadow-brutal-sm',
        'placeholder:text-ink/45 focus-visible:outline-none transition-all duration-150 ease-linear',
        'focus-visible:shadow-brutal focus-visible:-translate-x-0.5 focus-visible:-translate-y-0.5',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = 'Textarea';

export { Textarea };
