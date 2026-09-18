import { useState, useEffect } from 'react';
import { Image, Video, FileText, Music, Archive, File as FileIcon, Download, Pencil, X, Star } from 'lucide-react';
import { cn, formatBytes } from '@/lib/utils';
import { getFileKindByExtension } from '@/lib/file-type';
import { API_URL } from '@/lib/config';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

const OFFICE_EXTENSIONS = new Set(['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx']);
const TEXT_EXTENSIONS = new Set(['txt', 'md']);

export interface GalleryFile {
  id: string;
  name: string;
  url: string;
  extension?: string;
  sizeBytes?: string | null;
  required?: boolean;
  viewed?: boolean;
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
  /** Teacher-only — toggles whether a file is mandatory viewing for students. */
  onToggleRequired?: (fileId: string, required: boolean) => void;
  /** Student-only — marks a required file as seen/read. */
  onMarkViewed?: (fileId: string) => void;
  /** Student-only — undoes an accidental "seen" mark on a required file. */
  onUnmarkViewed?: (fileId: string) => void;
  className?: string;
}

/**
 * Grid of file cards; clicking one opens its preview across the whole screen
 * (image/video/audio/text/Office/PDF). A document read in a 320px column beside
 * the grid was legible for nothing but a thumbnail, which defeats the point of
 * previewing it at all.
 */
export function FileGallery({ files, onDelete, onRename, onToggleRequired, onMarkViewed, onUnmarkViewed, className }: FileGalleryProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = files.find((f) => f.id === selectedId);

  if (files.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4', className)}>
        {files.map((f) => (
          <FileTile
            key={f.id}
            file={f}
            isSelected={f.id === selectedId}
            onOpen={() => setSelectedId(f.id)}
            onDelete={onDelete}
            onRename={onRename}
            onToggleRequired={onToggleRequired}
            onMarkViewed={onMarkViewed}
            onUnmarkViewed={onUnmarkViewed}
          />
        ))}
      </div>

      <FilePreviewDialog file={selected} onClose={() => setSelectedId(null)} />
    </div>
  );
}

function FileTile({
  file,
  isSelected,
  onOpen,
  onDelete,
  onRename,
  onToggleRequired,
  onMarkViewed,
  onUnmarkViewed,
}: {
  file: GalleryFile;
  isSelected: boolean;
  onOpen: () => void;
  onDelete?: (id: string) => void;
  onRename?: (id: string, name: string) => void;
  onToggleRequired?: (id: string, required: boolean) => void;
  onMarkViewed?: (id: string) => void;
  onUnmarkViewed?: (id: string) => void;
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
        {file.required && !onToggleRequired && (
          <span className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-semibold',
            file.viewed ? 'bg-sage/20 text-sage' : 'bg-coral/15 text-coral'
          )}>
            {file.viewed ? 'חובה — נצפה ✓' : 'חובה לצפייה'}
          </span>
        )}
      </button>
      {onMarkViewed && file.required && !file.viewed && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onMarkViewed(file.id);
          }}
          className="mt-1.5 w-full rounded-input border border-rule/30 bg-butter/30 py-1 text-[11px] font-semibold text-clay hover:bg-butter/50"
        >
          סימני שראית/קראת
        </button>
      )}
      {onUnmarkViewed && file.required && file.viewed && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onUnmarkViewed(file.id);
          }}
          className="mt-1.5 w-full rounded-input border border-rule/30 bg-sage/10 py-1 text-[11px] font-semibold text-sage hover:bg-sage/20"
        >
          ביטול סימון צפייה
        </button>
      )}
      {onToggleRequired && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleRequired(file.id, !file.required);
          }}
          className={cn(
            'absolute -top-2 start-14 rounded-full p-1 shadow-soft transition',
            file.required ? 'bg-clay text-sheet opacity-100' : 'bg-ink text-sheet opacity-0 group-hover:opacity-100'
          )}
          aria-label={file.required ? 'ביטול סימון חובה' : 'סימון כקובץ חובה'}
          title={file.required ? 'קובץ חובה — לחצי לביטול' : 'סימני כקובץ חובה לצפייה'}
        >
          <Star size={12} strokeWidth={2.5} fill={file.required ? 'currentColor' : 'none'} />
        </button>
      )}
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

function FilePreviewDialog({ file, onClose }: { file: GalleryFile | undefined; onClose: () => void }) {
  return (
    <Dialog open={Boolean(file)} onOpenChange={(open) => { if (!open) onClose(); }}>
      {file && <FilePreviewBody file={file} />}
    </Dialog>
  );
}

function FilePreviewBody({ file }: { file: GalleryFile }) {
  const ext = file.extension ?? '';
  const kind = getFileKindByExtension(ext);
  const isOffice = OFFICE_EXTENSIONS.has(ext);
  const isText = TEXT_EXTENSIONS.has(ext);
  const url = resolveFileUrl(file.url);
  const downloadUrl = `${url}${url.includes('?') ? '&' : '?'}dl=1`;

  return (
    <DialogContent size="full">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-rule px-5 py-3.5 pe-12">
        <div className="min-w-0">
          <DialogTitle className="truncate text-sm">{file.name}</DialogTitle>
          {file.sizeBytes && <p className="text-xs text-ink/50">{formatBytes(file.sizeBytes)}</p>}
        </div>
        <a
          href={downloadUrl}
          download={file.name}
          className="flex shrink-0 items-center gap-1.5 rounded-input bg-indigo px-3 py-1.5 text-xs font-semibold text-sheet hover:bg-indigo/90"
        >
          <Download size={12} /> הורדה
        </a>
      </div>

      {/* min-h-0 lets this row actually shrink inside the flex column, which is
          what allows the viewer to fill the remaining height instead of
          overflowing past the bottom of the screen. */}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-sheet p-3">
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
    </DialogContent>
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
    <pre dir="auto" className="h-full w-full overflow-auto whitespace-pre-wrap break-words rounded-sm border border-rule bg-ground/40 p-4 text-start text-xs text-ink">
      {content}
    </pre>
  );
}
