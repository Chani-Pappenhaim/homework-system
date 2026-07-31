import { prisma } from '../config/prisma';

/**
 * A cross-group student directory — used for the "exceptional lesson access"
 * autocomplete, so a teacher can find a student by name (not just typing an
 * exact email and hoping it matches). Previously the only way to find a
 * student by email was to fetch every group's full member list one at a
 * time from the browser; this replaces that N+1 with one query.
 */
export async function searchStudents(query?: string) {
  const q = query?.trim();
  const students = await prisma.user.findMany({
    where: {
      role: 'STUDENT',
      ...(q ? {
        OR: [
          { name: { contains: q, mode: 'insensitive' as const } },
          { email: { contains: q, mode: 'insensitive' as const } },
        ],
      } : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      studentGroups: { select: { group: { select: { name: true } } } },
    },
    orderBy: { name: 'asc' },
    take: 50,
  });
  return students.map((s) => ({
    id: s.id,
    name: s.name,
    email: s.email,
    groupNames: s.studentGroups.map((sg) => sg.group.name),
  }));
}
