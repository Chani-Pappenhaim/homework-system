import { sharedConnection } from '../infrastructure/redis/connection';

/**
 * State of the free Gemini tier, shared through Redis so the API and worker
 * processes agree on it: whether today's free quota is spent, and the daily
 * request limit Google reported when it ran out.
 *
 * Every helper fails open: when Redis is unreachable the caller just tries the
 * free tier first, which costs one extra request and never blocks the AI.
 */

// Google resets the free tier's daily quota at midnight Pacific time.
const QUOTA_TIME_ZONE = 'America/Los_Angeles';

// Present while the free daily quota is spent; holds the reset time and expires at it.
const EXHAUSTED_KEY = 'gemini:free-exhausted-until';
// Present while the next recheck of a spent free tier is not yet due.
const RECHECK_KEY = 'gemini:free-recheck-wait';
// The daily request limit Google named in its last daily-quota error.
const DAILY_LIMIT_KEY = 'gemini:free-daily-limit';

// While the free tier is marked spent, one call per interval tries it again, in
// case the quota came back early or the error was misread.
const RECHECK_INTERVAL_MS = 30 * 60_000;
const DAILY_LIMIT_TTL_SECONDS = 30 * 24 * 60 * 60;
const REDIS_TIMEOUT_MS = 1_000;

const zoneFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: QUOTA_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});

function zoneParts(at: number): Record<string, number> {
  const parts: Record<string, number> = {};
  for (const { type, value } of zoneFormat.formatToParts(at)) {
    if (type !== 'literal') parts[type] = Number(value);
  }
  return parts;
}

/** Pacific wall-clock time minus UTC at the instant `at`, in ms. */
function zoneOffset(at: number): number {
  const p = zoneParts(at);
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return wall - Math.floor(at / 1000) * 1000;
}

/** The instant a Pacific calendar day starts; `day` may overflow into the next month. */
function pacificMidnight(year: number, month: number, day: number): Date {
  const wall = Date.UTC(year, month - 1, day);
  // The offset depends on the instant itself (daylight saving), so refine once.
  return new Date(wall - zoneOffset(wall - zoneOffset(wall)));
}

/** When the free tier's current quota day began. */
export function freeQuotaDayStart(now = new Date()): Date {
  const p = zoneParts(now.getTime());
  return pacificMidnight(p.year, p.month, p.day);
}

/** When the free tier's daily quota next resets. */
export function nextFreeQuotaReset(now = new Date()): Date {
  const p = zoneParts(now.getTime());
  return pacificMidnight(p.year, p.month, p.day + 1);
}

/**
 * Runs one Redis command, giving up after REDIS_TIMEOUT_MS. The shared
 * connection retries forever while Redis is down, so without the timeout an AI
 * call would hang on it.
 */
async function withRedis<T>(what: string, fallback: T, op: () => Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      op(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${REDIS_TIMEOUT_MS}ms`)), REDIS_TIMEOUT_MS);
      }),
    ]);
  } catch (err) {
    console.warn(`[gemini-quota] ${what} failed: ${(err as Error)?.message ?? err}`);
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

/** When the spent free tier resets, or null while it has quota left. */
export async function freeTierExhaustedUntil(): Promise<Date | null> {
  const value = await withRedis('read the free-tier state', null, () => sharedConnection.get(EXHAUSTED_KEY));
  return value ? new Date(value) : null;
}

/**
 * Where the next call should go when both keys are configured:
 * - 'free'    — the free tier has quota left;
 * - 'recheck' — the free tier is marked spent, but this call tries it again;
 * - 'paid'    — the free tier is spent, go straight to the paid key.
 */
export type FreeTierRoute = 'free' | 'recheck' | 'paid';

export async function routeFreeTier(): Promise<FreeTierRoute> {
  if (!(await freeTierExhaustedUntil())) return 'free';
  // SET NX: exactly one caller per interval wins the recheck.
  const won = await withRedis('claim a free-tier recheck', 'OK' as string | null, () =>
    sharedConnection.set(RECHECK_KEY, '1', 'PX', RECHECK_INTERVAL_MS, 'NX')
  );
  return won === 'OK' ? 'recheck' : 'paid';
}

/** Records that the free tier spent its daily quota; returns when it resets. */
export async function markFreeTierExhausted(dailyLimit?: number): Promise<Date> {
  const until = nextFreeQuotaReset();
  const ttl = Math.max(1, until.getTime() - Date.now());
  await withRedis('record the spent free tier', undefined, async () => {
    const tx = sharedConnection
      .multi()
      .set(EXHAUSTED_KEY, until.toISOString(), 'PX', ttl)
      .set(RECHECK_KEY, '1', 'PX', Math.min(RECHECK_INTERVAL_MS, ttl));
    if (dailyLimit) tx.set(DAILY_LIMIT_KEY, String(dailyLimit), 'EX', DAILY_LIMIT_TTL_SECONDS);
    await tx.exec();
  });
  return until;
}

/** Clears the spent mark once the free tier answers again. */
export async function markFreeTierAvailable(): Promise<void> {
  await withRedis('clear the free-tier state', 0, () => sharedConnection.del(EXHAUSTED_KEY, RECHECK_KEY));
}

/** The free tier's daily request limit as Google last reported it, if ever. */
export async function learnedFreeDailyLimit(): Promise<number | null> {
  const value = Number(await withRedis('read the daily limit', null, () => sharedConnection.get(DAILY_LIMIT_KEY)));
  return value > 0 ? value : null;
}
