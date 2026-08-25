import type { WorkerOptions } from 'bullmq';

// Upstash bills per Redis command, and this app's queues are idle almost all of
// the time — so the cost is dominated by workers waiting for work, not by work.
//
// A Worker waits with a blocking read whose timeout is `drainDelay`: when it
// expires the worker simply issues it again. That re-issue is the entire cost.
// Crucially it is NOT a pickup delay — the blocking read returns the instant a
// job is added, so a longer drainDelay makes generation start no later, it only
// makes the waiting cheaper. `stalledInterval` is a separate sweep for jobs
// whose worker died mid-run; at this volume once every half hour is plenty.
//
// Per worker per day: 24h/300s = 288 waits + 48 sweeps, against 2,880 + 288
// before. Three workers cost roughly 1,000 commands a day instead of ~9,500 —
// the difference between comfortably inside Upstash's 500k/month free quota and
// exhausting it in a fortnight, which is exactly what happened on 2026-08-16.
export const defaultWorkerOptions: Pick<WorkerOptions, 'drainDelay' | 'stalledInterval'> = {
  drainDelay: 300,
  stalledInterval: 30 * 60 * 1000,
};
