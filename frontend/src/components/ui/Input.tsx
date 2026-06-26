import { cn } from '@/lib/utils';
import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(({ label, error, className, ...props }, ref) => {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-sm font-medium text-[#1A1830]">{label}</label>}
      <input
        ref={ref}
        className={cn(
          'w-full px-3 py-2 border rounded-input text-sm bg-white text-[#1A1830] placeholder:text-[#9CA3AF]',
          'focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition',
          error ? 'border-red-400' : 'border-[#EEEBF5]',
          className
        )}
        {...props}
      />
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
});

Input.displayName = 'Input';
export default Input;
