import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/*
  Buttons are taped labels / stamped tickets — never generic filled buttons.
  Every solid variant carries a 2px ink border + hard shadow and lifts on hover
  (hover-lift = translate -2,-2 & shadow grows). No fades, no scales.
*/
const buttonVariants = cva(
  cn(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap font-sans font-bold',
    'border-2 border-ink transition-all duration-150 ease-linear select-none',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-paper',
    'disabled:pointer-events-none disabled:opacity-50',
  ),
  {
    variants: {
      variant: {
        // White taped button — the standard primary action ("מטלה חדשה +").
        default: 'bg-paper text-ink shadow-brutal-sm hover-lift',
        // Mustard ticket — high-emphasis submit.
        mustard: 'bg-mustard text-ink shadow-brutal-sm hover-lift',
        // Solid ink — active/selected emphasis.
        ink: 'bg-ink text-paper shadow-brutal-sm hover-lift',
        secondary: 'bg-cream text-ink shadow-brutal-sm hover-lift',
        destructive: 'bg-tomato text-paper shadow-brutal-sm hover-lift',
        // Bordered, no fill — presses in on hover instead of lifting.
        outline: 'bg-transparent text-ink hover-press',
        // No border/shadow — a quiet inline control.
        ghost: 'border-transparent text-ink hover:bg-mustard/25',
        // Text link with a mustard highlighter swipe on hover.
        link: 'border-transparent text-ink underline-offset-4 hover:underline',
      },
      size: {
        sm: 'px-3 py-1.5 text-xs',
        default: 'px-4 py-2 text-sm',
        lg: 'px-6 py-2.5 text-base',
        icon: 'size-9 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** `loading={m.isPending}` disables the button and shows the spinner. */
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        disabled={disabled || loading}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading && (
              <svg className="size-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
export type { ButtonProps };
