import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
import { ReactionBar } from '@/components/messages/ReactionBar';
import { cn, formatDateTime } from '@/lib/utils';
import type { MessageEntryDTO } from '@/types';

interface EntryCardProps {
  entry: MessageEntryDTO;
  /** Who wrote it, as the viewer should read it ("התגובה שלך", "רחל", ...). */
  label: string;
  /** Short note for an entry that only some of the thread sees ("רק למורה"). */
  privateNote?: string;
  onReact: (emoji: string) => void;
  /** Extra controls beside the label, e.g. unsend. */
  action?: ReactNode;
}

/** One entry of an open thread: who and when, the text, and its reactions. */
export function EntryCard({ entry, label, privateNote, onReact, action }: EntryCardProps) {
  return (
    <div className={cn(entry.fromTeacher && 'rounded-input border-r-2 border-indigo bg-ground/60 px-3 py-2')}>
      <div className="flex items-center justify-between gap-2">
        <div className="label mb-0.5 flex flex-wrap items-center gap-1.5">
          {entry.authorName && <Avatar name={entry.authorName} src={entry.authorAvatarUrl} size="sm" />}
          <span>{label} · {formatDateTime(entry.createdAt)}</span>
          {/* A message held for quiet hours carries its release time; the teacher sees it before the student does. */}
          {new Date(entry.createdAt).getTime() > Date.now() && <Badge variant="muted">מתוזמנת</Badge>}
          {entry.isPrivate && privateNote && (
            <Badge variant="muted"><Lock size={9} className="ml-1" /> {privateNote}</Badge>
          )}
        </div>
        {action}
      </div>
      <MarkdownRenderer
        content={entry.content}
        keepLineBreaks
        className={cn('break-words text-sm text-ink', !entry.fromTeacher && 'leading-relaxed')}
      />
      <ReactionBar reactions={entry.reactions} onToggle={onReact} />
    </div>
  );
}
