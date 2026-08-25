import { runDeadlineCheck } from './deadline-check';
import { runStorageCheck } from './storage-check';

// A deadline report summarises a deadline that has already passed, so checking
// more than once an hour buys nothing — it only multiplies the Redis lookups
// in runDeadlineCheck.
const DEADLINE_INTERVAL_MS = 60 * 60 * 1000;
const STORAGE_INTERVAL_MS = 60 * 60 * 1000;

export interface ScheduledTaskHandles {
  intervals: NodeJS.Timeout[];
}

/**
 * deadline-check and storage-monitor have no external trigger — nothing needs
 * to enqueue them or track retries. Routing a purely self-scheduled periodic
 * task through a full BullMQ Queue + Worker pair costs a dedicated blocking
 * Redis connection plus constant idle polling and stalled-job checks. A plain
 * setInterval gets the same cadence and behavior without that always-on
 * Redis traffic.
 */
export function startScheduledTasks(): ScheduledTaskHandles {
  const runSafely = (label: string, task: () => Promise<void>) => {
    task().catch((err) => console.error(`[${label}] scheduled task error:`, err));
  };

  const intervals = [
    setInterval(() => runSafely('deadline', runDeadlineCheck), DEADLINE_INTERVAL_MS),
    setInterval(() => runSafely('storage', runStorageCheck), STORAGE_INTERVAL_MS),
  ];

  console.log('[workers] Scheduled tasks started (deadline-check, storage-monitor)');
  return { intervals };
}

export function stopScheduledTasks(handles: ScheduledTaskHandles): void {
  handles.intervals.forEach(clearInterval);
}
