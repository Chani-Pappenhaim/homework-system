import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { emailQueue } from '../infrastructure/queues/queues';

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
        studentName: message.student.name,
        content: message.content,
      });
    } catch (err) {
      console.error('[messages] Failed to enqueue student-message email:', err);
    }
    res.status(201).json({ success: true, data: { message } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
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
    res.status(500).json({ success: false, error: err.message });
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
    res.status(500).json({ success: false, error: err.message });
  }
}

// Teacher replies to a message; replying also marks it as read
export async function replyMessage(req: Request, res: Response) {
  try {
    const { reply } = req.body;
    if (!reply?.trim()) { res.status(400).json({ success: false, error: 'Reply required' }); return; }
    const message = await prisma.teacherMessage.update({
      where: { id: req.params.id as string },
      data: { replyContent: reply.trim(), repliedAt: new Date(), isRead: true },
      include: { student: { select: { id: true, name: true, email: true } } },
    });
    try {
      await emailQueue.add('teacher-reply', {
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
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function markRead(req: Request, res: Response) {
  try {
    await prisma.teacherMessage.update({ where: { id: req.params.id as string }, data: { isRead: true } });
    res.json({ success: true, data: null });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getUnreadCount(req: Request, res: Response) {
  try {
    const count = await prisma.teacherMessage.count({ where: { isRead: false } });
    res.json({ success: true, data: { count } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}
