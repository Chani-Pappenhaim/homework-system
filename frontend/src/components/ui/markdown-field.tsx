import { useId, useRef, useState } from 'react';
import { FileUp, Eye, Pencil } from 'lucide-react';
import { contentApi, CONTENT_FILE_ACCEPT } from '@/api/content.api';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MarkdownRenderer, MarkdownText } from '@/components/ui/markdown-renderer';
import { useToast } from '@/components/ui/toast';
import { getApiErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';

/**
 * A free-text field stored as Markdown: write it here, or load it from an
 * MD, HTML or Word file (converted on the server), and preview the result.
 */
export function MarkdownField({ label, value, onChange, rows = 5, placeholder, required, id, showHint = true, inline = false, maxLength }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  required?: boolean;
  id?: string;
  /** The formatting help line; a form with many fields shows it once instead. */
  showHint?: boolean;
  /** Preview it the way short inline text (a quiz question) is shown to students. */
  inline?: boolean;
  /** The server's limit; a counter shows up as the text gets close to it. */
  maxLength?: number;
}) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadFile = async (file: File) => {
    if (value.trim() && !confirm('להחליף את הטקסט הקיים בתוכן הקובץ?')) return;
    setLoading(true);
    try {
      onChange(await contentApi.toMarkdown(file));
      setPreview(true);
      toast.success('התוכן נטען מהקובץ');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'טעינת הקובץ נכשלה'));
    } finally {
      setLoading(false);
    }
  };

  const tool = 'flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold text-ink/60 hover:bg-ground hover:text-ink disabled:opacity-50';

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={fieldId}>{label}</Label>
        <div className="flex items-center gap-1">
          <button type="button" className={tool} disabled={loading} onClick={() => fileInput.current?.click()}>
            <FileUp size={12} /> {loading ? 'טוען...' : 'טעינה מקובץ'}
          </button>
          <button type="button" className={tool} onClick={() => setPreview((p) => !p)} disabled={!value.trim() && !preview}>
            {preview ? <><Pencil size={12} /> עריכה</> : <><Eye size={12} /> תצוגה מקדימה</>}
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept={CONTENT_FILE_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void loadFile(file);
          }}
        />
      </div>
      {preview ? (
        <div className={cn('min-h-[80px] overflow-auto rounded-input border border-rule bg-sheet px-3 py-2')} style={{ maxHeight: `${Math.max(rows, 6) * 1.75}rem` }}>
          {inline ? <MarkdownText content={value} className="text-sm text-ink" /> : <MarkdownRenderer content={value} />}
        </div>
      ) : (
        <Textarea
          id={fieldId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          className="resize-y font-sans"
          placeholder={placeholder}
          required={required}
          maxLength={maxLength}
        />
      )}
      {maxLength !== undefined && value.length > maxLength * 0.8 && (
        <p className={cn('text-xs tabular', value.length > maxLength ? 'font-semibold text-clay' : 'text-ink-soft')}>
          {value.length}/{maxLength} תווים
        </p>
      )}
      {showHint && (
        <p className="text-xs text-ink-soft">
          אפשר לעצב את הטקסט (כותרות, רשימות, קוד) או לטעון אותו מקובץ Word, HTML, Markdown או טקסט.
        </p>
      )}
    </div>
  );
}
