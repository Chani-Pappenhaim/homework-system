import { Request, Response } from 'express';
import * as messagesService from '../services/messages.service';
import { sendError } from '../utils/http';

export async function sendMessage(req: Request, res: Response) {
  try {
    const { content, assignmentId } = req.body;
    if (!content?.trim()) { res.status(400).json({ success: false, error: 'Content required' }); return; }
    const message = await messagesService.sendMessage(req.user!.userId, content, assignmentId);
    res.status(201).json({ success: true, data: { message } });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function sendTeacherMessage(req: Request, res: Response) {
  try {
    const { studentId, content, assignmentId } = req.body;
    if (!studentId) { res.status(400).json({ success: false, error: 'יש לבחור תלמידה' }); return; }
    if (!content?.trim()) { res.status(400).json({ success: false, error: 'תוכן ההודעה נדרש' }); return; }
    const message = await messagesService.sendTeacherMessage(studentId, content, assignmentId);
    res.status(201).json({ success: true, data: { message } });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function getMessages(req: Request, res: Response) {
  try {
    const messages = await messagesService.getAllMessages();
    res.json({ success: true, data: { messages } });
  } catch (err: any) {
    sendError(res, err);
  }
}

// Includes the teacher's replies alongside the student's own messages
export async function getMyMessages(req: Request, res: Response) {
  try {
    const messages = await messagesService.getMyMessages(req.user!.userId);
    res.json({ success: true, data: { messages } });
  } catch (err: any) {
    sendError(res, err);
  }
}

// Teacher adding another entry to a conversation — always allowed, however many entries already exist
export async function replyMessage(req: Request, res: Response) {
  try {
    const { reply } = req.body;
    if (!reply?.trim()) { res.status(400).json({ success: false, error: 'Reply required' }); return; }
    const message = await messagesService.replyMessage(req.params.id as string, reply);
    res.json({ success: true, data: { message } });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function markRead(req: Request, res: Response) {
  try {
    await messagesService.markRead(req.params.id as string);
    res.json({ success: true, data: null });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function getUnreadCount(req: Request, res: Response) {
  try {
    const count = await messagesService.getUnreadCount();
    res.json({ success: true, data: { count } });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function getUnreadReplyCount(req: Request, res: Response) {
  try {
    const count = await messagesService.getUnreadReplyCount(req.user!.userId);
    res.json({ success: true, data: { count } });
  } catch (err: any) {
    sendError(res, err);
  }
}

// Student adding another entry to one of her own conversations — always allowed
export async function studentReply(req: Request, res: Response) {
  try {
    const { reply } = req.body;
    if (!reply?.trim()) { res.status(400).json({ success: false, error: 'תגובה נדרשת' }); return; }
    const message = await messagesService.studentReplyMessage(req.params.id as string, req.user!.userId, reply);
    res.json({ success: true, data: { message } });
  } catch (err: any) {
    sendError(res, err);
  }
}

// Restricted to the message's own student
export async function markMineRead(req: Request, res: Response) {
  try {
    await messagesService.markMineRead(req.params.id as string, req.user!.userId);
    res.json({ success: true, data: null });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function deleteMessage(req: Request, res: Response) {
  try {
    await messagesService.deleteMessage(req.params.id as string);
    res.json({ success: true, data: null });
  } catch (err: any) {
    sendError(res, err);
  }
}

// Unsends the teacher's most recent entry in the conversation
export async function deleteReply(req: Request, res: Response) {
  try {
    const message = await messagesService.deleteLastTeacherEntry(req.params.id as string);
    res.json({ success: true, data: { message } });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function deleteMyMessage(req: Request, res: Response) {
  try {
    await messagesService.deleteMyMessage(req.params.id as string, req.user!.userId);
    res.json({ success: true, data: null });
  } catch (err: any) {
    sendError(res, err);
  }
}
