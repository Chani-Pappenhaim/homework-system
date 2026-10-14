import { useQuery } from '@tanstack/react-query';
import { aiUsageApi, type AiAvailability } from '@/api/aiUsage.api';
import { unwrap } from '@/lib/api-utils';

export const AI_AVAILABILITY_QUERY_KEY = ['ai-availability'] as const;

const ISRAEL_TIME_ZONE = 'Asia/Jerusalem';

/** "היום אחרי 10:00" or "מחר אחרי 10:00", in Israel time. The reset is never further than a day away. */
export function formatResumeTime(iso: string, now = new Date()): string {
  const at = new Date(iso);
  const day = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: ISRAEL_TIME_ZONE });
  const time = at.toLocaleTimeString('en-GB', {
    timeZone: ISRAEL_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  return `${day(at) === day(now) ? 'היום' : 'מחר'} אחרי ${time}`;
}

/** The note shown in place of an AI button that cannot run now. */
export function aiUnavailableMessage(status: AiAvailability, now = new Date()): string {
  if (status.reason === 'daily-quota' && status.resumesAt) {
    return `המכסה היומית של ה-AI נגמרה. אפשר לנסות שוב ${formatResumeTime(status.resumesAt, now)}.`;
  }
  return 'שירות ה-AI אינו זמין כרגע.';
}

/**
 * Whether AI actions can run now, for the buttons that start one. A check that
 * is still loading or failed counts as available: the server refuses an action
 * it cannot run anyway, and a hiccup must not grey the buttons out.
 */
export function useAiAvailability(): { available: boolean; message: string | null } {
  const { data } = useQuery({
    queryKey: AI_AVAILABILITY_QUERY_KEY,
    queryFn: () => aiUsageApi.availability(),
    staleTime: 60_000,
    retry: false,
  });
  const status = unwrap(data);
  if (!status || status.available) return { available: true, message: null };
  // The quota reset while the page stayed open.
  if (status.resumesAt && new Date(status.resumesAt).getTime() <= Date.now()) return { available: true, message: null };
  return { available: false, message: aiUnavailableMessage(status) };
}
