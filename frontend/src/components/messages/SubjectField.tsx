import { Input } from '@/components/ui/input';
import { MAX_SUBJECT_LENGTH } from '@/lib/limits';

/** The optional subject of a new thread. */
export function SubjectField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Input
      label="נושא (לא חובה)"
      value={value}
      maxLength={MAX_SUBJECT_LENGTH}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
