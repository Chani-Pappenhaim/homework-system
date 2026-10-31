import { useEffect } from 'react';

/**
 * Asks search engines not to index the signed-in area while it is mounted;
 * the public pages (login) never mount it and so stay indexable.
 */
export function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
}
