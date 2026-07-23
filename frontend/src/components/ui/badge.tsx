import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/* Hard-cornered, ink-bordered chips — colored fills from the riso palette. */
const badgeVariants = cva(
  'inline-flex items-center gap-1 border-2 border-ink px-2 py-0.5 text-xs font-bold uppercase tracking-wide',
  {
    variants: {
      variant: {
        default: 'bg-mustard text-ink',
        secondary: 'bg-lilac text-ink',
        success: 'bg-forest text-paper',
        warning: 'bg-mustard text-ink',
        destructive: 'bg-tomato text-paper',
        ai: 'bg-plum text-paper',
        muted: 'bg-cream text-ink',
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
