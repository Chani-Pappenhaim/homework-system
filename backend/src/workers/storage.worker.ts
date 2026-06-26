import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { cloudinary } from '../config/cloudinary';
import { connection, emailQueue } from './index';

const redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');

new Worker(
  'storage-monitor',
  async () => {
    const usage = await cloudinary.api.usage();
    const percent = (usage.storage.used_bytes / usage.storage.limit) * 100;

    if (percent >= 80) {
      const alreadySent = await redis.get('storage_alert_sent');
      if (!alreadySent) {
        console.warn(`⚠️ Cloudinary storage at ${percent.toFixed(1)}%`);
        await emailQueue.add('storage-alert', {
          email: process.env.ADMIN_EMAIL,
          name: 'מורה',
        });
        await redis.setex('storage_alert_sent', 24 * 60 * 60, '1');
      }
    }
  },
  { connection }
);
