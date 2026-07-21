import { Worker } from 'bullmq';
import type IORedis from 'ioredis';
import { cloudinary } from '../config/cloudinary';
import { sharedConnection } from '../infrastructure/redis/connection';
import { emailQueue } from '../infrastructure/queues/queues';
import type { StorageJobData } from '../infrastructure/queues/job-types';
import { attachLifecycleLogging } from './worker-events';

export function registerStorageWorker(connection: IORedis): Worker<StorageJobData> {
  const worker = new Worker<StorageJobData>(
    'storage-monitor',
    async () => {
      const usage = await cloudinary.api.usage();
      const percent = (usage.storage.used_bytes / usage.storage.limit) * 100;

      if (percent >= 80) {
        // Dedup on the shared (non-blocking) connection.
        const alreadySent = await sharedConnection.get('storage_alert_sent');
        if (!alreadySent) {
          console.warn(`⚠️ Cloudinary storage at ${percent.toFixed(1)}%`);
          await emailQueue.add('storage-alert', {
            email: process.env.ADMIN_EMAIL ?? '',
            name: 'מורה',
          });
          await sharedConnection.setex('storage_alert_sent', 24 * 60 * 60, '1');
        }
      }
    },
    { connection }
  );
  attachLifecycleLogging(worker, 'storage');
  return worker;
}
