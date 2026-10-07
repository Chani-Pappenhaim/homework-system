import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/** File-type presets the teacher can tick; extensions are stored without the dot. */
export const FILE_TYPE_PRESETS = [
  { label: 'Word', exts: ['doc', 'docx'] },
  { label: 'Excel', exts: ['xls', 'xlsx', 'csv'] },
  { label: 'PowerPoint', exts: ['ppt', 'pptx'] },
  { label: 'PDF', exts: ['pdf'] },
  { label: 'ZIP', exts: ['zip'] },
] as const;

export interface SubmissionTypes {
  allowGithub: boolean;
  allowFile: boolean;
  /** Empty means any file type. */
  allowedTypes: string[];
}

export function SubmissionTypePicker({ value, onChange }: {
  value: SubmissionTypes;
  onChange: (next: SubmissionTypes) => void;
}) {
  const { allowGithub, allowFile, allowedTypes } = value;
  const anyType = allowedTypes.length === 0;
  const presetExts: string[] = FILE_TYPE_PRESETS.flatMap((p) => [...p.exts]);
  const otherExts = allowedTypes.filter((t) => !presetExts.includes(t));

  const togglePreset = (exts: readonly string[], on: boolean) => {
    const rest = allowedTypes.filter((t) => !exts.includes(t));
    onChange({ ...value, allowedTypes: on ? [...rest, ...exts] : rest });
  };

  const setOther = (text: string) => {
    const typed = text.split(/[\s,]+/).map((t) => t.replace(/^\./, '').toLowerCase()).filter(Boolean);
    const presets = allowedTypes.filter((t) => presetExts.includes(t));
    onChange({ ...value, allowedTypes: [...new Set([...presets, ...typed])] });
  };

  const chip = (active: boolean) => cn(
    'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
    active ? 'border-ink bg-ink text-sheet' : 'border-rule bg-sheet text-ink/70 hover:border-ink/40'
  );

  return (
    <div className="flex flex-col gap-2">
      <Label>איך מגישים?</Label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={chip(allowGithub)} onClick={() => onChange({ ...value, allowGithub: !allowGithub })}>
          קישור ל-GitHub
        </button>
        <button type="button" className={chip(allowFile)} onClick={() => onChange({ ...value, allowFile: !allowFile })}>
          העלאת קובץ
        </button>
      </div>

      {allowFile && (
        <div className="flex flex-col gap-2 rounded-input border border-rule bg-ground/40 p-3">
          <p className="text-xs font-medium text-ink/70">אילו קבצים?</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={chip(anyType)} onClick={() => onChange({ ...value, allowedTypes: [] })}>
              כל סוג
            </button>
            {FILE_TYPE_PRESETS.map((p) => {
              const on = p.exts.every((e) => allowedTypes.includes(e));
              return (
                <button key={p.label} type="button" className={chip(on)} onClick={() => togglePreset(p.exts, !on)}>
                  {p.label}
                </button>
              );
            })}
          </div>
          <input
            dir="ltr"
            defaultValue={otherExts.join(', ')}
            key={otherExts.join(',')}
            onBlur={(e) => setOther(e.target.value)}
            placeholder="סיומות נוספות, למשל: py, html"
            className="rounded-input border border-rule bg-sheet px-3 py-1.5 text-xs text-ink focus:border-clay focus:outline-none"
          />
          {!anyType && <p className="text-[11px] text-ink/55" dir="ltr">{allowedTypes.map((t) => `.${t}`).join('  ')}</p>}
        </div>
      )}

      {!allowGithub && !allowFile && (
        <p className="text-xs text-coral">יש לבחור לפחות דרך הגשה אחת</p>
      )}
    </div>
  );
}
