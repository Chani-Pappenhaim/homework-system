import { Router } from 'express';
import { verifyAccessTokenMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import * as assignmentsController from '../controllers/assignments.controller';

const router = Router();
router.use(verifyAccessTokenMiddleware);

router.get('/:lessonId/assignments', assignmentsController.getAssignments);
router.post('/:lessonId/assignments', requireRole('ADMIN'), assignmentsController.createAssignment);
router.put('/:id', requireRole('ADMIN'), assignmentsController.updateAssignment);
router.delete('/:id', requireRole('ADMIN'), assignmentsController.deleteAssignment);
router.post('/import', requireRole('ADMIN'), assignmentsController.importAssignments);
router.get('/:id/submissions', requireRole('ADMIN'), assignmentsController.getSubmissions);

export default router;
