import { Request, Response } from 'express';
import * as quizzesService from '../services/quizzes.service';
import { sendError } from '../utils/http';

export async function getQuiz(req: Request, res: Response) {
  try {
    const result = await quizzesService.getQuiz(
      req.params.id as string, req.user!.userId, req.user!.role
    );
    res.json({ success: true, data: result });
  } catch (err: any) {
    sendError(res, err);
  }
}

/** Starts AI generation of the quiz draft. Teacher-only. */
export async function generate(req: Request, res: Response) {
  try {
    const result = await quizzesService.requestQuizGeneration(
      req.params.id as string, req.user!.role
    );
    res.status(202).json({ success: true, data: result });
  } catch (err: any) {
    sendError(res, err);
  }
}

/** Saves edited quiz questions. Teacher-only. */
export async function updateQuestions(req: Request, res: Response) {
  try {
    const result = await quizzesService.updateQuizQuestions(
      req.params.id as string, req.body.questions
    );
    res.json({ success: true, data: result });
  } catch (err: any) {
    sendError(res, err);
  }
}

/** Publishes the quiz draft to students, or pulls it back. Teacher-only. */
export async function setPublished(req: Request, res: Response) {
  try {
    if (typeof req.body.published !== 'boolean') {
      res.status(400).json({ success: false, error: 'published must be a boolean' });
      return;
    }
    const result = await quizzesService.setQuizPublished(
      req.params.id as string, req.body.published
    );
    res.json({ success: true, data: result });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function submitAttempt(req: Request, res: Response) {
  try {
    const result = await quizzesService.submitQuizAttempt(
      req.params.id as string, req.user!.userId, req.user!.role, req.body.answers
    );
    res.json({ success: true, data: result });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function getResults(req: Request, res: Response) {
  try {
    const data = await quizzesService.getQuizResults(req.params.id as string);
    res.json({ success: true, data });
  } catch (err: any) {
    sendError(res, err);
  }
}
