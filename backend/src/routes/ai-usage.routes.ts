import { Router } from 'express';
import { verifyAccessTokenMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import * as aiUsageController from '../controllers/ai-usage.controller';

const router = Router();
router.use(verifyAccessTokenMiddleware);

router.get('/summary', requireRole('ADMIN'), aiUsageController.getSummary);
router.get('/storage', requireRole('ADMIN'), aiUsageController.getStorage);
// Any signed-in user: the student pages grey out their AI buttons from it.
router.get('/availability', aiUsageController.getAvailability);
router.put('/settings', requireRole('ADMIN'), aiUsageController.updateSettings);

export default router;
