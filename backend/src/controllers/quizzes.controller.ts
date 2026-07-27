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

