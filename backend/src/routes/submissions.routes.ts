import { Router } from 'express';
import { verifyAccessTokenMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import * as submissionsController from '../controllers/submissions.controller';

const router = Router();
router.use(verifyAccessTokenMiddleware);

router.post('/:id/submit', requireRole('STUDENT'), submissionsController.submit);
router.get('/mine', submissionsController.mySubmissions);
router.get('/:id', submissionsController.getSubmission);

export default router;
