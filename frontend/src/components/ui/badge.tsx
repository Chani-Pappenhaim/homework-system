import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/* Soft tinted chips — a subtle fill with same-family text, rounded pill. */
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold',
  {
    variants: {
      variant: {
        default: 'bg-clay/12 text-clay',
        secondary: 'bg-indigo/12 text-indigo',
        success: 'bg-sage/15 text-sage',
        warning: 'bg-butter/30 text-clay',
        destructive: 'bg-coral/12 text-coral',
        ai: 'bg-indigo/12 text-indigo',
        muted: 'bg-ground text-ink-soft',
      },
    },
    defaultVariants: { variant: 'muted' },
  },
);

interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
export type { BadgeProps };
