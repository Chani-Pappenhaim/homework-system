import { groupDisplayName, groupNameSelect } from '../utils/group-name';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/errors';
import { getMyAttendance } from './attendance.service';

export async function findStudentByEmail(email: string) {
  return prisma.user.findFirst({
    where: { email, role: 'STUDENT' },
    select: { id: true, name: true, email: true },
  });
}

/**
 * A cross-group student directory — used for the "exceptional lesson access"
 * autocomplete, so a teacher can find a student by name or email in a single
 * query instead of an exact-match lookup.
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
      studentGroups: { select: { group: { select: groupNameSelect } } },
    },
    orderBy: { name: 'asc' },
    take: 50,
  });
  return students.map((s) => ({
    id: s.id,
    name: s.name,
    email: s.email,
    groupNames: s.studentGroups.map((sg) => groupDisplayName(sg.group)),
  }));
}

type Reach = { groupIds: Set<string>; courseIds: Set<string>; lessonIds: Set<string> };

/** The student's own reach (see getMySubmissions) never includes a hidden lesson or course. */
const visibleLesson = { hidden: false, course: { hidden: false } };

function reaches(r: Reach, a: { lessonId: string; lesson: { courseId: string; course: { groupId: string } } }) {
  return r.groupIds.has(a.lesson.course.groupId) || r.courseIds.has(a.lesson.courseId) || r.lessonIds.has(a.lessonId);
}

/** Same rule as the frontend: an excused absence does not count against the student. */
function attendanceRate(present: number, absent: number): number | null {
  return present + absent ? Math.round((present * 100) / (present + absent)) : null;
}

function average(values: number[]): number | null {
  return values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : null;
}

/**
 * Every student with a one-line summary, for the teacher's students page.
 * Built from a handful of bulk queries rather than a query per student.
 */
export async function getStudentsOverview() {
  const [students, assignments, submissions, records, unread] = await Promise.all([
    prisma.user.findMany({
      where: { role: 'STUDENT' },
      orderBy: { name: 'asc' },
      select: {
        id: true, name: true, email: true, githubUsername: true,
        studentGroups: { select: { groupId: true, group: { select: groupNameSelect } } },
        courseAccess: { select: { courseId: true } },
        lessonAccess: { select: { lessonId: true } },
      },
    }),
    prisma.assignment.findMany({
      where: { lesson: visibleLesson },
      select: { id: true, deadline: true, lessonId: true, lesson: { select: { courseId: true, course: { select: { groupId: true } } } } },
    }),
    prisma.submission.findMany({
      select: { studentId: true, assignmentId: true, isLate: true, grade: { select: { contentScore: true } } },
    }),
    prisma.attendanceRecord.findMany({ select: { studentId: true, status: true } }),
    prisma.messageEntry.findMany({
      where: { fromTeacher: false, isRead: false },
      select: { message: { select: { studentId: true } } },
    }),
  ]);

  const subsByStudent = new Map<string, typeof submissions>();
  for (const s of submissions) subsByStudent.set(s.studentId, [...(subsByStudent.get(s.studentId) ?? []), s]);
  const unreadByStudent = new Map<string, number>();
  for (const e of unread) unreadByStudent.set(e.message.studentId, (unreadByStudent.get(e.message.studentId) ?? 0) + 1);
  const attendanceByStudent = new Map<string, { present: number; absent: number; excused: number }>();
  for (const r of records) {
    const a = attendanceByStudent.get(r.studentId) ?? { present: 0, absent: 0, excused: 0 };
    if (r.status === 'PRESENT') a.present++;
    else if (r.status === 'ABSENT') a.absent++;
    else a.excused++;
    attendanceByStudent.set(r.studentId, a);
  }

  const now = new Date();
  return students.map((st) => {
    const reach: Reach = {
      groupIds: new Set(st.studentGroups.map((sg) => sg.groupId)),
      courseIds: new Set(st.courseAccess.map((c) => c.courseId)),
      lessonIds: new Set(st.lessonAccess.map((l) => l.lessonId)),
    };
    const assigned = assignments.filter((a) => reaches(reach, a));
    const assignedIds = new Set(assigned.map((a) => a.id));
    const subs = (subsByStudent.get(st.id) ?? []).filter((s) => assignedIds.has(s.assignmentId));
    const submittedIds = new Set(subs.map((s) => s.assignmentId));
    const att = attendanceByStudent.get(st.id) ?? { present: 0, absent: 0, excused: 0 };
    return {
      id: st.id,
      name: st.name,
      email: st.email,
      githubUsername: st.githubUsername,
      groupNames: st.studentGroups.map((sg) => groupDisplayName(sg.group)),
      assignments: {
        total: assigned.length,
        submitted: subs.length,
        late: subs.filter((s) => s.isLate).length,
        missing: assigned.filter((a) => !submittedIds.has(a.id) && a.deadline && a.deadline < now).length,
      },
      averageContentScore: average(subs.flatMap((s) => (s.grade?.contentScore != null ? [s.grade.contentScore] : []))),
      attendance: { ...att, rate: attendanceRate(att.present, att.absent) },
      unreadMessages: unreadByStudent.get(st.id) ?? 0,
    };
  });
}

