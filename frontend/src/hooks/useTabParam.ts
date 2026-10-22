import { useCallback } from 'react';
import { useQueryParam } from '@/hooks/useQueryParam';

/**
 * A tab selection kept in the URL (`?tab=files`), so a refresh or a shared link
 * opens the same tab instead of falling back to the first one. The default tab
 * leaves no parameter behind, and switching tabs replaces the history entry
 * rather than adding one, so "back" still leaves the page.
 */
export function useTabParam<T extends string>(tabs: readonly T[], fallback: T): [T, (tab: T) => void] {
  const [raw, setRaw] = useQueryParam('tab');
  const tab = tabs.includes(raw as T) ? (raw as T) : fallback;

  const setTab = useCallback((next: T) => setRaw(next === fallback ? '' : next), [setRaw, fallback]);

  return [tab, setTab];
}
