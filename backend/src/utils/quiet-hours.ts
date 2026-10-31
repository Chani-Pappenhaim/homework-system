// Quiet hours: a daily window, in Israel time, during which notifications to
// students are held back until the window closes.

const TIME_ZONE = 'Asia/Jerusalem';
const MINUTES_PER_DAY = 24 * 60;
const MS_PER_MINUTE = 60 * 1000;

export interface QuietHours {
  /** Minutes past midnight Israel time at which the quiet window opens. */
  startMinute: number;
  /** Minutes past midnight Israel time at which held-back notifications are sent. */
  releaseMinute: number;
}

export const DEFAULT_QUIET_HOURS: QuietHours = { startMinute: 0, releaseMinute: 10 * 60 };

interface WallClock { year: number; month: number; day: number; minute: number }

const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
});

function wallClock(instant: Date): WallClock {
  const parts = formatter.formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), minute: get('hour') * 60 + get('minute') };
}

/** How far Israel time is ahead of UTC at this instant, in milliseconds. */
function offsetMs(instant: Date): number {
  const w = wallClock(instant);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, 0, w.minute);
  return asUtc - Math.floor(instant.getTime() / MS_PER_MINUTE) * MS_PER_MINUTE;
}

/**
 * The instant at which Israel's wall clock shows the given date and time. A
 * time skipped by the spring clock change lands just after the gap (02:30
 * becomes 03:30); a time that occurs twice in autumn gives its later occurrence.
 */
export function israelTimeToInstant(year: number, month: number, day: number, minute: number): Date {
  const naive = Date.UTC(year, month - 1, day, 0, minute);
  const first = naive - offsetMs(new Date(naive));
  return new Date(naive - offsetMs(new Date(first)));
}

function inWindow(minute: number, { startMinute, releaseMinute }: QuietHours): boolean {
  return startMinute < releaseMinute
    ? minute >= startMinute && minute < releaseMinute
    : minute >= startMinute || minute < releaseMinute;
}

/**
 * When a notification created at `now` should be sent: `now` itself outside
 * quiet hours, otherwise the next moment the window closes. The window opens
 * at its start minute and ends exactly at the release minute. Equal start and
 * release mean quiet hours are off.
 */
export function releaseTime(now: Date, quiet: QuietHours): Date {
  if (quiet.startMinute === quiet.releaseMinute) return now;
  const clock = wallClock(now);
  if (!inWindow(clock.minute, quiet)) return now;

  // A window that crosses midnight and has not yet passed it closes tomorrow.
  const closesTomorrow = quiet.startMinute > quiet.releaseMinute && clock.minute >= quiet.startMinute;
  const dayOffset = closesTomorrow ? 1 : 0;
  // Calendar arithmetic on the date alone, so DST never shifts the day.
  const date = new Date(Date.UTC(clock.year, clock.month - 1, clock.day + dayOffset));
  return israelTimeToInstant(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), quiet.releaseMinute);
}

/** Milliseconds a notification created at `now` waits before it is sent (0 outside quiet hours). */
export function quietDelayMs(now: Date, quiet: QuietHours): number {
  return releaseTime(now, quiet).getTime() - now.getTime();
}

export function isValidMinuteOfDay(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < MINUTES_PER_DAY;
}
