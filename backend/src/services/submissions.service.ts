import { prisma } from '../config/prisma';
import { cloudinary } from '../config/cloudinary';
import { checkStudentCourseAccess } from './courses.service';

const GITHUB_URL_REGEX = /^https:\/\/github\.com\/.+/;

export async function submitAssignment(
  assignmentId: string, studentId: string,
  payload: { githubUrl?: string; file?: { buffer: Buffer; originalName: string; mimeType: string } }
) {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: { lesson: { include: { course: true } } },
  });
  if (!assignment) throw Object.assign(new Error('Assignment not found'), { status: 404 });

  const course = assignment.lesson.course;
  const hasAccess = await checkStudentCourseAccess(studentId, course.id, course.groupId);
  if (!hasAccess) throw Object.assign(new Error('Forbidden'), { status: 403 });

  let fileUrl: string | undefined;
  let fileName: string | undefined;
  let githubUrl: string | undefined;

  if (payload.githubUrl) {
    if (!assignment.allowGithub) throw Object.assign(new Error('GitHub not allowed for this assignment'), { status: 400 });
    if (!GITHUB_URL_REGEX.test(payload.githubUrl)) throw Object.assign(new Error('Invalid GitHub URL'), { status: 400 });
    githubUrl = payload.githubUrl;
  } else if (payload.file) {
    if (!assignment.allowFile) throw Object.assign(new Error('File upload not allowed for this assignment'), { status: 400 });
    if (assignment.allowedTypes.length > 0) {
      const ext = payload.file.originalName.split('.').pop()?.toLowerCase() ?? '';
      if (!assignment.allowedTypes.includes(ext)) {
        throw Object.assign(new Error(`File type not allowed. Allowed: ${assignment.allowedTypes.join(', ')}`), { status: 400 });
      }
    }
    const result = await cloudinary.uploader.upload(
      `data:${payload.file.mimeType};base64,${payload.file.buffer.toString('base64')}`,
      { resource_type: 'auto', folder: 'submissions' }
    );
    fileUrl = result.secure_url;
    fileName = payload.file.originalName;
  } else {
    throw Object.assign(new Error('No file or GitHub URL provided'), { status: 400 });
  }

  const isLate = assignment.deadline ? new Date() > assignment.deadline : false;

  const existing = await prisma.submission.findUnique({
    where: { assignmentId_studentId: { assignmentId, studentId } },
  });

  if (existing) {
    return prisma.submission.update({
      where: { id: existing.id },
      data: { fileUrl, fileName, githubUrl, submittedAt: new Date(), isLate },
    });
  }

  return prisma.submission.create({
    data: { assignmentId, studentId, fileUrl, fileName, githubUrl, isLate },
  });
}

export async function getMySubmissions(studentId: string) {
  const student = await prisma.user.findUnique({
    where: { id: studentId },
    include: {
      studentGroups: { select: { groupId: true } },
      courseAccess: { select: { courseId: true } },
    },
  });
  const groupIds = student?.studentGroups.map((sg) => sg.groupId) ?? [];
  const accessIds = student?.courseAccess.map((ca) => ca.courseId) ?? [];

  const allAssignments = await prisma.assignment.findMany({
    where: {
      lesson: {
        hidden: false,
        course: {
          hidden: false,
          OR: [{ groupId: { in: groupIds } }, { id: { in: accessIds } }],
        },
      },
    },
    include: {
      lesson: { select: { topic: true, course: { select: { name: true } } } },
      submissions: { where: { studentId } },
    },
  });

  const pending = [];
  const submitted = [];

  for (const assignment of allAssignments) {
    const sub = assignment.submissions[0];
    if (!sub) {
      pending.push({
        assignmentId: assignment.id, assignmentTitle: assignment.title,
        lessonTopic: assignment.lesson.topic, courseName: assignment.lesson.course.name,
        deadline: assignment.deadline,
      });
    } else {
      const grade = await prisma.grade.findUnique({ where: { submissionId: sub.id } });
      submitted.push({
        submissionId: sub.id, assignmentTitle: assignment.title,
        lessonTopic: assignment.lesson.topic, courseName: assignment.lesson.course.name,
        submittedAt: sub.submittedAt, isLate: sub.isLate,
        grade: grade ? { score: grade.score, feedback: grade.feedback, checklist: grade.checklist } : null,
      });
    }
  }

  pending.sort((a, b) => {
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return a.deadline.getTime() - b.deadline.getTime();
  });

  return { pending, submitted };
}

export async function getSubmissionById(id: string, userId: string, role: string) {
  const submission = await prisma.submission.findUnique({
    where: { id },
    include: { grade: true },
  });
  if (!submission) throw Object.assign(new Error('Submission not found'), { status: 404 });
  if (role !== 'ADMIN' && submission.studentId !== userId) {
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }
  return submission;
}
