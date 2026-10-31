import { Request, Response } from 'express';
import * as messagesService from '../services/messages.service';
import { sendError } from '../utils/http';
import * as settingsService from '../services/settings.service';
import type { ReplyScope, Viewer } from '../services/messaging-policy';

/** The acting user as the messaging policy knows them. */
function viewerOf(req: Request): Viewer {
  return { role: req.user!.role === 'ADMIN' ? 'TEACHER' : 'STUDENT', userId: req.user!.userId };
}

/**
 * Whom a reply is for, as the client asked: one student (`toStudentId`, the
 * teacher only), the teacher alone (`scope: 'TEACHER'`, a student only), or
 * everyone in the thread. Whether the asker may is the policy's call.
 */
function replyScopeOf(body: { scope?: unknown; toStudentId?: unknown }): ReplyScope {
  if (typeof body.toStudentId === 'string' && body.toStudentId) return { to: 'STUDENT', studentId: body.toStudentId };
  if (body.scope === 'TEACHER') return { to: 'TEACHER' };
  return { to: 'ALL' };
}

export async function sendMessage(req: Request, res: Response) {
  try {
    const { content, assignmentId, subject } = req.body;
    if (!content?.trim()) { res.status(400).json({ success: false, error: 'תוכן ההודעה נדרש' }); return; }
    const message = await messagesService.sendMessage(req.user!.userId, content, { assignmentId, subject });
    res.status(201).json({ success: true, data: { message } });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function sendTeacherMessage(req: Request, res: Response) {
  try {
    const { studentId, content, assignmentId, subject } = req.body;
    if (!studentId) { res.status(400).json({ success: false, error: 'יש לבחור תלמידה' }); return; }
    if (!content?.trim()) { res.status(400).json({ success: false, error: 'תוכן ההודעה נדרש' }); return; }
    const message = await messagesService.sendTeacherMessage(req.user!.userId, studentId, content, { assignmentId, subject });
    res.status(201).json({ success: true, data: { message } });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function sendGroupMessage(req: Request, res: Response) {
  try {
    const { groupId, content, audience, subject } = req.body ?? {};
    if (!groupId) { res.status(400).json({ success: false, error: 'יש לבחור קבוצה' }); return; }
    if (audience !== 'GROUP_VISIBLE' && audience !== 'GROUP_BCC') {
      res.status(400).json({ success: false, error: 'יש לבחור אם ההודעה גלויה לכולן או עותק מוסתר' });
      return;
    }
    const result = await messagesService.sendGroupMessage(req.user!.userId, groupId, content, { audience, subject });
    res.status(201).json({ success: true, data: result });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function getEmailSettings(_req: Request, res: Response) {
  try {
    res.json({ success: true, data: await settingsService.getEmailSettings() });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function updateEmailSettings(req: Request, res: Response) {
  try {
    res.json({ success: true, data: await settingsService.updateEmailSettings(req.body ?? {}) });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function getMessages(req: Request, res: Response) {
  try {
    const messages = await messagesService.getAllMessages(req.user!.userId);
    res.json({ success: true, data: { messages } });
  } catch (err: any) {
    sendError(res, err);
  }
}

// The threads the student takes part in, including the teacher's replies
export async function getMyMessages(req: Request, res: Response) {
  try {
    const messages = await messagesService.getMyMessages(req.user!.userId);
    res.json({ success: true, data: { messages } });
  } catch (err: any) {
    sendError(res, err);
  }
}

// One thread, as far as the asker may see it
export async function getThread(req: Request, res: Response) {
  try {
    const message = await messagesService.getThread(viewerOf(req), req.params.id as string);
    res.json({ success: true, data: { message } });
  } catch (err: any) {
    sendError(res, err);
  }
}

// Teacher adding another entry to a thread — always allowed, however many entries already exist
export async function replyMessage(req: Request, res: Response) {
  try {
    const { reply } = req.body;
    if (!reply?.trim()) { res.status(400).json({ success: false, error: 'תגובה נדרשת' }); return; }
    const message = await messagesService.replyMessage(req.user!.userId, req.params.id as string, reply, replyScopeOf(req.body));
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

export async function markUnread(req: Request, res: Response) {
  try {
    await messagesService.markUnread(req.params.id as string);
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

// Student adding another entry to a thread she takes part in — always allowed
export async function studentReply(req: Request, res: Response) {
  try {
    const { reply } = req.body;
    if (!reply?.trim()) { res.status(400).json({ success: false, error: 'תגובה נדרשת' }); return; }
    const message = await messagesService.studentReplyMessage(req.params.id as string, req.user!.userId, reply, replyScopeOf(req.body));
    res.json({ success: true, data: { message } });
  } catch (err: any) {
    sendError(res, err);
  }
}

// Restricted to threads the student takes part in
export async function markMineRead(req: Request, res: Response) {
  try {
    await messagesService.markMineRead(req.params.id as string, req.user!.userId);
    res.json({ success: true, data: null });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function markMineUnread(req: Request, res: Response) {
  try {
    await messagesService.markMineUnread(req.params.id as string, req.user!.userId);
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

// Unsends the teacher's most recent entry in the thread
export async function deleteReply(req: Request, res: Response) {
  try {
    const message = await messagesService.deleteLastTeacherEntry(req.user!.userId, req.params.id as string);
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

// Puts the asker's emoji on an entry she can see, or takes it off again
export async function toggleReaction(req: Request, res: Response) {
  try {
    const reactions = await messagesService.toggleReaction(
      viewerOf(req), req.params.id as string, req.params.entryId as string, req.body?.emoji,
    );
    res.json({ success: true, data: { reactions } });
  } catch (err: any) {
    sendError(res, err);
  }
}
