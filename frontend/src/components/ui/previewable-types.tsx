import { useState } from 'react';
import { FileText, Image, Video, Music, Code, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DOWNLOAD_ONLY_NOTE, PREVIEWABLE_GROUPS, type PreviewableGroup } from '@/lib/file-type';

const ICONS: Record<PreviewableGroup['key'], LucideIcon> = {
  document: FileText,
  image: Image,
  video: Video,
  audio: Music,
  code: Code,
};

/**
 * Which file types open in place, as a row of group icons. Hovering shows a
 * group's types; tapping (touch screens have no hover) spells them out below.
 */
export function PreviewableTypes({ className }: { className?: string }) {
  const [open, setOpen] = useState<PreviewableGroup['key'] | null>(null);
  const openGroup = PREVIEWABLE_GROUPS.find((g) => g.key === open);

  return (
    <div className={cn('space-y-1 text-xs text-ink/50', className)}>
      <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1">
        <span>תצוגה מקדימה באתר:</span>
        {PREVIEWABLE_GROUPS.map((group) => {
          const Icon = ICONS[group.key];
          const active = open === group.key;
          return (
            <button
              key={group.key}
              type="button"
              title={group.detail}
              aria-expanded={active}
              // Inside a drop zone, a click would otherwise open the file picker.
              onClick={(e) => { e.stopPropagation(); setOpen(active ? null : group.key); }}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors',
                active ? 'bg-ground text-ink' : 'hover:bg-ground/70 hover:text-ink/80',
              )}
            >
              <Icon size={12} aria-hidden /> {group.label}
            </button>
          );
        })}
      </div>
      {openGroup && <p role="status">{openGroup.label}: {openGroup.detail}</p>}
      <p>{DOWNLOAD_ONLY_NOTE}</p>
    </div>
  );
}
