import { Router } from 'express';
import { verifyAccessTokenMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { aiRateLimit } from '../middleware/rateLimit';
import * as submissionsController from '../controllers/submissions.controller';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();
router.use(verifyAccessTokenMiddleware);

router.post('/import', requireRole('ADMIN'), upload.single('file'), submissionsController.importSubmissions);
router.post('/:id/submit', requireRole('STUDENT'), upload.single('file'), submissionsController.submit);
// Enqueues a billable Gemini review
router.post('/:id/request-ai-review', aiRateLimit, requireRole('STUDENT'), submissionsController.requestAiReview);
router.post('/:id/approve-ai', requireRole('ADMIN'), submissionsController.approveAiReview);
router.post('/:id/allow-extra-ai', requireRole('ADMIN'), submissionsController.allowExtraAiReview);
router.post('/:id/restore-ai-score', requireRole('ADMIN'), submissionsController.restoreAiScore);
router.get('/mine', submissionsController.mySubmissions);
router.get('/:id', submissionsController.getSubmission);

export default router;
