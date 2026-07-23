import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileUploadProps {
  onFile: (file: File) => void;
  accept?: string;
  label?: string;
  className?: string;
}

function FileUpload({ onFile, accept, label = 'גרור קובץ לכאן או לחצי לבחירה', className }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  }

  return (
    <div
      className={cn(
        'border-2 border-dashed rounded-input p-6 text-center cursor-pointer transition',
        dragOver ? 'border-primary bg-lilac/25/30' : 'border-ink/20 hover:border-primary/50',
        className
      )}
      onClick={() => inputRef.current?.click()}
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
    >
      <Upload className="mx-auto mb-2 text-ink/50" size={24} />
      <p className="text-sm text-ink/70">{label}</p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />
    </div>
  );
}

export { FileUpload };
