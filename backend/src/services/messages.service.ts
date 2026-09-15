import { prisma } from '../config/prisma';
import { emailQueue } from '../infrastructure/queues/queues';
import type { EmailJobMap } from '../infrastructure/queues/job-types';

async function enqueueEmail<T extends keyof EmailJobMap>(jobName: T, data: EmailJobMap[T]) {
  try {
    await emailQueue.add(jobName, data);
  } catch (err) {
    console.error(`[messages] Failed to enqueue ${jobName} email:`, err);
  }
}

export async function sendMessage(studentId: string, content: string, assignmentId?: string) {
  const message = await prisma.teacherMessage.create({
    data: {
      studentId,
      content: content.trim(),
      assignmentId: typeof assignmentId === 'string' && assignmentId ? assignmentId : null,
    },
    include: { student: { select: { id: true, name: true, email: true } } },
  });
  await enqueueEmail('student-message', {
    messageId: message.id,
    studentName: message.student.name,
    studentEmail: message.student.email,
    content: message.content,
  });
  return message;
}

/** Lets the teacher start a new conversation with a student, instead of only ever replying to one the student started. */
export async function sendTeacherMessage(studentId: string, content: string, assignmentId?: string) {
  const message = await prisma.teacherMessage.create({
    data: {
      studentId,
      content: content.trim(),
      fromTeacher: true,
      assignmentId: typeof assignmentId === 'string' && assignmentId ? assignmentId : null,
    },
    include: { student: { select: { id: true, name: true, email: true } } },
  });
  await enqueueEmail('teacher-message', {
    messageId: message.id,
    studentName: message.student.name,
    studentEmail: message.student.email,
    content: message.content,
  });
  return message;
}

export async function getAllMessages() {
  return prisma.teacherMessage.findMany({
    orderBy: { createdAt: 'desc' },
    include: { student: { select: { id: true, name: true, email: true } } },
  });
}

export async function getMyMessages(studentId: string) {
  return prisma.teacherMessage.findMany({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
  });
}

// Replying also marks the message as read
export async function replyMessage(messageId: string, reply: string) {
  const message = await prisma.teacherMessage.update({
    where: { id: messageId },
    data: { replyContent: reply.trim(), repliedAt: new Date(), isRead: true, replySeen: false },
    include: { student: { select: { id: true, name: true, email: true } } },
  });
  await enqueueEmail('teacher-reply', {
    messageId: message.id,
    studentEmail: message.student.email,
    studentName: message.student.name,
    originalContent: message.content,
    replyContent: reply.trim(),
  });
  return message;
}

// Restricted to fromTeacher=false: the admin only "reads" content the student wrote.
export async function markRead(messageId: string) {
  await prisma.teacherMessage.updateMany({ where: { id: messageId, fromTeacher: false }, data: { isRead: true } });
}

// The teacher's inbox badge: unread messages a student sent, plus unseen replies
// students gave to a conversation the teacher started.
export async function getUnreadCount() {
  const [fromStudents, repliesToTeacher] = await Promise.all([
    prisma.teacherMessage.count({ where: { fromTeacher: false, isRead: false } }),
    prisma.teacherMessage.count({ where: { fromTeacher: true, replyContent: { not: null }, replySeen: false } }),
  ]);
  return fromStudents + repliesToTeacher;
}

// The student's inbox badge: unseen teacher replies to her own messages, plus
// unseen brand-new messages the teacher started.
export async function getUnreadReplyCount(studentId: string) {
  const [repliesFromTeacher, newFromTeacher] = await Promise.all([
    prisma.teacherMessage.count({ where: { studentId, fromTeacher: false, replyContent: { not: null }, replySeen: false } }),
    prisma.teacherMessage.count({ where: { studentId, fromTeacher: true, isRead: false } }),
  ]);
  return repliesFromTeacher + newFromTeacher;
}

// Marks the teacher's reply (to the student's own message) as seen; restricted to that student's message.
export async function markReplySeen(messageId: string, studentId: string) {
  await prisma.teacherMessage.updateMany({
    where: { id: messageId, studentId, fromTeacher: false },
    data: { replySeen: true },
  });
}

// Marks a teacher-initiated message as read by its recipient student.
export async function markMineRead(messageId: string, studentId: string) {
  await prisma.teacherMessage.updateMany({
    where: { id: messageId, studentId, fromTeacher: true },
    data: { isRead: true },
  });
}

// Marks a student's reply to a teacher-initiated message as seen by the teacher.
export async function markReplySeenByTeacher(messageId: string) {
  await prisma.teacherMessage.updateMany({ where: { id: messageId, fromTeacher: true }, data: { replySeen: true } });
}

// The student's reply to a conversation the teacher started; restricted to her own message.
export async function studentReplyMessage(messageId: string, studentId: string, reply: string) {
  const message = await prisma.teacherMessage.findUnique({ where: { id: messageId } });
  if (!message || message.studentId !== studentId || !message.fromTeacher) {
    throw Object.assign(new Error('הודעה לא נמצאה'), { status: 404 });
  }
  const trimmed = reply.trim();
  const updated = await prisma.teacherMessage.update({
    where: { id: messageId },
    data: { replyContent: trimmed, repliedAt: new Date(), isRead: true, replySeen: false },
  });
  const student = await prisma.user.findUnique({ where: { id: studentId }, select: { name: true, email: true } });
  await enqueueEmail('student-reply', {
    messageId: updated.id,
    studentName: student?.name ?? '',
    studentEmail: student?.email ?? '',
    originalContent: message.content,
    replyContent: trimmed,
  });
  return updated;
}

export async function deleteMessage(messageId: string) {
  await prisma.teacherMessage.delete({ where: { id: messageId } });
}

// Retracts a reply, leaving the original message unanswered
export async function deleteReply(messageId: string) {
  return prisma.teacherMessage.update({
    where: { id: messageId },
    data: { replyContent: null, repliedAt: null },
  });
}

export async function deleteMyMessage(messageId: string, studentId: string) {
  const message = await prisma.teacherMessage.findUnique({ where: { id: messageId } });
  if (!message || message.studentId !== studentId) {
    throw Object.assign(new Error('הודעה לא נמצאה'), { status: 404 });
  }
  await prisma.teacherMessage.delete({ where: { id: messageId } });
}
