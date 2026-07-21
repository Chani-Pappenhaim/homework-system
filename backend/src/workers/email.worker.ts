import { Worker } from 'bullmq';
import type IORedis from 'ioredis';
import { handleEmailJob } from '../emails/email.service';
import type { EmailJobData, EmailJobName } from '../infrastructure/queues/job-types';
import { attachLifecycleLogging } from './worker-events';

// Thin worker: receive the job, delegate to the email service, let failures
// propagate so BullMQ can retry. All rendering/recipient logic lives in emails/.
export function registerEmailWorker(connection: IORedis): Worker<EmailJobData> {
  const worker = new Worker<EmailJobData>(
    'email',
    async (job) => {
      await handleEmailJob(job.name as EmailJobName, job.data);
    },
    { connection }
  );
  attachLifecycleLogging(worker, 'email');
  return worker;
}
