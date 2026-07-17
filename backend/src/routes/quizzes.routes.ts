import { Router } from 'express';
import { verifyAccessTokenMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { aiRateLimit } from '../middleware/rateLimit';
import * as quizzesController from '../controllers/quizzes.controller';

const router = Router();
router.use(verifyAccessTokenMiddleware);

// Can enqueue a billable Claude generation when the lesson has no quiz yet
router.get('/:id/quiz', aiRateLimit, quizzesController.getQuiz);
router.post('/:id/quiz/attempt', requireRole('STUDENT'), quizzesController.submitAttempt);
router.get('/:id/quiz/results', requireRole('ADMIN'), quizzesController.getResults);

export default router;
