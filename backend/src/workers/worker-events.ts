import { Worker } from 'bullmq';

// Consistent lifecycle logging for every worker. An unhandled 'error' event on a
// Worker would crash the process, so attaching a listener is also a safety net.
// Only job ids and error messages are logged — never job payloads or secrets.
export function attachLifecycleLogging(worker: Worker, label: string): void {
  worker.on('completed', (job) => console.log(`[${label}] job ${job.id} completed`));
  worker.on('failed', (job, err) => console.error(`[${label}] job ${job?.id} failed:`, err.message));
  worker.on('error', (err) => console.error(`[${label}] worker error:`, err.message));
}
