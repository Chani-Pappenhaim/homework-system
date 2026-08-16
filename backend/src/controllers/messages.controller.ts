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

export async function getMessages(req: Request, res: Response) {
  try {
    const messages = await messagesService.getAllMessages();
    res.json({ success: true, data: { messages } });
  } catch (err: any) {
    sendError(res, err);
  }
}

// Student sees her own messages, including teacher replies
export async function getMyMessages(req: Request, res: Response) {
  try {
    const messages = await messagesService.getMyMessages(req.user!.userId);
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

// Student sees how many of the teacher's replies she hasn't opened yet
export async function getUnreadReplyCount(req: Request, res: Response) {
  try {
    const count = await messagesService.getUnreadReplyCount(req.user!.userId);
    res.json({ success: true, data: { count } });
  } catch (err: any) {
    sendError(res, err);
  }
}

// Opening a message overlay marks its reply as seen (student only, own message)
export async function markReplySeen(req: Request, res: Response) {
  try {
    await messagesService.markReplySeen(req.params.id as string, req.user!.userId);
    res.json({ success: true, data: null });
  } catch (err: any) {
    sendError(res, err);
  }
}

// Teacher deletes an entire message thread from her inbox
export async function deleteMessage(req: Request, res: Response) {
  try {
    await messagesService.deleteMessage(req.params.id as string);
    res.json({ success: true, data: null });
  } catch (err: any) {
    sendError(res, err);
  }
}

// Teacher retracts her own reply, leaving the original message unanswered
export async function deleteReply(req: Request, res: Response) {
  try {
    const message = await messagesService.deleteReply(req.params.id as string);
    res.json({ success: true, data: { message } });
  } catch (err: any) {
    sendError(res, err);
  }
}

// Student deletes a message she sent (only her own)
export async function deleteMyMessage(req: Request, res: Response) {
  try {
    await messagesService.deleteMyMessage(req.params.id as string, req.user!.userId);
    res.json({ success: true, data: null });
  } catch (err: any) {
    sendError(res, err);
  }
}
