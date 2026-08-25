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

// Teacher replies to a message; replying also marks it as read
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

export async function markRead(messageId: string) {
  await prisma.teacherMessage.update({ where: { id: messageId }, data: { isRead: true } });
}

export async function getUnreadCount() {
  return prisma.teacherMessage.count({ where: { isRead: false } });
}

// Student sees how many of the teacher's replies she hasn't opened yet
export async function getUnreadReplyCount(studentId: string) {
  return prisma.teacherMessage.count({
    where: { studentId, replyContent: { not: null }, replySeen: false },
  });
}

// Opening a message overlay marks its reply as seen (student only, own message)
export async function markReplySeen(messageId: string, studentId: string) {
  await prisma.teacherMessage.updateMany({
    where: { id: messageId, studentId },
    data: { replySeen: true },
  });
}

// Teacher deletes an entire message thread from her inbox
export async function deleteMessage(messageId: string) {
  await prisma.teacherMessage.delete({ where: { id: messageId } });
}

// Teacher retracts her own reply, leaving the original message unanswered
export async function deleteReply(messageId: string) {
  return prisma.teacherMessage.update({
    where: { id: messageId },
    data: { replyContent: null, repliedAt: null },
  });
}

// Student deletes a message she sent (only her own)
export async function deleteMyMessage(messageId: string, studentId: string) {
  const message = await prisma.teacherMessage.findUnique({ where: { id: messageId } });
  if (!message || message.studentId !== studentId) {
    throw Object.assign(new Error('הודעה לא נמצאה'), { status: 404 });
  }
  await prisma.teacherMessage.delete({ where: { id: messageId } });
}
