import { Request, Response } from 'express';
import * as submissionsService from '../services/submissions.service';
import { aiReviewQueue } from '../workers/index';
import { prisma } from '../config/prisma';

export async function submit(req: Request, res: Response) {
  try {
    const payload = req.body.repoName
      ? { repoName: req.body.repoName as string, notes: req.body.notes as string | undefined }
      : req.file
        ? { file: { buffer: req.file.buffer, originalName: req.file.originalname, mimeType: req.file.mimetype }, notes: req.body.notes as string | undefined }
        : null;

    if (!payload) { res.status(400).json({ success: false, error: 'No file or repo name provided' }); return; }

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

export async function importSubmissions(req: Request, res: Response) {
  try {
    if (!req.file) { res.status(400).json({ success: false, error: 'No file uploaded' }); return; }
    const result = await submissionsService.importSubmissions(req.file.buffer);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

export async function requestAiReview(req: Request, res: Response) {
  try {
    const submission = await prisma.submission.findUnique({ where: { id: req.params.id as string } });
    if (!submission) { res.status(404).json({ success: false, error: 'Submission not found' }); return; }
    if (submission.studentId !== req.user!.userId) { res.status(403).json({ success: false, error: 'Forbidden' }); return; }
    if (!submission.githubUrl) { res.status(400).json({ success: false, error: 'No GitHub URL on submission' }); return; }

    const maxReviews = submission.aiExtraAllowed ? 2 : 1;
    if (submission.aiReviewCount >= maxReviews) {
      res.status(400).json({ success: false, error: 'AI review limit reached' }); return;
    }
    if (submission.aiStatus === 'pending') {
      res.status(400).json({ success: false, error: 'Review already in progress' }); return;
    }

    await prisma.submission.update({ where: { id: submission.id }, data: { aiStatus: 'pending' } });
    await aiReviewQueue.add(
      'review',
      { submissionId: submission.id },
      // GitHub and Gemini both fail transiently; without retries a blip costs the
      // student her one review attempt.
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } }
    );
    res.json({ success: true, data: null });
  } catch (err: any) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

export async function approveAiReview(req: Request, res: Response) {
  try {
    const submission = await prisma.submission.update({
      where: { id: req.params.id as string },
      data: { aiApproved: true },
    });
    res.json({ success: true, data: { submission } });
  } catch (err: any) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

// Restore the grade score back to the AI's score — no new AI request needed,
// because aiScore is kept on the submission even after the teacher overrides the grade.
export async function restoreAiScore(req: Request, res: Response) {
  try {
    const submission = await prisma.submission.findUnique({
      where: { id: req.params.id as string },
    });
    if (!submission) {
      res.status(404).json({ success: false, error: 'Submission not found' }); return;
    }
    if (submission.aiScore == null) {
      res.status(400).json({ success: false, error: 'אין ציון AI להגשה זו' }); return;
    }
    const grade = await prisma.grade.upsert({
      where: { submissionId: submission.id },
      create: { submissionId: submission.id, gradedById: req.user!.userId, score: submission.aiScore },
      update: { score: submission.aiScore, gradedAt: new Date(), gradedById: req.user!.userId },
    });
    res.json({ success: true, data: { grade } });
  } catch (err: any) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

export async function allowExtraAiReview(req: Request, res: Response) {
  try {
    await prisma.submission.update({
      where: { id: req.params.id as string },
      data: { aiExtraAllowed: true },
    });
    res.json({ success: true, data: null });
  } catch (err: any) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}
