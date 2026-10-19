import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

/** A free-text search box over a list, with a button that clears what was typed. */
export function SearchField({ value, onChange, placeholder, label, className, inputClassName }: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** The box's accessible name, when the placeholder alone does not say what is searched. */
  label?: string;
  className?: string;
  inputClassName?: string;
}) {
  return (
    <div className={cn('flex items-center gap-2 rounded-input border border-rule px-3 py-1.5 transition-colors focus-within:border-clay', className)}>
      <Search size={15} className="shrink-0 text-ink-soft" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label ?? placeholder}
        className={cn('w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-soft', inputClassName)}
        placeholder={placeholder}
      />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="ניקוי החיפוש" className="text-xs text-ink-soft hover:text-coral">✕</button>
      )}
    </div>
  );
}
