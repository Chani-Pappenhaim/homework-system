/** The days a report or an export covers, as "YYYY-MM-DD"; either end may be left open. */
export type DayRange = { from?: string; to?: string };

const shown = (day: string) => day.split('-').reverse().join('.');

/** The range as words for a file name, e.g. "01.10.2026 עד 31.10.2026"; '' when open on both sides. */
export function dayRangeLabel({ from, to }: DayRange): string {
  if (from && to) return `${shown(from)} עד ${shown(to)}`;
  if (from) return `מ-${shown(from)}`;
  if (to) return `עד ${shown(to)}`;
  return '';
}

/** Only the ends that were chosen, so an open range adds nothing to a request. */
export function dayRangeParams({ from, to }: DayRange): DayRange {
  return { ...(from && { from }), ...(to && { to }) };
}
