import { useEffect, useState } from 'react';

const CHECK_EVERY_MS = 5 * 60 * 1000;

/** The version of the build the server currently serves, or null when it cannot be read. */
export async function fetchServerVersion(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const body = await res.json();
    return typeof body?.version === 'string' ? body.version : null;
  } catch {
    return null;
  }
}

/**
 * True once a newer build than the one running was deployed. Checked
 * periodically and whenever the tab becomes visible again, since a tab left
 * open for hours otherwise keeps running the old code until a manual refresh.
 */
export function useNewVersionAvailable(): boolean {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let stopped = false;
    async function check() {
      const server = await fetchServerVersion();
      if (!stopped && server && server !== __APP_VERSION__) setAvailable(true);
    }
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', onVisible);
    void check();
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return available;
}
