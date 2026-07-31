import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { emailQueue } from '../infrastructure/queues/queues';
import { sendError } from '../utils/http';

export async function sendMessage(req: Request, res: Response) {
  try {
    const { content, assignmentId } = req.body;
    if (!content?.trim()) { res.status(400).json({ success: false, error: 'Content required' }); return; }
    const message = await prisma.teacherMessage.create({
      data: {
        studentId: req.user!.userId,
        content: content.trim(),
        assignmentId: typeof assignmentId === 'string' && assignmentId ? assignmentId : null,
      },
      include: { student: { select: { id: true, name: true, email: true } } },
    });
    try {
      await emailQueue.add('student-message', {
        messageId: message.id,
        studentName: message.student.name,
        studentEmail: message.student.email,
        content: message.content,
      });
    } catch (err) {
      console.error('[messages] Failed to enqueue student-message email:', err);
    }
    res.status(201).json({ success: true, data: { message } });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function getMessages(req: Request, res: Response) {
  try {
    const messages = await prisma.teacherMessage.findMany({
      orderBy: { createdAt: 'desc' },
      include: { student: { select: { id: true, name: true, email: true } } },
    });
    res.json({ success: true, data: { messages } });
  } catch (err: any) {
    sendError(res, err);
  }
}

// Student sees her own messages, including teacher replies
export async function getMyMessages(req: Request, res: Response) {
  try {
    const messages = await prisma.teacherMessage.findMany({
      where: { studentId: req.user!.userId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: { messages } });
  } catch (err: any) {
    sendError(res, err);
  }
}

// Teacher replies to a message; replying also marks it as read
export async function replyMessage(req: Request, res: Response) {
  try {
    const { reply } = req.body;
    if (!reply?.trim()) { res.status(400).json({ success: false, error: 'Reply required' }); return; }
    const message = await prisma.teacherMessage.update({
      where: { id: req.params.id as string },
      data: { replyContent: reply.trim(), repliedAt: new Date(), isRead: true, replySeen: false },
      include: { student: { select: { id: true, name: true, email: true } } },
    });
    try {
      await emailQueue.add('teacher-reply', {
        messageId: message.id,
        studentEmail: message.student.email,
        studentName: message.student.name,
        originalContent: message.content,
        replyContent: reply.trim(),
      });
    } catch (err) {
      console.error('[messages] Failed to enqueue teacher-reply email:', err);
    }
    res.json({ success: true, data: { message } });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function markRead(req: Request, res: Response) {
  try {
    await prisma.teacherMessage.update({ where: { id: req.params.id as string }, data: { isRead: true } });
    res.json({ success: true, data: null });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function getUnreadCount(req: Request, res: Response) {
  try {
    const count = await prisma.teacherMessage.count({ where: { isRead: false } });
    res.json({ success: true, data: { count } });
  } catch (err: any) {
    sendError(res, err);
  }
}

// Student sees how many of the teacher's replies she hasn't opened yet
export async function getUnreadReplyCount(req: Request, res: Response) {
  try {
    const count = await prisma.teacherMessage.count({
      where: { studentId: req.user!.userId, replyContent: { not: null }, replySeen: false },
    });
    res.json({ success: true, data: { count } });
  } catch (err: any) {
    sendError(res, err);
  }
}

// Opening a message overlay marks its reply as seen (student only, own message)
export async function markReplySeen(req: Request, res: Response) {
  try {
    await prisma.teacherMessage.updateMany({
      where: { id: req.params.id as string, studentId: req.user!.userId },
      data: { replySeen: true },
    });
    res.json({ success: true, data: null });
  } catch (err: any) {
    sendError(res, err);
  }
}

// Teacher deletes an entire message thread from her inbox
export async function deleteMessage(req: Request, res: Response) {
  try {
    await prisma.teacherMessage.delete({ where: { id: req.params.id as string } });
    res.json({ success: true, data: null });
  } catch (err: any) {
    sendError(res, err);
  }
}

// Teacher retracts her own reply, leaving the original message unanswered
export async function deleteReply(req: Request, res: Response) {
  try {
    const message = await prisma.teacherMessage.update({
      where: { id: req.params.id as string },
      data: { replyContent: null, repliedAt: null },
    });
    res.json({ success: true, data: { message } });
  } catch (err: any) {
    sendError(res, err);
  }
}

// Student deletes a message she sent (only her own)
export async function deleteMyMessage(req: Request, res: Response) {
  try {
    const message = await prisma.teacherMessage.findUnique({ where: { id: req.params.id as string } });
    if (!message || message.studentId !== req.user!.userId) {
      res.status(404).json({ success: false, error: 'הודעה לא נמצאה' });
      return;
    }
    await prisma.teacherMessage.delete({ where: { id: req.params.id as string } });
    res.json({ success: true, data: null });
  } catch (err: any) {
    sendError(res, err);
  }
}
