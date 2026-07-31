import { cloudinary } from '../config/cloudinary';
import { sharedConnection } from '../infrastructure/redis/connection';
import { emailQueue } from '../infrastructure/queues/queues';

// Same logic that used to run inside a BullMQ 'storage-monitor' Worker driven
// by a repeatable job — see scheduled-tasks.ts for why this is now a plain
// interval instead.
export async function runStorageCheck(): Promise<void> {
  const usage = await cloudinary.api.usage();
  const percent = (usage.storage.used_bytes / usage.storage.limit) * 100;

  if (percent >= 80) {
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
}
