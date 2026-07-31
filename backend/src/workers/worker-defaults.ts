import type { WorkerOptions } from 'bullmq';

// Upstash bills per Redis command. BullMQ's defaults are tuned for a busy
// queue: drainDelay (5s) makes an idle Worker long-poll for a job roughly
// every 5 seconds, and stalledInterval (30s) runs a stalled-job sweep on top
// of that — every idle worker generates commands nonstop, whether or not any
// jobs are ever added. For an app with near-zero job volume that idle
// polling, not real job processing, is the overwhelming majority of Redis
// traffic. None of these queues need sub-minute pickup latency, so both are
// relaxed here (~6x fewer poll commands, ~10x fewer stalled-check commands).
export const defaultWorkerOptions: Pick<WorkerOptions, 'drainDelay' | 'stalledInterval'> = {
  drainDelay: 30,
  stalledInterval: 5 * 60 * 1000,
};
