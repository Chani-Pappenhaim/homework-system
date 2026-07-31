import { useState } from 'react';
import { Image, Video, FileText, Music, Archive, File as FileIcon, Download, X } from 'lucide-react';
import { cn, formatBytes } from '@/lib/utils';
import { getFileKind } from '@/lib/file-type';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

export interface GalleryFile {
  id: string;
  name: string;
  url: string;
  sizeBytes?: string | null;
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
  className?: string;
}

/**
 * A grid of file "cards" (thumbnail for images, icon otherwise) that open in
 * an in-page preview dialog instead of a new browser tab — a plain link list
 * doesn't communicate what's actually attached, and a new tab is jarring for
 * a quick look at a video or PDF. Falls back to a direct download for types
 * the browser can't render inline (zip/docx/etc).
 */
export function FileGallery({ files, onDelete, className }: FileGalleryProps) {
  const [preview, setPreview] = useState<GalleryFile | null>(null);

  if (files.length === 0) return null;

  return (
    <>
      <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4', className)}>
        {files.map((f) => (
          <FileTile key={f.id} file={f} onOpen={() => setPreview(f)} onDelete={onDelete} />
        ))}
      </div>
      <FilePreviewDialog file={preview} onClose={() => setPreview(null)} />
    </>
  );
}

function FileTile({ file, onOpen, onDelete }: { file: GalleryFile; onOpen: () => void; onDelete?: (id: string) => void }) {
  const kind = getFileKind(file.name);
  const Icon = KIND_ICON[kind];

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onOpen}
        className="lift flex w-full flex-col items-center gap-2 rounded-input border border-rule bg-sheet p-3 text-center shadow-soft transition hover:bg-ground/40"
      >
        <div className="flex h-16 w-full items-center justify-center overflow-hidden rounded-sm bg-ground/50">
          {kind === 'image' ? (
            <img src={file.url} alt={file.name} className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <Icon size={26} className="text-ink/50" />
          )}
        </div>
        <p className="w-full truncate text-xs font-medium text-ink" title={file.name}>{file.name}</p>
        {file.sizeBytes != null && (
          <p className="text-[10px] text-ink/40">{formatBytes(file.sizeBytes)}</p>
        )}
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(file.id); }}
          className="absolute -top-2 -start-2 rounded-full bg-coral p-1 text-sheet opacity-0 shadow-soft transition group-hover:opacity-100"
          aria-label="מחיקת קובץ"
        >
          <X size={12} strokeWidth={3} />
        </button>
      )}
    </div>
  );
}

function FilePreviewDialog({ file, onClose }: { file: GalleryFile | null; onClose: () => void }) {
  const kind = file ? getFileKind(file.name) : 'other';

  return (
    <Dialog open={!!file} onOpenChange={(open) => { if (!open) onClose(); }}>
      {file && (
        <DialogContent size="lg" className="max-h-[85vh]">
          <div className="flex items-center justify-between gap-3 border-b border-rule px-5 py-3.5 pe-12">
            <DialogTitle className="truncate">{file.name}</DialogTitle>
            <a
              href={file.url}
              download={file.name}
              className="flex shrink-0 items-center gap-1 rounded-input border border-rule px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-ground/60"
            >
              <Download size={12} /> הורדה
            </a>
          </div>
          <div className="flex items-center justify-center overflow-auto p-4">
            {kind === 'image' && (
              <img src={file.url} alt={file.name} className="max-h-[70vh] max-w-full rounded-sm object-contain" />
            )}
            {kind === 'video' && (
              <video src={file.url} controls autoPlay className="max-h-[70vh] max-w-full rounded-sm" />
            )}
            {kind === 'audio' && <audio src={file.url} controls className="w-full" />}
            {kind === 'pdf' && (
              <iframe src={file.url} title={file.name} className="h-[70vh] w-full rounded-sm border border-rule" />
            )}
            {(kind === 'doc' || kind === 'archive' || kind === 'other') && (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <FileText size={40} className="text-ink/40" />
                <p className="text-sm text-ink/70">אין תצוגה מקדימה זמינה לסוג קובץ זה</p>
                <a
                  href={file.url}
                  download={file.name}
                  className="lift rounded-input bg-ink px-4 py-2 text-sm font-semibold text-sheet shadow-soft"
                >
                  הורדת הקובץ
                </a>
              </div>
            )}
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
