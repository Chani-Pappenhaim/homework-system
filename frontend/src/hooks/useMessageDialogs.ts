import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Which conversation is open, and whether the new-message dialog is, live in
 * the URL (?highlight=<id> — the link the notification emails use — and
 * ?compose=1), not in component state. So closing a conversation really closes
 * it (a refresh no longer reopens the one the email linked to), every other
 * conversation has its own address, and Back closes the dialog.
 */
export function useMessageDialogs() {
  const [params, setParams] = useSearchParams();
  const openId = params.get('highlight');
  const composeOpen = params.get('compose') === '1';

  const update = useCallback(
    (change: (next: URLSearchParams) => void, replace = false) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        change(next);
        return next;
      }, { replace }),
    [setParams],
  );

  const openConversation = useCallback(
    (id: string) => update((p) => { p.set('highlight', id); p.delete('compose'); }, Boolean(openId)),
    [update, openId],
  );
  const closeConversation = useCallback(() => update((p) => p.delete('highlight'), true), [update]);
  const setComposeOpen = useCallback(
    (open: boolean) => update((p) => {
      if (open) { p.set('compose', '1'); p.delete('highlight'); } else p.delete('compose');
    }, !open),
    [update],
  );

  return { openId, composeOpen, openConversation, closeConversation, setComposeOpen };
}
