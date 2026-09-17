import { prisma } from '../config/prisma';
import { emailQueue } from '../infrastructure/queues/queues';
import type { EmailJobMap } from '../infrastructure/queues/job-types';
import { AppError } from '../utils/errors';

async function enqueueEmail<T extends keyof EmailJobMap>(jobName: T, data: EmailJobMap[T]) {
  try {
    await emailQueue.add(jobName, data);
  } catch (err) {
    console.error(`[messages] Failed to enqueue ${jobName} email:`, err);
  }
}

const entriesInclude = { entries: { orderBy: { createdAt: 'asc' as const } } };

export async function sendMessage(studentId: string, content: string, assignmentId?: string) {
  const trimmed = content.trim();
  const message = await prisma.teacherMessage.create({
    data: {
      studentId,
      assignmentId: typeof assignmentId === 'string' && assignmentId ? assignmentId : null,
      entries: { create: { fromTeacher: false, content: trimmed } },
    },
    include: { student: { select: { id: true, name: true, email: true } }, ...entriesInclude },
  });
  await enqueueEmail('student-message', {
    messageId: message.id,
    studentName: message.student.name,
    studentEmail: message.student.email,
    content: trimmed,
  });
  return message;
}

/** Lets the teacher start a new conversation with a student, instead of only ever replying to one the student started. */
export async function sendTeacherMessage(studentId: string, content: string, assignmentId?: string) {
  const trimmed = content.trim();
  const message = await prisma.teacherMessage.create({
    data: {
      studentId,
      assignmentId: typeof assignmentId === 'string' && assignmentId ? assignmentId : null,
      entries: { create: { fromTeacher: true, content: trimmed } },
    },
    include: { student: { select: { id: true, name: true, email: true } }, ...entriesInclude },
  });
  await enqueueEmail('teacher-message', {
    messageId: message.id,
    studentName: message.student.name,
    studentEmail: message.student.email,
    content: trimmed,
  });
  return message;
}

export async function getAllMessages() {
  return prisma.teacherMessage.findMany({
    orderBy: { createdAt: 'desc' },
    include: { student: { select: { id: true, name: true, email: true } }, ...entriesInclude },
  });
}

export async function getMyMessages(studentId: string) {
  return prisma.teacherMessage.findMany({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
    include: entriesInclude,
  });
}

// The teacher adds another entry to a conversation — works whether it's brand
// new or already has back-and-forth history, so the exchange never "locks".
export async function replyMessage(messageId: string, content: string) {
  const conversation = await prisma.teacherMessage.findUnique({
    where: { id: messageId },
    include: { student: { select: { name: true, email: true } }, entries: { orderBy: { createdAt: 'asc' } } },
  });
  if (!conversation) throw new AppError('Message not found', 'ההודעה לא נמצאה', 404);

  const trimmed = content.trim();
  await prisma.messageEntry.create({ data: { messageId, fromTeacher: true, content: trimmed } });
  const updated = await prisma.teacherMessage.findUnique({ where: { id: messageId }, include: entriesInclude });

  await enqueueEmail('teacher-reply', {
    messageId,
    studentEmail: conversation.student.email,
    studentName: conversation.student.name,
    originalContent: conversation.entries[0]?.content ?? '',
    replyContent: trimmed,
  });
  return updated;
}

// Restricted to the teacher's own unread entries: the admin only "reads" content students wrote.
export async function markRead(messageId: string) {
  await prisma.messageEntry.updateMany({ where: { messageId, fromTeacher: false }, data: { isRead: true } });
}

// The teacher's inbox badge: every entry a student wrote that the teacher hasn't seen yet.
export async function getUnreadCount() {
  return prisma.messageEntry.count({ where: { fromTeacher: false, isRead: false } });
}

// The student's inbox badge: every entry the teacher wrote that this student hasn't seen yet.
export async function getUnreadReplyCount(studentId: string) {
  return prisma.messageEntry.count({ where: { fromTeacher: true, isRead: false, message: { studentId } } });
}

// The student adds another entry to one of her own conversations — whether she
// started it or the teacher did, and however many entries already exist.
export async function studentReplyMessage(messageId: string, studentId: string, content: string) {
  const conversation = await prisma.teacherMessage.findUnique({
    where: { id: messageId },
    include: { entries: { orderBy: { createdAt: 'asc' } } },
  });
  if (!conversation || conversation.studentId !== studentId) {
    throw new AppError('Message not found', 'הודעה לא נמצאה', 404);
  }

  const trimmed = content.trim();
  await prisma.messageEntry.create({ data: { messageId, fromTeacher: false, content: trimmed } });
  const updated = await prisma.teacherMessage.findUnique({ where: { id: messageId }, include: entriesInclude });

  const student = await prisma.user.findUnique({ where: { id: studentId }, select: { name: true, email: true } });
  await enqueueEmail('student-reply', {
    messageId,
    studentName: student?.name ?? '',
    studentEmail: student?.email ?? '',
    originalContent: conversation.entries[0]?.content ?? '',
    replyContent: trimmed,
  });
  return updated;
}

// Restricted to this student's own conversations: marks every teacher-written entry as seen by her.
export async function markMineRead(messageId: string, studentId: string) {
  await prisma.messageEntry.updateMany({
    where: { messageId, fromTeacher: true, message: { studentId } },
    data: { isRead: true },
  });
}

export async function deleteMessage(messageId: string) {
  await prisma.teacherMessage.delete({ where: { id: messageId } });
}

// Unsends the teacher's most recent entry in a conversation, leaving everything before it intact.
export async function deleteLastTeacherEntry(messageId: string) {
  const last = await prisma.messageEntry.findFirst({ where: { messageId }, orderBy: { createdAt: 'desc' } });
  if (last?.fromTeacher) {
    await prisma.messageEntry.delete({ where: { id: last.id } });
  }
  return prisma.teacherMessage.findUnique({ where: { id: messageId }, include: entriesInclude });
}

export async function deleteMyMessage(messageId: string, studentId: string) {
  const message = await prisma.teacherMessage.findUnique({ where: { id: messageId } });
  if (!message || message.studentId !== studentId) {
    throw new AppError('Message not found', 'הודעה לא נמצאה', 404);
  }
  await prisma.teacherMessage.delete({ where: { id: messageId } });
}
