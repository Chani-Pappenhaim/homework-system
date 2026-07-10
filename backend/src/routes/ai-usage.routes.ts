import { Router } from 'express';
import { verifyAccessTokenMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import * as aiUsageController from '../controllers/ai-usage.controller';

const router = Router();
router.use(verifyAccessTokenMiddleware);

router.get('/summary', requireRole('ADMIN'), aiUsageController.getSummary);

export default router;
