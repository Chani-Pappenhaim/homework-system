import IORedis, { RedisOptions } from 'ioredis';

// A missing REDIS_URL is a hard configuration error — fail fast and loud rather
// than silently falling back to localhost (which would "work" in dev and break
// in production). The URL itself is never logged, only that it is missing.
const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  throw new Error('REDIS_URL is not set — configure it before starting the app');
}

// BullMQ requires maxRetriesPerRequest: null on the connections it uses. Passing
// the full URL to ioredis preserves username, password, db and TLS — a rediss://
// URL enables TLS automatically, so we never disable certificate verification.
const baseOptions: RedisOptions = { maxRetriesPerRequest: null };

let created = 0;

/**
 * Create a fresh Redis connection. BullMQ wants its own connection per Worker
 * (workers issue blocking commands), so producers share one connection while
 * each Worker gets its own via this factory. Secrets are never printed — only a
 * stable index so multiple connections can be told apart in the logs.
 */
export function createRedisConnection(label = 'redis'): IORedis {
  const id = `${label}#${++created}`;
  const conn = new IORedis(REDIS_URL as string, baseOptions);

  conn.on('connect', () => console.log(`[redis:${id}] connect`));
  conn.on('ready', () => console.log(`[redis:${id}] ready`));
  conn.on('error', (err) => console.error(`[redis:${id}] error:`, err.message));
  conn.on('close', () => console.warn(`[redis:${id}] close`));

  return conn;
}

// Shared connection for queue producers and for the non-blocking dedup key
// operations (get/setex) in the deadline and storage workers.
export const sharedConnection = createRedisConnection('shared');

export async function closeSharedConnection(): Promise<void> {
  await sharedConnection.quit().catch(() => sharedConnection.disconnect());
}
