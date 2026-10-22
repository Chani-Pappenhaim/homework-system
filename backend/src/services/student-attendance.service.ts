import type { AttendanceStatus } from '@prisma/client';
import { prisma } from '../config/prisma';

/**
 * The student's own attendance and homework, per course. Teacher notes are
 * deliberately left out, and lessons hidden from her show no topic or work.
 */
export async function getMyAttendance(studentId: string) {
  const courses = await prisma.course.findMany({
    where: {
      hidden: false,
      OR: [
        { group: { students: { some: { studentId } } } },
        { access: { some: { studentId } }, attendanceExclusions: { none: { studentId } } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, name: true,
      attendanceSessions: {
        orderBy: { date: 'desc' },
        select: {
          id: true, date: true, title: true,
          lesson: {
            select: {
              topic: true, hidden: true,
              assignments: {
                orderBy: { createdAt: 'asc' },
                select: { id: true, title: true, submissions: { where: { studentId }, select: { id: true } } },
              },
            },
          },
          records: { where: { studentId }, select: { status: true } },
          homework: {
            orderBy: { createdAt: 'asc' },
            select: { id: true, title: true, marks: { where: { studentId, done: true }, select: { done: true } } },
          },
        },
      },
    },
  });

  return courses.map((c) => {
    const sessions = c.attendanceSessions.map((s) => {
      const lesson = s.lesson && !s.lesson.hidden ? s.lesson : null;
      return {
        id: s.id,
        date: s.date,
        title: s.title ?? lesson?.topic ?? null,
        status: s.records[0]?.status ?? null,
        homework: [
          ...(lesson?.assignments ?? []).map((a) => ({ id: a.id, title: a.title, kind: 'site' as const, done: a.submissions.length > 0 })),
          ...s.homework.map((h) => ({ id: h.id, title: h.title, kind: 'extra' as const, done: h.marks.length > 0 })),
        ],
      };
    });
    const count = (st: AttendanceStatus) => sessions.filter((s) => s.status === st).length;
    return {
      courseId: c.id,
      courseName: c.name,
      summary: { present: count('PRESENT'), absent: count('ABSENT'), partial: count('PARTIAL'), sessions: sessions.length },
      sessions,
    };
  });
}
