import { cloudinary } from '../config/cloudinary';
import { sharedConnection } from '../infrastructure/redis/connection';
import { emailQueue } from '../infrastructure/queues/queues';

export async function runStorageCheck(): Promise<void> {
  const usage = await cloudinary.api.usage();
  // See ai-usage.service.ts's getStorageUsage for why: `storage.usage` (not
  // `used_bytes`) holds the bytes, and credit-based plans expose their quota
  // only via `credits.used_percent`, not a storage-specific `storage.limit`.
  const usedBytes = usage.storage?.usage ?? usage.storage?.used_bytes ?? 0;
  const BYTES_PER_CREDIT = 1024 ** 3; // 1 credit ≈ 1 GB
  const limitBytes = usage.storage?.limit ?? (usage.credits?.limit ? usage.credits.limit * BYTES_PER_CREDIT : 0);
  const percent = usage.credits?.used_percent ?? (limitBytes > 0 ? (usedBytes / limitBytes) * 100 : 0);

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
