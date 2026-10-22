import { AppError } from '../utils/errors';

export const MAX_NOTE = 500;
export const MAX_TITLE = 200;
export const MAX_ROWS = 5000;

/** A calendar day as UTC midnight — the same shape the lesson form stores. */
export function utcDay(y: number, m: number, d: number): Date | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date;
}

/**
 * Reads a day from a request body or a spreadsheet cell: a Date, an Excel
 * serial number, "YYYY-MM-DD", or the Israeli "D/M/YYYY" (also with . or -).
 */
export function parseDay(value: unknown): Date | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return utcDay(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    const ms = Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000;
    return parseDay(new Date(ms));
  }
  if (typeof value !== 'string') return null;
  const s = value.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/);
  if (m) return utcDay(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
  if (m) return utcDay(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  return null;
}

export const dayKey = (d: Date) => d.toISOString().slice(0, 10);
