import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '-';
  return new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(date));
}

// ---------- Hebrew calendar ----------

const hebrewCalendar = new Intl.DateTimeFormat('he-IL-u-ca-hebrew-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' });

/** The Hebrew date, as written: ח׳ בחשוון תשפ״ז (without the year: ח׳ בחשוון). */
export function formatHebrewDate(date: string | Date, { year = true } = {}): string {
  const parts = hebrewCalendar.formatToParts(new Date(date));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const dayMonth = `${toGematria(Number(part('day')))} ב${part('month')}`;
  return year ? `${dayMonth} ${toGematria(Number(part('year')))}` : dayMonth;
}

const WEEKDAYS = ['יום א׳', 'יום ב׳', 'יום ג׳', 'יום ד׳', 'יום ה׳', 'יום ו׳', 'שבת'];

/** יום ב׳ */
export function formatWeekday(date: string | Date): string {
  return WEEKDAYS[new Date(date).getDay()];
}

/** A lesson date or a deadline in full: יום ב׳, 19 באוקטובר 2026 · ח׳ בחשוון תשפ״ז */
export function formatDateFull(date: string | Date | null | undefined): string {
  if (!date) return '-';
  return `${formatWeekday(date)}, ${formatDate(date)} · ${formatHebrewDate(date)}`;
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '-';
  return new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(date));
}

export function isOverdue(deadline: string | Date | null | undefined): boolean {
  if (!deadline) return false;
  return new Date(deadline) < new Date();
}

// Teachers often type "github.com/..." without a scheme. Without one the browser
// treats the href as a relative path and navigates inside the app instead of out.
export function toExternalUrl(url: string | null | undefined): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^\/\//.test(trimmed)) return `https:${trimmed}`;
  return `https://${trimmed.replace(/^\/+/, '')}`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const GEMATRIA: [number, string][] = [
  [400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק'],
  [90, 'צ'], [80, 'פ'], [70, 'ע'], [60, 'ס'], [50, 'נ'], [40, 'מ'], [30, 'ל'], [20, 'כ'], [10, 'י'],
  [9, 'ט'], [8, 'ח'], [7, 'ז'], [6, 'ו'], [5, 'ה'], [4, 'ד'], [3, 'ג'], [2, 'ב'], [1, 'א'],
];

/**
 * Writes a number in Hebrew letters the way dates are written (15 → ט״ו,
 * 5787 → תשפ״ז): thousands are dropped, 15/16 avoid spelling a divine name,
 * and a gershayim/geresh marks the result as a number.
 */
export function toGematria(n: number): string {
  let rest = n % 1000;
  let letters = '';
  for (const [value, letter] of GEMATRIA) {
    while (rest >= value) {
      if (rest === 15 || rest === 16) {
        letters += rest === 15 ? 'טו' : 'טז';
        rest = 0;
        break;
      }
      letters += letter;
      rest -= value;
    }
  }
  return letters.length === 1 ? `${letters}׳` : `${letters.slice(0, -1)}״${letters.slice(-1)}`;
}

// The Hebrew calendar is built into Intl (no library needed) — used as a small
// helper caption next to date pickers so a teacher scheduling around a Hebrew
// date (e.g. a Chag) can see both calendars at a glance. Intl writes the day
// and year as digits, so they are re-written in Hebrew letters.
export function toHebrewDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '';
  try {
    return formatHebrewDate(new Date(`${isoDate}T00:00:00`));
  } catch {
    return '';
  }
}

export function formatBytes(bytes: number | bigint | string | null | undefined): string {
  if (!bytes) return '0 B';
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * A group's full name as the teacher refers to it — seminar, class and year
 * together ("סמינר מאיר יד תשפ״ז"). The parts are stored apart so each stays
 * editable; older groups without a seminar simply drop that part.
 */
/** Markdown reduced to plain text, for one-line previews of a longer text. */
export function markdownToPlainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/[*_~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function groupDisplayName(group: { name: string; seminar?: string | null; year?: string | null }): string {
  return [group.seminar, group.name, group.year].map((part) => part?.trim()).filter(Boolean).join(' ');
}
