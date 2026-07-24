import * as React from 'react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /**
   * `label` and `error` are not part of upstream shadcn, which expects a Label
   * to be composed alongside the Input. They stay because every form here uses
   * them, and folding them in is what lets the label carry an htmlFor — as
   * separate markup the two were never associated, so clicking a label did
   * nothing and screen readers announced the field unnamed.
   */
  label?: string;
  error?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className, id, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    const errorId = `${inputId}-error`;

    return (
      <div className="flex flex-col gap-1">
        {label && <Label htmlFor={inputId}>{label}</Label>}
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
            className
          )}
          {...props}
        />
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
