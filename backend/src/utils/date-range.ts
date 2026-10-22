import { AppError } from './errors';

/** The days a report or an export covers, as "YYYY-MM-DD"; either end may be left open. */
export type DayRange = { from?: string; to?: string };

const DAY_MS = 86_400_000;

function isoDay(value: string, label: string): Date {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  if (!date || date.getUTCMonth() !== +m![2] - 1 || date.getUTCDate() !== +m![3]) {
    throw new AppError(`Invalid ${label} date`, `${label === 'from' ? 'תאריך ההתחלה' : 'תאריך הסיום'} אינו תקין`, 400);
  }
  return date;
}

/**
 * A date condition for the days in the range, both ends included; undefined
 * when the range is open on both sides.
 */
export function dayRangeWhere(range: DayRange): { gte?: Date; lt?: Date } | undefined {
  const from = range.from ? isoDay(range.from, 'from') : undefined;
  const to = range.to ? isoDay(range.to, 'to') : undefined;
  if (from && to && from > to) throw new AppError('Range ends before it starts', 'תאריך ההתחלה מאוחר מתאריך הסיום', 400);
  if (!from && !to) return undefined;
  return { ...(from && { gte: from }), ...(to && { lt: new Date(to.getTime() + DAY_MS) }) };
}

/** Reads the range from a request's query string. */
export function dayRangeQuery(query: Record<string, unknown>): DayRange {
  const day = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  return { from: day(query.from), to: day(query.to) };
}
