import { Input } from '@/components/ui/input';
import { toHebrewDate } from '@/lib/utils';

interface DateFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

/** A native date picker with the Hebrew calendar equivalent shown underneath. */
export function DateField({ label, value, onChange }: DateFieldProps) {
  const hebrew = toHebrewDate(value);
  return (
    <div className="space-y-1">
      <Input label={label} type="date" value={value} onChange={(e) => onChange(e.target.value)} />
      {hebrew && <p className="text-xs text-ink/50">{hebrew}</p>}
    </div>
  );
}
