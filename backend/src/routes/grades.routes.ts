import { Router } from 'express';
import { verifyAccessTokenMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import * as gradesController from '../controllers/grades.controller';

const router = Router();
router.use(verifyAccessTokenMiddleware);

router.get('/late-penalty', requireRole('ADMIN'), gradesController.getLatePolicy);
router.put('/late-penalty', requireRole('ADMIN'), gradesController.updateLatePolicy);
router.post('/:id/grade', requireRole('ADMIN'), gradesController.gradeSubmission);
router.get('/report', requireRole('ADMIN'), gradesController.getReport);
router.get('/report/export', requireRole('ADMIN'), gradesController.exportReport);
router.get('/pending', requireRole('ADMIN'), gradesController.getPending);

export default router;
