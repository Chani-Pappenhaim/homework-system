import { Router } from 'express';
import { verifyAccessTokenMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import * as quizzesController from '../controllers/quizzes.controller';

const router = Router();
router.use(verifyAccessTokenMiddleware);

router.get('/:id/quiz', quizzesController.getQuiz);
router.post('/:id/quiz/attempt', requireRole('STUDENT'), quizzesController.submitAttempt);
router.get('/:id/quiz/results', requireRole('ADMIN'), quizzesController.getResults);

export default router;
