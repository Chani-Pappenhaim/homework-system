import { Router } from 'express';
import { verifyAccessTokenMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import * as lessonsController from '../controllers/lessons.controller';

const router = Router();
router.use(verifyAccessTokenMiddleware);

router.get('/:courseId/lessons', lessonsController.getLessons);
router.post('/:courseId/lessons', requireRole('ADMIN'), lessonsController.createLesson);
router.get('/:id', lessonsController.getLesson);
router.put('/:id', requireRole('ADMIN'), lessonsController.updateLesson);
router.patch('/reorder', requireRole('ADMIN'), lessonsController.reorderLessons);
router.post('/:id/files', requireRole('ADMIN'), lessonsController.uploadFile);
router.delete('/:id/files/:fileId', requireRole('ADMIN'), lessonsController.deleteFile);
router.post('/:id/import-md', requireRole('ADMIN'), lessonsController.importMarkdown);

export default router;
