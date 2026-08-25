import type { WorkerOptions } from 'bullmq';

// Upstash bills per Redis command, and these queues are idle almost all of the
// time, so command volume is dominated by workers waiting for work rather than
// doing it.
//
// A Worker waits with a blocking read whose timeout is `drainDelay`: when it
// expires the worker simply issues it again, and that re-issue is the entire
// cost. It is NOT a pickup delay — the blocking read returns the instant a job
// is added, so a longer drainDelay only makes the waiting cheaper, not slower
// to react. `stalledInterval` is a separate sweep for jobs whose worker died
// mid-run; at this volume a sweep every half hour is plenty.
export const defaultWorkerOptions: Pick<WorkerOptions, 'drainDelay' | 'stalledInterval'> = {
  drainDelay: 300,
  stalledInterval: 30 * 60 * 1000,
};
