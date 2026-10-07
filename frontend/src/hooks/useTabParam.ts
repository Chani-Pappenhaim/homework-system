import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * A tab selection kept in the URL (`?tab=files`), so a refresh or a shared link
 * opens the same tab instead of falling back to the first one. The default tab
 * leaves no parameter behind, and switching tabs replaces the history entry
 * rather than adding one, so "back" still leaves the page.
 */
export function useTabParam<T extends string>(tabs: readonly T[], fallback: T): [T, (tab: T) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('tab');
  const tab = tabs.includes(raw as T) ? (raw as T) : fallback;

  const setTab = useCallback((next: T) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next === fallback) params.delete('tab');
      else params.set('tab', next);
      return params;
    }, { replace: true });
  }, [setSearchParams, fallback]);

  return [tab, setTab];
}
