import { useEffect, useRef } from 'react';

/**
 * Fills a form from loaded data, and again whenever the data changes - except
 * while she is editing: if the form no longer matches what was last loaded, a
 * refetch does not overwrite her typing. `resetKey` forces a fill (a dialog
 * opening, another record being picked).
 */
export function useSyncedForm<S, V extends object>(
  source: S | null | undefined,
  toValues: (source: S) => V,
  current: V,
  apply: (values: V) => void,
  resetKey?: unknown,
) {
  const loaded = useRef<S | null>(null);
  const lastKey = useRef<unknown>(undefined);

  useEffect(() => {
    if (source == null) {
      loaded.current = null;
      return;
    }
    const forced = loaded.current === null || lastKey.current !== resetKey;
    const untouched = forced || JSON.stringify(current) === JSON.stringify(toValues(loaded.current as S));
    loaded.current = source;
    lastKey.current = resetKey;
    if (untouched) apply(toValues(source));
    // Only a change of the data or the key may refill; `current` is read as of that moment.
  }, [source, resetKey]);
}
