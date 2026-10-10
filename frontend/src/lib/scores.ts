/** Text colour for a 0–100 figure (grade, attendance, share submitted): good, borderline, worrying. */
export function scoreTone(value: number | null): string {
  if (value == null) return 'text-ink/40';
  if (value >= 85) return 'text-sage';
  if (value >= 65) return 'text-clay';
  return 'text-coral';
}
