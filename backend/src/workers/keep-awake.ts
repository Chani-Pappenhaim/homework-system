/**
 * Keeps a free-tier Render instance from spinning down during active hours.
 *
 * Render sleeps a web service after ~15 minutes without inbound traffic. A
 * request to the service's own public URL leaves and re-enters through Render's
 * proxy, so it counts as inbound traffic. GitHub's scheduled workflow
 * (keep-alive.yml) was meant to do this but GitHub runs it only every few
 * hours, so the instance slept and the next visitor's request timed out.
 *
 * Outside the active hours nothing pings, so the instance sleeps (nights and
 * Shabbat), keeping usage well under Render's 750 free hours a month. A
 * sleeping instance can't wake itself — the first visitor after a gap still
 * starts it, and the pings take over from there.
 */

export const KEEP_AWAKE_INTERVAL_MS = 10 * 60 * 1000;
const PING_TIMEOUT_MS = 30 * 1000;
const TIME_ZONE = 'Asia/Jerusalem';

/** Minutes since midnight and day of week (0 = Sunday) in Israel time. */
function israelClock(date: Date): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { day, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

const at = (h: number, m = 0) => h * 60 + m;

/**
 * Whether a ping at this moment is wanted. A ping keeps the instance up for
 * another ~15 minutes, so the Friday window ends early enough that it is
 * asleep by 16:00, and the Saturday window opens at 20:30 after Shabbat.
 */
export function isActiveHours(date: Date): boolean {
  const { day, minutes } = israelClock(date);
  if (day >= 0 && day <= 4) return minutes >= at(6) && minutes < at(23);
  if (day === 5) return minutes >= at(6) && minutes < at(15, 30);
  return minutes >= at(20, 30) && minutes < at(23);
}

/** Pings the service's own public health URL if it is within active hours. */
export async function pingSelf(baseUrl: string, now: Date = new Date()): Promise<boolean> {
  if (!isActiveHours(now)) return false;
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/health`, {
    signal: AbortSignal.timeout(PING_TIMEOUT_MS),
  });
  return res.ok;
}

/** Render sets RENDER_EXTERNAL_URL on its web services; anywhere else there is nothing to keep awake. */
export function keepAwakeUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  return env.RENDER_EXTERNAL_URL?.trim() || null;
}
