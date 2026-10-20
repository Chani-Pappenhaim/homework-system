import { prisma } from '../config/prisma';

export type RosterStudent = {
  id: string;
  name: string;
  email: string;
  // 'group' — a member of the course's group; 'access' — let in personally.
  source: 'group' | 'access';
  // Only an 'access' student can be left off the attendance.
  excluded: boolean;
};

/** Everyone attendance is taken for in a course, sorted by name. */
export async function loadRoster(courseId: string, groupId: string): Promise<RosterStudent[]> {
  const [members, grants, exclusions] = await Promise.all([
    prisma.studentGroup.findMany({
      where: { groupId, student: { role: 'STUDENT' } },
      select: { student: { select: { id: true, name: true, email: true } } },
    }),
    prisma.courseAccess.findMany({
      where: { courseId, student: { role: 'STUDENT' } },
      select: { student: { select: { id: true, name: true, email: true } } },
    }),
    prisma.attendanceExclusion.findMany({ where: { courseId }, select: { studentId: true } }),
  ]);
  const excluded = new Set(exclusions.map((e) => e.studentId));
  const roster = new Map<string, RosterStudent>();
  for (const { student } of members) roster.set(student.id, { ...student, source: 'group', excluded: false });
  for (const { student } of grants) {
    if (!roster.has(student.id)) roster.set(student.id, { ...student, source: 'access', excluded: excluded.has(student.id) });
  }
  return [...roster.values()].sort((a, b) => a.name.localeCompare(b.name, 'he'));
}
