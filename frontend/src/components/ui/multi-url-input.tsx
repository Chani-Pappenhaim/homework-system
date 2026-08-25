import { Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface MultiUrlInputProps {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}

/** A dynamic list of URL fields — e.g. a lesson can link to more than one GitHub repo. */
export function MultiUrlInput({ label, values, onChange, placeholder }: MultiUrlInputProps) {
  const rows = values.length > 0 ? values : [''];

  function update(i: number, value: string) {
    const next = [...rows];
    next[i] = value;
    onChange(next);
  }

  function add() {
    onChange([...rows, '']);
  }

  function remove(i: number) {
    const next = rows.filter((_, idx) => idx !== i);
    onChange(next.length > 0 ? next : ['']);
  }

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {rows.map((v, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={v}
            onChange={(e) => update(i, e.target.value)}
            placeholder={placeholder}
            className="flex-1"
          />
          {rows.length > 1 && (
            <button
              type="button"
              onClick={() => remove(i)}
              className="shrink-0 rounded-input p-2 text-ink/40 hover:bg-ground/60 hover:text-coral"
              aria-label="הסרת קישור"
            >
              <X size={15} />
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="flex items-center gap-1 text-xs font-semibold text-clay hover:underline"
      >
        <Plus size={13} /> הוסף קישור נוסף
      </button>
    </div>
  );
}
