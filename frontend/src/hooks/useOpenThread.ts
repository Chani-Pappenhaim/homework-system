import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { messagesApi } from '@/api/messages.api';
import { unwrap } from '@/lib/api-utils';
import type { MessageDetailDTO } from '@/types';

export const threadQueryKey = (id: string | null) => ['message-thread', id] as const;

/**
 * The thread that is open: loads it, and marks what it has new as read — also
 * when a new entry arrives while it is open. Once per newest unread entry, so a
 * refetch before the mark lands doesn't resend it.
 */
export function useOpenThread(openId: string | null, markRead: (id: string) => void) {
  const { data, isError } = useQuery({
    queryKey: threadQueryKey(openId),
    queryFn: () => messagesApi.getThread(openId!),
    enabled: Boolean(openId),
    refetchInterval: 15_000,
    retry: false,
  });
  const thread: MessageDetailDTO | null = openId ? unwrap(data)?.message ?? null : null;

  const markedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!thread) { markedRef.current = null; return; }
    const newest = thread.entries.filter((e) => !e.mine && !e.isRead).at(-1);
    if (!newest) return;
    const mark = `${thread.id}:${newest.id}`;
    if (markedRef.current === mark) return;
    markedRef.current = mark;
    markRead(thread.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread]);

  return { thread, notFound: isError };
}

/** Puts an emoji on an entry or takes it off, and shows the result at once. */
export function useToggleReaction(threadId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, emoji }: { entryId: string; emoji: string }) =>
      messagesApi.toggleReaction(threadId!, entryId, emoji),
    onSuccess: (res, { entryId }) => {
      const reactions = res.data.data.reactions;
      qc.setQueryData(threadQueryKey(threadId), (old: { data: { data: { message: MessageDetailDTO } } } | undefined) => {
        if (!old) return old;
        const message = old.data.data.message;
        const entries = message.entries.map((e) => (e.id === entryId ? { ...e, reactions } : e));
        return { ...old, data: { ...old.data, data: { message: { ...message, entries } } } };
      });
    },
  });
}
