import { Request, Response } from 'express';
import * as lessonsService from '../services/lessons.service';
import { sendError } from '../utils/http';
import { fixMulterFilename } from '../utils/storage';

export async function getLessons(req: Request, res: Response) {
  try {
    const lessons = await lessonsService.getLessons(
      req.params.courseId as string, req.user!.userId, req.user!.role
    );
    res.json({ success: true, data: { lessons } });
  } catch (err: any) {
    console.error('getLessons error:', err);
    sendError(res, err);
  }
}

export async function createLesson(req: Request, res: Response) {
  try {
    const lesson = await lessonsService.createLesson(req.params.courseId as string, req.body);
    res.status(201).json({ success: true, data: { lesson } });
  } catch (err: any) {
    console.error('createLesson error:', err);
    sendError(res, err);
  }
}

export async function getLesson(req: Request, res: Response) {
  try {
    const lesson = await lessonsService.getLessonById(req.params.id as string, req.user!.userId, req.user!.role);
    if (!lesson) { res.status(404).json({ success: false, error: 'Lesson not found' }); return; }
    res.json({ success: true, data: { lesson } });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function setProgress(req: Request, res: Response) {
  try {
    const completed = req.body.completed !== false; // default true
    const result = await lessonsService.setLessonProgress(req.user!.userId, req.params.id as string, completed);
    res.json({ success: true, data: result });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function updateLesson(req: Request, res: Response) {
  try {
    const lesson = await lessonsService.updateLesson(req.params.id as string, req.body);
    res.json({ success: true, data: { lesson } });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function reorderLessons(req: Request, res: Response) {
  try {
    await lessonsService.reorderLessons(req.body.lessons);
    res.json({ success: true, data: null });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function getUploadSignature(req: Request, res: Response) {
  try {
    const signature = lessonsService.getLessonUploadSignature();
    res.json({ success: true, data: signature });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function uploadFile(req: Request, res: Response) {
  try {
    const source = req.file
      ? { buffer: req.file.buffer, mimeType: req.file.mimetype, originalName: fixMulterFilename(req.file.originalname) }
      : req.body.uploadedFile as { url: string; bytes: number; originalName: string } | undefined;
    if (!source) { res.status(400).json({ success: false, error: 'No file provided' }); return; }
    const file = await lessonsService.uploadLessonFile(req.params.id as string, source, req.body.name, req.user!.userId);
    res.status(201).json({ success: true, data: { file } });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function deleteLesson(req: Request, res: Response) {
  try {
    await lessonsService.deleteLesson(req.params.id as string);
    res.json({ success: true, data: null });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function deleteFile(req: Request, res: Response) {
  try {
    await lessonsService.deleteLessonFile(req.params.id as string, req.params.fileId as string);
    res.json({ success: true, data: null });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function renameFile(req: Request, res: Response) {
  try {
    const file = await lessonsService.renameLessonFile(req.params.id as string, req.params.fileId as string, req.body.name, req.user!.userId);
    res.json({ success: true, data: { file } });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function setFileRequired(req: Request, res: Response) {
  try {
    const file = await lessonsService.setLessonFileRequired(req.params.id as string, req.params.fileId as string, Boolean(req.body.required), req.user!.userId);
    res.json({ success: true, data: { file } });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function markFileViewed(req: Request, res: Response) {
  try {
    await lessonsService.markLessonFileViewed(req.user!.userId, req.user!.role, req.params.id as string, req.params.fileId as string);
    res.json({ success: true, data: null });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function unmarkFileViewed(req: Request, res: Response) {
  try {
    await lessonsService.unmarkLessonFileViewed(req.user!.userId, req.user!.role, req.params.id as string, req.params.fileId as string);
    res.json({ success: true, data: null });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function getLessonAccess(req: Request, res: Response) {
  try {
    const students = await lessonsService.getLessonAccess(req.params.id as string);
    res.json({ success: true, data: { students } });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function grantLessonAccess(req: Request, res: Response) {
  try {
    await lessonsService.grantLessonAccess(req.params.id as string, req.body.studentId);
    res.status(201).json({ success: true, data: null });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function grantLessonAccessBulk(req: Request, res: Response) {
  try {
    const { groupId, emails } = req.body as { groupId?: string; emails?: string[] };
    const result = groupId
      ? await lessonsService.grantLessonAccessByGroup(req.params.id as string, groupId)
      : await lessonsService.grantLessonAccessByEmails(req.params.id as string, emails ?? []);
    res.status(201).json({ success: true, data: result });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function revokeLessonAccess(req: Request, res: Response) {
  try {
    await lessonsService.revokeLessonAccess(req.params.id as string, req.params.studentId as string);
    res.json({ success: true, data: null });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function importMarkdown(req: Request, res: Response) {
  try {
    const content = req.file!.buffer.toString('utf-8');
    const lesson = await lessonsService.importMarkdown(req.params.id as string, content);
    res.json({ success: true, data: { lesson: { id: lesson.id, contentMd: lesson.contentMd } } });
  } catch (err: any) {
    sendError(res, err);
  }
}

