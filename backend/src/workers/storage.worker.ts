import { Worker } from 'bullmq';
import { cloudinary } from '../config/cloudinary';
import { connection, emailQueue } from '../config/redis';

const storageWorker = new Worker(
  'storage-monitor',
  async () => {
    const usage = await cloudinary.api.usage();
    const percent = (usage.storage.used_bytes / usage.storage.limit) * 100;

    if (percent >= 80) {
      const alreadySent = await connection.get('storage_alert_sent');
      if (!alreadySent) {
        console.warn(`⚠️ Cloudinary storage at ${percent.toFixed(1)}%`);
        await emailQueue.add('storage-alert', {
          email: process.env.ADMIN_EMAIL,
          name: 'מורה',
        });
        await connection.setex('storage_alert_sent', 24 * 60 * 60, '1');
      }
    }
  },
  { connection }
);

storageWorker.on('error', (err) => console.error('[storage] worker error:', err));
storageWorker.on('failed', (job, err) =>
  console.error(`[storage] job ${job?.id} failed:`, err.message)
);
