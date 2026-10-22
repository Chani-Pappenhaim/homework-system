import { useState } from 'react';
import { Image, Video, FileText, Music, Archive, File as FileIcon, FileCode, Pencil, X, Star, EyeOff, Eye } from 'lucide-react';
import { cn, formatBytes } from '@/lib/utils';
import { getFileKindByExtension } from '@/lib/file-type';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { type FileSource } from '@/api/files.api';
import { FilePreviewDialog, resolveFileUrl, type GalleryFile } from '@/components/ui/file-preview';

// Kept importable from here for existing callers.
export { withPreviewPolicy, parseCsv } from '@/components/ui/file-preview';
export type { GalleryFile };

const KIND_ICON: Record<string, typeof FileIcon> = {
  image: Image,
  video: Video,
  pdf: FileText,
  audio: Music,
  archive: Archive,
  doc: FileText,
  html: FileCode,
  other: FileIcon,
};

interface FileGalleryProps {
  files: GalleryFile[];
  /** Whether these are a lesson's or a course's files — the API addresses them separately. */
  source: FileSource;
  onDelete?: (fileId: string) => void;
  onRename?: (fileId: string, name: string) => void;
  /** Teacher-only — toggles whether a file is mandatory viewing for students. */
  onToggleRequired?: (fileId: string, required: boolean) => void;
  /** Teacher-only — hides a file from students without deleting it. */
  onToggleHidden?: (fileId: string, hidden: boolean) => void;
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
export function FileGallery({ files, source, onDelete, onRename, onToggleRequired, onToggleHidden, onMarkViewed, onUnmarkViewed, className }: FileGalleryProps) {
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
            onToggleHidden={onToggleHidden}
            onMarkViewed={onMarkViewed}
            onUnmarkViewed={onUnmarkViewed}
          />
        ))}
      </div>

      <FilePreviewDialog file={selected} source={source} onClose={() => setSelectedId(null)} />
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
  onToggleHidden,
  onMarkViewed,
  onUnmarkViewed,
}: {
  file: GalleryFile;
  isSelected: boolean;
  onOpen: () => void;
  onDelete?: (id: string) => void;
  onRename?: (id: string, name: string) => void;
  onToggleRequired?: (id: string, required: boolean) => void;
  onToggleHidden?: (id: string, hidden: boolean) => void;
  onMarkViewed?: (id: string) => void;
  onUnmarkViewed?: (id: string) => void;
}) {
  const kind = getFileKindByExtension(file.extension ?? '');
  const Icon = KIND_ICON[kind];
  const url = resolveFileUrl(file.url);

  // null = the rename dialog is closed
  const [renameDraft, setRenameDraft] = useState<string | null>(null);

  const handleRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRenameDraft(file.name);
  };

  const submitRename = () => {
    const name = renameDraft?.trim();
    if (name && name !== file.name) onRename?.(file.id, name);
    setRenameDraft(null);
  };

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'lift flex w-full flex-col items-center gap-2 rounded-input border-2 bg-sheet p-3 text-center shadow-soft transition hover:bg-ground/40',
          isSelected ? 'border-indigo' : 'border-rule',
          file.hidden && 'border-dashed opacity-60'
        )}
      >
        <div className="flex h-24 w-full items-center justify-center overflow-hidden rounded-sm bg-ground/50">
          {kind === 'image' ? (
            <img src={url} alt={file.name} className="h-full w-full object-cover" loading="lazy" />
          ) : kind === 'audio' ? (
            <audio src={url} className="w-full" controls />
          ) : kind === 'video' ? (
            <video src={url} preload="metadata" className="h-full w-full object-cover" />
          ) : (
            // No <iframe> thumbnails: a browser that can't render a type inline
            // (a PDF with the built-in viewer turned off, say) downloads it the
            // moment the frame loads — which is what made files download on
            // their own when a lesson page opened.
            <div className="flex flex-col items-center gap-1">
              <Icon size={26} className="text-ink/50" />
              {file.extension && <span className="text-[10px] font-semibold uppercase text-ink/40">{file.extension}</span>}
            </div>
          )}
        </div>
        <p className="w-full truncate text-xs font-medium text-ink" title={file.name}>
          {file.name}
        </p>
        {file.sizeBytes != null && <p className="text-[10px] text-ink/40">{formatBytes(file.sizeBytes)}</p>}
        {file.hidden && (
          <span className="rounded-full bg-ink/10 px-2 py-0.5 text-[10px] font-semibold text-ink/60">מוסתר מהתלמידות</span>
        )}
        {file.required && !onToggleRequired && (
          <span className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-semibold',
            file.viewed ? 'bg-sage/20 text-sage' : 'bg-coral/15 text-coral'
          )}>
            {file.viewed ? 'חובה - נצפה ✓' : 'חובה לצפייה'}
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
          title={file.required ? 'קובץ חובה - לחצי לביטול' : 'סימני כקובץ חובה לצפייה'}
        >
          <Star size={12} strokeWidth={2.5} fill={file.required ? 'currentColor' : 'none'} />
        </button>
      )}
      {onToggleHidden && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleHidden(file.id, !file.hidden);
          }}
          className={cn(
            'absolute -top-2 start-[5.5rem] rounded-full p-1 shadow-soft transition',
            file.hidden ? 'bg-ink/70 text-sheet opacity-100' : 'bg-ink text-sheet opacity-0 group-hover:opacity-100'
          )}
          aria-label={file.hidden ? 'הצגת הקובץ לתלמידות' : 'הסתרת הקובץ מהתלמידות'}
          title={file.hidden ? 'מוסתר - לחצי כדי להציג לתלמידות' : 'הסתרה מהתלמידות (בלי למחוק)'}
        >
          {file.hidden ? <EyeOff size={12} strokeWidth={2.5} /> : <Eye size={12} strokeWidth={2.5} />}
        </button>
      )}
      {onRename && (
        <button
          type="button"
          onClick={handleRename}
          className="absolute -top-2 start-6 rounded-full bg-ink p-1 text-sheet opacity-0 shadow-soft transition group-hover:opacity-100"
          aria-label="שינוי שם קובץ"
          title="שינוי שם קובץ"
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
      <Dialog open={renameDraft !== null} onOpenChange={(open) => { if (!open) setRenameDraft(null); }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>שינוי שם קובץ</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <form id={`rename-${file.id}`} onSubmit={(e) => {
              // Portal events still bubble through the React tree, e.g. into a surrounding course form
              e.preventDefault(); e.stopPropagation(); submitRename();
            }}>
              <Input label="שם חדש לקובץ" value={renameDraft ?? ''} onChange={(e) => setRenameDraft(e.target.value)} autoFocus />
            </form>
          </DialogBody>
          <DialogFooter>
            <Button type="submit" form={`rename-${file.id}`} disabled={!renameDraft?.trim()}>שמירה</Button>
            <Button variant="outline" onClick={() => setRenameDraft(null)}>ביטול</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
