import * as React from 'react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Optional label and error text rendered alongside the input, with the label properly associated via htmlFor for accessibility. */
  label?: string;
  error?: string;
  /** Rendered inside the input's own wrapper (e.g. a show/hide password toggle), positioned against the input box itself. */
  endAdornment?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className, id, endAdornment, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    const errorId = `${inputId}-error`;

    return (
      <div className="flex flex-col gap-1">
        {label && <Label htmlFor={inputId}>{label}</Label>}
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className={cn(
              'w-full rounded-input border border-rule bg-sheet px-3 py-2 text-sm text-ink',
              'placeholder:text-ink-soft/70 transition-colors duration-150 ease-out',
              'focus-visible:outline-none focus-visible:border-clay focus-visible:ring-2 focus-visible:ring-clay/25',
              'disabled:cursor-not-allowed disabled:opacity-50',
              error && 'border-coral',
              endAdornment && 'pl-9',
              className
            )}
            {...props}
          />
          {endAdornment && (
            <div className="absolute left-2.5 top-1/2 -translate-y-1/2">{endAdornment}</div>
          )}
        </div>
        {error && (
          <span id={errorId} className="text-xs text-coral">
            {error}
          </span>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';

export { Input };
export type { InputProps };
