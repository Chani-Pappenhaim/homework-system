import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Values kept in the URL query (a search, a filter), so coming back to the page,
 * a refresh or a shared link shows the same results. An empty value leaves no
 * parameter behind, and a change replaces the history entry rather than adding
 * one, so "back" still leaves the page instead of undoing each keystroke.
 *
 * The returned setter applies several values in one step: setting them one by
 * one in the same handler would let the last call overwrite the others.
 */
export function useQueryParams(): [URLSearchParams, (patch: Record<string, string>) => void] {
  const [searchParams, setSearchParams] = useSearchParams();

  const setParams = useCallback((patch: Record<string, string>) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      for (const [name, value] of Object.entries(patch)) {
        if (value) params.set(name, value);
        else params.delete(name);
      }
      return params;
    }, { replace: true });
  }, [setSearchParams]);

  return [searchParams, setParams];
}

/** A single value kept in the URL query; empty when the parameter is absent. */
export function useQueryParam(name: string): [string, (value: string) => void] {
  const [searchParams, setParams] = useQueryParams();
  const setValue = useCallback((value: string) => setParams({ [name]: value }), [setParams, name]);
  return [searchParams.get(name) ?? '', setValue];
}
