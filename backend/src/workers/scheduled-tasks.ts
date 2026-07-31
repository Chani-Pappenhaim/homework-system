import { runDeadlineCheck } from './deadline-check';
import { runStorageCheck } from './storage-check';

const DEADLINE_INTERVAL_MS = 15 * 60 * 1000;
const STORAGE_INTERVAL_MS = 60 * 60 * 1000;

export interface ScheduledTaskHandles {
  intervals: NodeJS.Timeout[];
}

/**
 * deadline-check and storage-monitor have no external trigger — the only
 * thing that ever ran them was their own BullMQ repeatable job. Routing a
 * purely self-scheduled periodic task through a full BullMQ Queue + Worker
 * pair costs a dedicated blocking Redis connection plus that Worker's
 * constant idle long-polling and stalled-job checks, on top of BullMQ's own
 * Redis-backed bookkeeping for the repeat schedule itself. A plain
 * setInterval gets the identical behavior (same cadence, same DB queries,
 * same emails enqueued) without any of that always-on Redis traffic.
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
