import { useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';
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

  function pick(file: File) {
    if (withName) {
      setStaged(file);
      // Default the name to the original filename without its extension
      setName(file.name.replace(/\.[^.]+$/, ''));
    } else {
      onFile(file);
    }
  }

  function confirmUpload() {
    if (!staged) return;
    onFile(staged, name);
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

  // Naming step: a file was chosen, waiting for a display name + confirmation
  if (staged) {
    return (
      <div className={cn('border-2 border-[#EEEBF5] rounded-input p-4 space-y-3', className)}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-[#6B7280] truncate">
            קובץ נבחר: <span className="font-medium text-[#1A1830]">{staged.name}</span>
          </p>
          <button type="button" onClick={cancel} className="text-[#9CA3AF] hover:text-[#1A1830] flex-shrink-0">
            <X size={16} />
          </button>
        </div>
        <Input
          label="שם הקובץ"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="שם לתצוגה"
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={confirmUpload} disabled={!name.trim()}>העלה קובץ</Button>
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
