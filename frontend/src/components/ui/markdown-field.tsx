import { useId, useRef, useState } from 'react';
import { FileUp, Eye, Pencil } from 'lucide-react';
import { contentApi, CONTENT_FILE_ACCEPT } from '@/api/content.api';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
import { useToast } from '@/components/ui/toast';
import { getApiErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';

/**
 * A free-text field stored as Markdown: write it here, or load it from an
 * MD, HTML or Word file (converted on the server), and preview the result.
 */
export function MarkdownField({ label, value, onChange, rows = 5, placeholder, required, id }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  required?: boolean;
  id?: string;
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
          <MarkdownRenderer content={value} />
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
        />
      )}
      <p className="text-xs text-ink-soft">
        אפשר לעצב עם Markdown — כותרות (#), רשימות, קוד (```), קישורים — או לטעון קובץ Markdown, HTML או Word
      </p>
    </div>
  );
}
