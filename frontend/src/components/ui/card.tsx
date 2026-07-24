import * as React from 'react';
import { cn } from '@/lib/utils';

type Accent = 'clay' | 'indigo' | 'sage' | 'butter' | 'coral';

const accentBar: Record<Accent, string> = {
  clay: 'before:bg-clay',
  indigo: 'before:bg-indigo',
  sage: 'before:bg-sage',
  butter: 'before:bg-butter',
  coral: 'before:bg-coral',
};

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** A hairline colored spine on the trailing (right, RTL) edge of the card. */
  accent?: Accent;
  shadow?: boolean;
}

/** Card — a white sheet on the paper ground: hairline border, soft shadow. */
const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, accent, shadow = true, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'relative rounded-card border border-rule bg-sheet text-ink',
        shadow && 'shadow-sheet',
        accent &&
          cn(
            'before:absolute before:inset-y-0 before:right-0 before:w-[3px] before:content-[""]',
            accentBar[accent],
          ),
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('border-b border-rule px-5 py-3.5', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('font-display text-base font-bold text-ink', className)} {...props} />
  ),
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm text-ink-soft', className)} {...props} />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('px-5 py-4', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center border-t border-rule px-5 py-3.5', className)} {...props} />
  ),
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
