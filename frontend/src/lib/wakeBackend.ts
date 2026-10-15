import { API_URL } from '@/lib/config';

// A spun-down free-tier backend (Render) takes up to a minute or more to cold
// start. Waits until /health answers (no auth, no DB) or the deadline passes.
const WAKE_DEADLINE = 120_000;
const RETRY_DELAY = 1500;
// Render spins down after ~15 idle minutes; trust a recent answer for less.
const AWAKE_FOR = 5 * 60_000;

let pending: Promise<void> | null = null;
let awakeAt = 0;

/**
 * Resolves once the backend answers, or gives up silently at the deadline so
 * the caller's own request still runs and reports its own error. Concurrent
 * callers share one wake-up; right after the backend answered it resolves at once.
 */
export function wakeBackend(): Promise<void> {
  if (Date.now() - awakeAt < AWAKE_FOR) return Promise.resolve();
  if (!pending) {
    pending = (async () => {
      const deadline = Date.now() + WAKE_DEADLINE;
      while (Date.now() < deadline) {
        try {
          const res = await fetch(`${API_URL}/health`);
          if (res.ok) { awakeAt = Date.now(); return; }
        } catch {
          // still asleep / spinning up — retry until the deadline
        }
        await new Promise((r) => setTimeout(r, RETRY_DELAY));
      }
    })().finally(() => { pending = null; });
  }
  return pending;
}
