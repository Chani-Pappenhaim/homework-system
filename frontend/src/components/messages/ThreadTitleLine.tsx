import { cn } from '@/lib/utils';
import { replyCountLabel, threadTitle } from '@/lib/messages';
import type { MessageDTO } from '@/types';

/**
 * The text of a list row: the subject in bold (or, without one, the newest
 * message in muted type), and how many replies the thread has.
 */
export function ThreadTitleLine({ msg }: { msg: Pick<MessageDTO, 'subject' | 'lastEntry' | 'replyCount' | 'unread'> }) {
  const title = threadTitle(msg);
  const replies = replyCountLabel(msg.replyCount);
  return (
    <div className="mt-1 flex min-w-0 items-baseline gap-2">
      <p
        className={cn(
          'truncate text-[13px]',
          title.isSubject ? cn('text-ink', msg.unread ? 'font-bold' : 'font-semibold') : 'text-ink-soft',
        )}
      >
        {title.text}
      </p>
      {replies && <span className="shrink-0 text-[11px] text-ink-soft">{replies}</span>}
    </div>
  );
}
