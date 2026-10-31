import type { MessageDTO } from '@/types';
import { markdownToPlainText } from '@/lib/utils';

/** "תגובה אחת" / "3 תגובות"; nothing when the thread has no replies. */
export function replyCountLabel(count: number): string | null {
  if (count <= 0) return null;
  return count === 1 ? 'תגובה אחת' : `${count} תגובות`;
}

/**
 * What a list row shows as the thread's title: its subject when it has one,
 * otherwise a muted stand-in made of the newest message.
 */
export function threadTitle(msg: Pick<MessageDTO, 'subject' | 'lastEntry'>): { text: string; isSubject: boolean } {
  if (msg.subject) return { text: msg.subject, isSubject: true };
  return { text: msg.lastEntry ? markdownToPlainText(msg.lastEntry.content) : '', isSubject: false };
}
