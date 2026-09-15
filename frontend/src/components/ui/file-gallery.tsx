import { useState, useEffect } from 'react';
import { Image, Video, FileText, Music, Archive, File as FileIcon, Download, Pencil, X } from 'lucide-react';
import { cn, formatBytes } from '@/lib/utils';
import { getFileKindByExtension } from '@/lib/file-type';
import { API_URL } from '@/lib/config';

const OFFICE_EXTENSIONS = new Set(['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx']);
const TEXT_EXTENSIONS = new Set(['txt', 'md']);

export interface GalleryFile {
  id: string;
  name: string;
  url: string;
  extension?: string;
  sizeBytes?: string | null;
}

function resolveFileUrl(url: string): string {
  return `${API_URL}${url}`;
}

const KIND_ICON: Record<string, typeof FileIcon> = {
  image: Image,
  video: Video,
  pdf: FileText,
  audio: Music,
  archive: Archive,
  doc: FileText,
  other: FileIcon,
};

interface FileGalleryProps {
  files: GalleryFile[];
  onDelete?: (fileId: string) => void;
  onRename?: (fileId: string, name: string) => void;
  className?: string;
}

/**
 * Grid of file cards with inline preview below — click to expand a specific file's
 * preview on the page (image/video/audio/text/PDF), not in a modal.
 */
export function FileGallery({ files, onDelete, onRename, className }: FileGalleryProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = files.find((f) => f.id === selectedId);

  if (files.length === 0) return null;

  return (
    <div className={cn('flex flex-col gap-4', selected && 'lg:flex-row-reverse lg:items-start')}>
      <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4', selected && 'lg:flex-1', className)}>
        {files.map((f) => (
          <FileTile
            key={f.id}
            file={f}
            isSelected={f.id === selectedId}
            onOpen={() => setSelectedId(f.id)}
            onDelete={onDelete}
            onRename={onRename}
          />
        ))}
      </div>

      {/* Preview — beside the grid on wide screens, stacked below it on narrow ones */}
      {selected && (
        <FilePreviewInline file={selected} onClose={() => setSelectedId(null)} className="lg:sticky lg:top-4 lg:w-80 lg:shrink-0" />
      )}
    </div>
  );
}

function FileTile({
  file,
  isSelected,
  onOpen,
  onDelete,
  onRename,
}: {
  file: GalleryFile;
  isSelected: boolean;
  onOpen: () => void;
  onDelete?: (id: string) => void;
  onRename?: (id: string, name: string) => void;
}) {
  const kind = getFileKindByExtension(file.extension ?? '');
  const Icon = KIND_ICON[kind];
  const url = resolveFileUrl(file.url);

  const handleRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    const name = window.prompt('שם חדש לקובץ', file.name);
    if (name && name.trim() && name.trim() !== file.name) onRename?.(file.id, name.trim());
  };

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'lift flex w-full flex-col items-center gap-2 rounded-input border-2 bg-sheet p-3 text-center shadow-soft transition hover:bg-ground/40',
          isSelected ? 'border-indigo' : 'border-rule'
        )}
      >
        <div className="flex h-24 w-full items-center justify-center overflow-hidden rounded-sm bg-ground/50">
          {kind === 'image' ? (
            <img src={url} alt={file.name} className="h-full w-full object-cover" loading="lazy" />
          ) : kind === 'audio' ? (
            <audio src={url} className="w-full" controls />
          ) : kind === 'video' ? (
            <video src={url} className="h-full w-full object-cover" />
          ) : kind === 'pdf' ? (
            <iframe src={url} title={file.name} className="h-full w-full border-0" />
          ) : kind === 'doc' ? (
            <iframe
              src={`https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`}
              title={file.name}
              className="h-full w-full border-0 bg-sheet"
            />
          ) : (
            <Icon size={26} className="text-ink/50" />
          )}
        </div>
        <p className="w-full truncate text-xs font-medium text-ink" title={file.name}>
          {file.name}
        </p>
        {file.sizeBytes != null && <p className="text-[10px] text-ink/40">{formatBytes(file.sizeBytes)}</p>}
      </button>
      {onRename && (
        <button
          type="button"
          onClick={handleRename}
          className="absolute -top-2 start-6 rounded-full bg-ink p-1 text-sheet opacity-0 shadow-soft transition group-hover:opacity-100"
          aria-label="שינוי שם קובץ"
        >
          <Pencil size={12} strokeWidth={2.5} />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(file.id);
          }}
          className="absolute -top-2 -start-2 rounded-full bg-coral p-1 text-sheet opacity-0 shadow-soft transition group-hover:opacity-100"
          aria-label="מחיקת קובץ"
        >
          <X size={12} strokeWidth={3} />
        </button>
      )}
    </div>
  );
}

