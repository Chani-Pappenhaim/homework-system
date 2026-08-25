import { Router } from 'express';
import { verifyAccessTokenMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { aiRateLimit } from '../middleware/rateLimit';
import * as quizzesController from '../controllers/quizzes.controller';

const router = Router();
router.use(verifyAccessTokenMiddleware);

// Read-only for both roles; does not trigger generation or enqueue anything.
router.get('/:id/quiz', quizzesController.getQuiz);

// Teacher-owned lifecycle: generate a draft, edit it, publish it.
// Only the generate route can cause a paid Gemini call.
router.post('/:id/quiz/generate', requireRole('ADMIN'), aiRateLimit, quizzesController.generate);
router.put('/:id/quiz', requireRole('ADMIN'), quizzesController.updateQuestions);
router.patch('/:id/quiz/publish', requireRole('ADMIN'), quizzesController.setPublished);
router.get('/:id/quiz/results', requireRole('ADMIN'), quizzesController.getResults);

router.post('/:id/quiz/attempt', requireRole('STUDENT'), quizzesController.submitAttempt);

export default router;
