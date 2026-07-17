import { Request, Response } from 'express';
import * as lessonsService from '../services/lessons.service';

export async function getLessons(req: Request, res: Response) {
  try {
    const lessons = await lessonsService.getLessons(
      req.params.courseId as string, req.user!.userId, req.user!.role
    );
    res.json({ success: true, data: { lessons } });
  } catch (err: any) {
    console.error('getLessons error:', err);
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

export async function createLesson(req: Request, res: Response) {
  try {
    const lesson = await lessonsService.createLesson(req.params.courseId as string, req.body);
    res.status(201).json({ success: true, data: { lesson } });
  } catch (err: any) {
    console.error('createLesson error:', err);
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

export async function getLesson(req: Request, res: Response) {
  try {
    const lesson = await lessonsService.getLessonById(req.params.id as string, req.user!.userId, req.user!.role);
    if (!lesson) { res.status(404).json({ success: false, error: 'Lesson not found' }); return; }
    res.json({ success: true, data: { lesson } });
  } catch (err: any) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

export async function setProgress(req: Request, res: Response) {
  try {
    const completed = req.body.completed !== false; // default true
    const result = await lessonsService.setLessonProgress(req.user!.userId, req.params.id as string, completed);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

export async function updateLesson(req: Request, res: Response) {
  try {
    const lesson = await lessonsService.updateLesson(req.params.id as string, req.body);
    res.json({ success: true, data: { lesson } });
  } catch (err: any) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

export async function reorderLessons(req: Request, res: Response) {
  try {
    await lessonsService.reorderLessons(req.body.lessons);
    res.json({ success: true, data: null });
  } catch (err: any) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

export async function uploadFile(req: Request, res: Response) {
  try {
    if (!req.file) { res.status(400).json({ success: false, error: 'No file uploaded' }); return; }
    const file = await lessonsService.uploadLessonFile(
      req.params.id as string, req.file.buffer, req.file.originalname, req.file.mimetype
    );
    res.status(201).json({ success: true, data: { file } });
  } catch (err: any) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

export async function deleteFile(req: Request, res: Response) {
  try {
    await lessonsService.deleteLessonFile(req.params.id as string, req.params.fileId as string);
    res.json({ success: true, data: null });
  } catch (err: any) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

export async function getLessonAccess(req: Request, res: Response) {
  try {
    const students = await lessonsService.getLessonAccess(req.params.id as string);
    res.json({ success: true, data: { students } });
  } catch (err: any) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

export async function grantLessonAccess(req: Request, res: Response) {
  try {
    await lessonsService.grantLessonAccess(req.params.id as string, req.body.studentId);
    res.status(201).json({ success: true, data: null });
  } catch (err: any) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

export async function revokeLessonAccess(req: Request, res: Response) {
  try {
    await lessonsService.revokeLessonAccess(req.params.id as string, req.params.studentId as string);
    res.json({ success: true, data: null });
  } catch (err: any) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

export async function importMarkdown(req: Request, res: Response) {
  try {
    if (!req.file) { res.status(400).json({ success: false, error: 'No file uploaded' }); return; }
    const content = req.file.buffer.toString('utf-8');
    const lesson = await lessonsService.importMarkdown(req.params.id as string, content);
    res.json({ success: true, data: { lesson: { id: lesson.id, contentMd: lesson.contentMd } } });
  } catch (err: any) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

