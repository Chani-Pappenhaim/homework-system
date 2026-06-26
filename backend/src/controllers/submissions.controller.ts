import { Request, Response } from 'express';
import * as submissionsService from '../services/submissions.service';

export async function submit(req: Request, res: Response) {
  try {
    const payload = req.body.githubUrl
      ? { githubUrl: req.body.githubUrl }
      : req.file
        ? { file: { buffer: req.file.buffer, originalName: req.file.originalname, mimeType: req.file.mimetype } }
        : null;

    if (!payload) { res.status(400).json({ success: false, error: 'No file or GitHub URL provided' }); return; }

    const submission = await submissionsService.submitAssignment(req.params.id as string, req.user!.userId, payload);
    res.json({ success: true, data: { submission } });
  } catch (err: any) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

export async function mySubmissions(req: Request, res: Response) {
  const data = await submissionsService.getMySubmissions(req.user!.userId);
  res.json({ success: true, data });
}

export async function getSubmission(req: Request, res: Response) {
  try {
    const submission = await submissionsService.getSubmissionById(req.params.id as string, req.user!.userId, req.user!.role);
    res.json({ success: true, data: { submission } });
  } catch (err: any) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

