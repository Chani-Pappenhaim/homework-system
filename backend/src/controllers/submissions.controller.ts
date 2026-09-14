import { Request, Response } from 'express';
import * as submissionsService from '../services/submissions.service';
import { sendError } from '../utils/http';
import { fixMulterFilename } from '../utils/storage';

interface SubmissionPayload {
  repoName?: string;
  notes?: string;
  checklist?: unknown;
  file?: { buffer: Buffer; originalName: string; mimeType: string };
  uploadedFile?: { url: string; originalName: string };
}

function buildSubmissionPayload(req: Request): SubmissionPayload | null {
  // checklist arrives as a JSON string in multipart uploads, or as an array in a JSON body.
  let checklist: unknown;
  if (req.body.checklist != null) {
    try {
      checklist = typeof req.body.checklist === 'string' ? JSON.parse(req.body.checklist) : req.body.checklist;
    } catch {
      checklist = undefined;
    }
  }
  const notes = req.body.notes as string | undefined;

  if (req.body.repoName) {
    return { repoName: req.body.repoName as string, notes, checklist };
  }
  if (req.file) {
    return {
      file: { buffer: req.file.buffer, originalName: fixMulterFilename(req.file.originalname), mimeType: req.file.mimetype },
      notes,
      checklist,
    };
  }
  if (req.body.uploadedFile) {
    return {
      uploadedFile: { url: req.body.uploadedFile.url as string, originalName: req.body.uploadedFile.originalName as string },
      notes,
      checklist,
    };
  }
  return null;
}

export async function submit(req: Request, res: Response) {
  try {
    const payload = buildSubmissionPayload(req);
    if (!payload) { res.status(400).json({ success: false, error: 'No file or repo name provided' }); return; }

    const submission = await submissionsService.submitAssignment(req.params.id as string, req.user!.userId, payload);
    res.json({ success: true, data: { submission } });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function getVideoUploadSignature(req: Request, res: Response) {
  try {
    const signature = await submissionsService.getVideoUploadSignature(req.params.id as string, req.user!.userId);
    res.json({ success: true, data: signature });
  } catch (err: any) {
    sendError(res, err);
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
    sendError(res, err);
  }
}

export async function importSubmissions(req: Request, res: Response) {
  try {
    const result = await submissionsService.importSubmissions(req.file!.buffer);
    res.json({ success: true, data: result });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function requestAiReview(req: Request, res: Response) {
  try {
    await submissionsService.requestAiReview(req.params.id as string, req.user!.userId);
    res.json({ success: true, data: null });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function approveAiReview(req: Request, res: Response) {
  try {
    const submission = await submissionsService.approveAiReview(req.params.id as string);
    res.json({ success: true, data: { submission } });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function restoreAiScore(req: Request, res: Response) {
  try {
    const grade = await submissionsService.restoreAiScore(req.params.id as string, req.user!.userId);
    res.json({ success: true, data: { grade } });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function allowExtraAiReview(req: Request, res: Response) {
  try {
    await submissionsService.allowExtraAiReview(req.params.id as string);
    res.json({ success: true, data: null });
  } catch (err: any) {
    sendError(res, err);
  }
}