/** One student's full picture for the teacher: work, attendance, quizzes and messages. */
export async function getStudentProfile(studentId: string) {
  const student = await prisma.user.findFirst({
    where: { id: studentId, role: 'STUDENT' },
    select: {
      id: true, name: true, email: true, githubUsername: true, createdAt: true, emailVerifiedAt: true,
      studentGroups: { select: { groupId: true, group: { select: groupNameSelect } } },
      courseAccess: { select: { courseId: true, course: { select: { name: true } } } },
      lessonAccess: { select: { lessonId: true, lesson: { select: { topic: true } } } },
    },
  });
  if (!student) throw new AppError('Student not found', 'התלמידה לא נמצאה', 404);

  const groupIds = student.studentGroups.map((sg) => sg.groupId);
  const courseIds = student.courseAccess.map((c) => c.courseId);
  const lessonIds = student.lessonAccess.map((l) => l.lessonId);

  const [assignments, attendance, notes, attempts, threads] = await Promise.all([
    prisma.assignment.findMany({
      where: {
        lesson: {
          ...visibleLesson,
          OR: [{ course: { groupId: { in: groupIds } } }, { courseId: { in: courseIds } }, { id: { in: lessonIds } }],
        },
      },
      orderBy: [{ deadline: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true, title: true, deadline: true,
        lesson: { select: { id: true, topic: true, course: { select: { name: true } } } },
        submissions: {
          where: { studentId },
          select: {
            id: true, submittedAt: true, isLate: true, githubUrl: true, fileName: true, aiStatus: true,
            grade: { select: { submissionScore: true, contentScore: true, contentApproved: true } },
          },
        },
      },
    }),
    getMyAttendance(studentId),
    prisma.attendanceRecord.findMany({ where: { studentId, note: { not: null } }, select: { sessionId: true, note: true } }),
    prisma.quizAttempt.findMany({
      where: { studentId },
      orderBy: { takenAt: 'asc' },
      select: {
        quizId: true, score: true, takenAt: true, isOfficial: true,
        quiz: { select: { lesson: { select: { topic: true, course: { select: { name: true } } } } } },
      },
    }),
    prisma.teacherMessage.findMany({
      where: { studentId },
      select: {
        id: true, createdAt: true, assignmentId: true,
        entries: { orderBy: { createdAt: 'desc' }, select: { fromTeacher: true, content: true, isRead: true, createdAt: true } },
      },
    }),
  ]);

  const now = new Date();
  const noteBySession = new Map(notes.map((n) => [n.sessionId, n.note]));

  type QuizSummary = {
    quizId: string; lessonTopic: string; courseName: string;
    officialScore: number | null; takenAt: Date; attempts: number; bestScore: number;
  };
  const quizzes = new Map<string, QuizSummary>();
  for (const a of attempts) {
    const q = quizzes.get(a.quizId);
    if (!q) {
      quizzes.set(a.quizId, {
        quizId: a.quizId, lessonTopic: a.quiz.lesson.topic, courseName: a.quiz.lesson.course.name,
        officialScore: a.isOfficial ? a.score : null, takenAt: a.takenAt, attempts: 1, bestScore: a.score,
      });
    } else {
      q.attempts++;
      q.bestScore = Math.max(q.bestScore, a.score);
      if (a.isOfficial && q.officialScore === null) q.officialScore = a.score;
    }
  }

  const titles = new Map(assignments.map((a) => [a.id, a.title]));
  const messages = threads
    .map((t) => {
      const last = t.entries[0];
      return {
        id: t.id,
        assignmentTitle: t.assignmentId ? titles.get(t.assignmentId) ?? null : null,
        lastAt: last?.createdAt ?? t.createdAt,
        lastFromTeacher: last?.fromTeacher ?? true,
        preview: last ? last.content.slice(0, 120) : '',
        unread: t.entries.filter((e) => !e.fromTeacher && !e.isRead).length,
        entries: t.entries.length,
      };
    })
    .sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());

  const work = assignments.map((a) => {
    const sub = a.submissions[0];
    return {
      assignmentId: a.id,
      title: a.title,
      lessonId: a.lesson.id,
      lessonTopic: a.lesson.topic,
      courseName: a.lesson.course.name,
      deadline: a.deadline,
      overdue: !sub && !!a.deadline && a.deadline < now,
      submission: sub
        ? {
            id: sub.id, submittedAt: sub.submittedAt, isLate: sub.isLate, githubUrl: sub.githubUrl, fileName: sub.fileName,
            aiStatus: sub.aiStatus,
            submissionScore: sub.grade?.submissionScore ?? null,
            contentScore: sub.grade?.contentScore ?? null,
            contentApproved: sub.grade?.contentApproved ?? false,
          }
        : null,
    };
  });

  return {
    student: {
      id: student.id, name: student.name, email: student.email, githubUsername: student.githubUsername,
      createdAt: student.createdAt, emailVerified: !!student.emailVerifiedAt,
      groupNames: student.studentGroups.map((sg) => groupDisplayName(sg.group)),
      extraCourses: student.courseAccess.map((c) => c.course.name),
      extraLessons: student.lessonAccess.map((l) => l.lesson.topic),
    },
    work,
    attendance: attendance.map((c) => ({
      courseId: c.courseId,
      courseName: c.courseName,
      summary: { ...c.summary, rate: attendanceRate(c.summary.present, c.summary.absent) },
      sessions: c.sessions.map((s) => ({ id: s.id, date: s.date, title: s.title, status: s.status, note: noteBySession.get(s.id) ?? null })),
    })),
    quizzes: [...quizzes.values()],
    messages,
  };
}
