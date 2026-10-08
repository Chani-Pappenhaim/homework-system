/**
 * A group's full name as the teacher refers to it — seminar, class and year
 * together ("סמינר מאיר יד תשפ״ז"). Mirrors `groupDisplayName` in the frontend;
 * older groups without a seminar simply drop that part.
 */
export function groupDisplayName(group: { name: string; seminar?: string | null; year?: string | null } | null | undefined): string {
  if (!group) return '';
  return [group.seminar, group.name, group.year].map((part) => part?.trim()).filter(Boolean).join(' ');
}

/** Prisma `select` for the fields `groupDisplayName` needs. */
export const groupNameSelect = { name: true, seminar: true, year: true } as const;
