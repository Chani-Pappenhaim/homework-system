import { Router } from 'express';
import { verifyAccessTokenMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import * as lessonsController from '../controllers/lessons.controller';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage() });

const router = Router();
router.use(verifyAccessTokenMiddleware);

router.get('/:courseId/lessons', lessonsController.getLessons);
router.post('/:courseId/lessons', requireRole('ADMIN'), lessonsController.createLesson);
router.get('/:id', lessonsController.getLesson);
router.put('/:id', requireRole('ADMIN'), lessonsController.updateLesson);
router.patch('/reorder', requireRole('ADMIN'), lessonsController.reorderLessons);
router.post('/:id/files', requireRole('ADMIN'), upload.single('file'), lessonsController.uploadFile);
router.delete('/:id/files/:fileId', requireRole('ADMIN'), lessonsController.deleteFile);
router.post('/:id/import-md', requireRole('ADMIN'), upload.single('file'), lessonsController.importMarkdown);
router.get('/:id/access', requireRole('ADMIN'), lessonsController.getLessonAccess);
router.post('/:id/access', requireRole('ADMIN'), lessonsController.grantLessonAccess);
router.delete('/:id/access/:studentId', requireRole('ADMIN'), lessonsController.revokeLessonAccess);

export default router;
