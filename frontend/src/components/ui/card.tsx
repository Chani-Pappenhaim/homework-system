import * as React from 'react';
import { cn } from '@/lib/utils';

type Accent = 'cobalt' | 'tomato' | 'forest' | 'plum' | 'mustard' | 'lilac';

const accentBar: Record<Accent, string> = {
  cobalt: 'before:bg-cobalt',
  tomato: 'before:bg-tomato',
  forest: 'before:bg-forest',
  plum: 'before:bg-plum',
  mustard: 'before:bg-mustard',
  lilac: 'before:bg-lilac',
};

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** A 1.5px colored accent bar across the very top edge of the card. */
  accent?: Accent;
  /** Adds the hard brutal shadow (default on). */
  shadow?: boolean;
}

/**
 * Card — a taped-down index card: hard corners, 2px ink border, hard offset
 * shadow. `accent` paints a colored rule across the top edge via ::before.
 */
const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, accent, shadow = true, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'relative border-2 border-ink bg-paper text-ink',
        shadow && 'shadow-brutal',
        accent &&
          cn(
            'before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:content-[""]',
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
    <div ref={ref} className={cn('border-b-2 border-ink bg-cream/60 px-5 py-3.5', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('font-display text-lg font-bold text-ink', className)} {...props} />
  ),
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm text-ink/60', className)} {...props} />
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
    <div
      ref={ref}
      className={cn('flex items-center border-t-2 border-ink px-5 py-3.5', className)}
      {...props}
    />
  ),
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