function FilePreviewInline({ file, onClose, className }: { file: GalleryFile; onClose: () => void; className?: string }) {
  const ext = file.extension ?? '';
  const kind = getFileKindByExtension(ext);
  const isOffice = OFFICE_EXTENSIONS.has(ext);
  const isText = TEXT_EXTENSIONS.has(ext);
  const url = resolveFileUrl(file.url);
  const downloadUrl = `${url}${url.includes('?') ? '&' : '?'}dl=1`;

  return (
    <div className={cn('rounded-input border border-rule bg-ground/30 p-4', className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-ink">{file.name}</h3>
          {file.sizeBytes && <p className="text-xs text-ink/50">{formatBytes(file.sizeBytes)}</p>}
        </div>
        <div className="flex shrink-0 gap-2">
          <a
            href={downloadUrl}
            download={file.name}
            className="flex items-center gap-1.5 rounded-input bg-indigo px-3 py-1.5 text-xs font-semibold text-sheet hover:bg-indigo/90"
          >
            <Download size={12} /> הורדה
          </a>
          <button
            onClick={onClose}
            className="rounded-input border border-rule px-3 py-1.5 text-xs font-semibold text-ink hover:bg-sheet/60"
          >
            סגירה
          </button>
        </div>
      </div>

      <div className="flex min-h-72 items-center justify-center overflow-auto rounded-sm bg-sheet p-3">
        {kind === 'image' && (
          <img src={url} alt={file.name} className="max-h-full max-w-full rounded-sm object-contain" />
        )}
        {kind === 'video' && (
          <video src={url} controls className="max-h-full max-w-full rounded-sm" />
        )}
        {kind === 'audio' && <audio src={url} controls className="w-full" />}
        {kind === 'pdf' && (
          <iframe src={url} title={file.name} className="h-full w-full rounded-sm border border-rule" />
        )}
        {kind === 'doc' && isOffice && (
          <iframe
            src={`https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`}
            title={file.name}
            className="h-full w-full rounded-sm border border-rule bg-sheet"
          />
        )}
        {kind === 'doc' && isText && (
          <TextFilePreview url={url} />
        )}
        {(kind === 'archive' || kind === 'other') && (
          <div className="flex flex-col items-center gap-3 text-center">
            <FileIcon size={40} className="text-ink/40" />
            <p className="text-sm text-ink/70">אין תצוגה מקדימה זמינה לסוג קובץ זה</p>
            <a
              href={downloadUrl}
              download={file.name}
              className="rounded-input bg-indigo px-4 py-2 text-sm font-semibold text-sheet hover:bg-indigo/90"
            >
              הורדת הקובץ
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function TextFilePreview({ url }: { url: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.text();
      })
      .then((t) => {
        if (!cancelled) setContent(t);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (error) return <p className="text-sm text-ink/70">שגיאה בטעינת תוכן הקובץ</p>;
  if (content === null) return <p className="text-sm text-ink/50">טוען…</p>;

  return (
    <pre className="max-h-96 w-full overflow-auto whitespace-pre-wrap break-words rounded-sm border border-rule bg-ground/40 p-4 text-right text-xs text-ink">
      {content}
    </pre>
  );
}
