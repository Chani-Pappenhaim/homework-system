import { Request, Response } from 'express';
import * as quizzesService from '../services/quizzes.service';

export async function getQuiz(req: Request, res: Response) {
  try {
    const result = await quizzesService.getQuiz(req.params.id as string, req.user!.role);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

export async function submitAttempt(req: Request, res: Response) {
  try {
    const { quizId, answers } = req.body;
    const result = await quizzesService.submitQuizAttempt(quizId, req.user!.userId, answers);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

export async function getResults(req: Request, res: Response) {
  try {
    const data = await quizzesService.getQuizResults(req.params.id as string);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

