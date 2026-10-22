import { FileText } from 'lucide-react';
import type { LessonFile } from '@/types';

/** Picks which of the lesson's files the AI review of an assignment relies on. */
export function AiReferenceFilesPicker({ files, value, onChange }: {
  files: LessonFile[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  if (files.length === 0) return null;

  function toggle(id: string, checked: boolean) {
    onChange(checked ? [...value, id] : value.filter((v) => v !== id));
  }

  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-sm font-medium leading-none text-foreground">קבצי השיעור לבדיקת ה-AI (אופציונלי)</legend>
      <p className="text-xs text-ink-soft">
        ה-AI יקרא רק את הקבצים שסימנת ויבדוק את העבודות לאורם. בלי סימון - הוא לא קורא אף קובץ מהשיעור.
      </p>
      <ul className="flex flex-col gap-1">
        {files.map((file) => (
          <li key={file.id}>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={value.includes(file.id)}
                onChange={(e) => toggle(file.id, e.target.checked)}
                className="accent-ink"
              />
              <FileText size={14} className="shrink-0 text-ink-soft" />
              <span className="truncate">{file.name}</span>
              {file.hidden && <span className="shrink-0 text-xs text-ink-soft">(מוסתר מהתלמידות)</span>}
            </label>
          </li>
        ))}
      </ul>
      <p className="text-xs text-ink-soft">קובץ שה-AI לא יכול לקרוא (למשל ZIP או וידאו) ידולג.</p>
    </fieldset>
  );
}
