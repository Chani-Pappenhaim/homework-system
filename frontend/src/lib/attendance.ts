import { Check, ShieldCheck, X, type LucideIcon } from 'lucide-react';
import type { AttendanceStatus } from '@/api/attendance.api';

/**
 * How each status looks everywhere. Each one has its own icon and word as well
 * as a colour, so it reads correctly for colour-blind users and in print.
 */
export const STATUS_META: Record<AttendanceStatus, { label: string; icon: LucideIcon; active: string; text: string }> = {
  PRESENT: { label: 'נוכחת', icon: Check, active: 'border-sage bg-sage text-sheet', text: 'text-sage' },
  ABSENT: { label: 'חסרה', icon: X, active: 'border-coral bg-coral text-sheet', text: 'text-coral' },
  EXCUSED: { label: 'מאושרת', icon: ShieldCheck, active: 'border-butter bg-butter text-ink', text: 'text-clay' },
};

export const STATUS_ORDER: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'EXCUSED'];

// Meetings are stored as a calendar day at UTC midnight, so they are always
// formatted in UTC — otherwise a browser west of Greenwich shows the day before.
const dayFormat = new Intl.DateTimeFormat('he-IL', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const fullFormat = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export const formatDay = (iso: string) => dayFormat.format(new Date(iso));
export const formatFullDay = (iso: string) => fullFormat.format(new Date(iso));
export const shortDay = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
/** The value a date input expects. */
export const dayValue = (iso: string) => iso.slice(0, 10);

/** Share of meetings attended out of those that counted; an excused absence doesn't count against. */
export function attendanceRate(present: number, absent: number): number | null {
  const counted = present + absent;
  return counted ? Math.round((present * 100) / counted) : null;
}

export function countStatuses(statuses: (AttendanceStatus | null | undefined)[]) {
  const counts = { PRESENT: 0, ABSENT: 0, EXCUSED: 0, none: 0 };
  for (const s of statuses) counts[s ?? 'none']++;
  return counts;
}
