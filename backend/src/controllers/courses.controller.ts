import { Request, Response } from 'express';
import * as coursesService from '../services/courses.service';
import { sendError } from '../utils/http';
import { fixMulterFilename } from '../utils/storage';

export async function getCourses(req: Request, res: Response) {
  const courses = await coursesService.getCoursesForUser(req.user!.userId, req.user!.role);
  res.json({ success: true, data: { courses } });
}

export async function createCourse(req: Request, res: Response) {
  try {
    const course = await coursesService.createCourse(req.body);
    res.status(201).json({ success: true, data: { course } });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function getCourse(req: Request, res: Response) {
  try {
    const course = await coursesService.getCourseById(req.params.id as string, req.user!.userId, req.user!.role);
    if (!course) { res.status(404).json({ success: false, error: 'Course not found' }); return; }
    res.json({ success: true, data: { course } });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function updateCourse(req: Request, res: Response) {
  try {
    const course = await coursesService.updateCourse(req.params.id as string, req.body);
    res.json({ success: true, data: { course } });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function copyCourse(req: Request, res: Response) {
  try {
    const { targetGroupId } = req.body;
    const course = await coursesService.copyCourse(req.params.id as string, targetGroupId);
    res.status(201).json({ success: true, data: { course } });
  } catch (err: any) {
    sendError(res, err);
  }
}


export async function addLink(req: Request, res: Response) {
  try {
    const { label, url, order } = req.body;
    const link = await coursesService.addCourseLink(req.params.id as string, label, url, order);
    res.status(201).json({ success: true, data: { link } });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function deleteLink(req: Request, res: Response) {
  try {
    await coursesService.deleteCourseLink(req.params.id as string, req.params.linkId as string);
    res.json({ success: true, data: null });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function getUploadSignature(req: Request, res: Response) {
  try {
    const signature = coursesService.getCourseUploadSignature();
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
    const file = await coursesService.uploadCourseFile(req.params.id as string, source, req.body.name);
    res.status(201).json({ success: true, data: { file } });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function deleteCourse(req: Request, res: Response) {
  try {
    await coursesService.deleteCourse(req.params.id as string);
    res.json({ success: true, data: null });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function deleteFile(req: Request, res: Response) {
  try {
    await coursesService.deleteCourseFile(req.params.id as string, req.params.fileId as string);
    res.json({ success: true, data: null });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function renameFile(req: Request, res: Response) {
  try {
    const file = await coursesService.renameCourseFile(req.params.id as string, req.params.fileId as string, req.body.name);
    res.json({ success: true, data: { file } });
  } catch (err: any) {
    sendError(res, err);
  }
}

