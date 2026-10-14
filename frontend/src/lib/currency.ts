/**
 * A USD amount for display. A sub-cent amount shows as "<$0.01" instead of
 * rounding to "$0.00", so a small real cost never looks like nothing.
 * Render it in an LTR span: inside RTL text the "<" is mirrored.
 */
export function formatUsd(value: number | null | undefined): string {
  const amount = Number(value) || 0;
  if (amount <= 0) return '$0.00';
  if (amount < 0.01) return '<$0.01';
  return `$${amount.toFixed(2)}`;
}
