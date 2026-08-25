import { useEffect, useRef, useState } from 'react';
import { Upload, X, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getFileKind } from '@/lib/file-type';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface FileUploadProps {
  onFile: (file: File, name?: string) => void;
  accept?: string;
  label?: string;
  className?: string;
  /** When true, after picking a file the user can give it a display name before uploading. */
  withName?: boolean;
}

function FileUpload({ onFile, accept, label = 'גרור קובץ לכאן או לחצי לבחירה', className, withName }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [staged, setStaged] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!staged) { setPreviewUrl(null); return; }
    const kind = getFileKind(staged.name);
    if (kind !== 'image' && kind !== 'video') { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(staged);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [staged]);

  function pick(file: File) {
    setStaged(file);
    // Default the name to the original filename without its extension
    if (withName) setName(file.name.replace(/\.[^.]+$/, ''));
  }

  function confirmUpload() {
    if (!staged) return;
    onFile(staged, withName ? name : undefined);
    setStaged(null);
    setName('');
  }

  function cancel() {
    setStaged(null);
    setName('');
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) pick(file);
  }

  // Staged step: a file was chosen — show a preview and wait for confirmation
  // (and, when withName, a display name) before actually uploading.
  if (staged) {
    const kind = getFileKind(staged.name);
    return (
      <div className={cn('border-2 border-[#EEEBF5] rounded-input p-4 space-y-3', className)}>
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-ground/50">
            {kind === 'image' && previewUrl ? (
              <img src={previewUrl} alt={staged.name} className="h-full w-full object-cover" />
            ) : kind === 'video' && previewUrl ? (
              <video src={previewUrl} className="h-full w-full object-cover" muted />
            ) : (
              <FileText size={22} className="text-ink/50" />
            )}
          </div>
          <p className="min-w-0 flex-1 truncate text-sm text-[#6B7280]">
            קובץ נבחר: <span className="font-medium text-[#1A1830]">{staged.name}</span>
          </p>
          <button type="button" onClick={cancel} className="text-[#9CA3AF] hover:text-[#1A1830] flex-shrink-0">
            <X size={16} />
          </button>
        </div>
        {withName && (
          <Input
            label="שם הקובץ"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="שם לתצוגה"
          />
        )}
        <div className="flex gap-2">
          <Button size="sm" onClick={confirmUpload} disabled={withName && !name.trim()}>העלה קובץ</Button>
          <Button size="sm" variant="outline" onClick={cancel}>ביטול</Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'cursor-pointer border border-dashed p-6 text-center transition-colors duration-150 ease-linear',
        dragOver ? 'border-rule bg-butter/25' : 'border-rule/40 hover:border-rule hover:bg-butter/10',
        className
      )}
      onClick={() => inputRef.current?.click()}
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
    >
      <Upload className="mx-auto mb-2 text-ink/60" size={24} />
      <p className="text-sm font-bold text-ink/70">{label}</p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ''; }}
      />
    </div>
  );
}

export { FileUpload };
