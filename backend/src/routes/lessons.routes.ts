import { Router } from 'express';
import { verifyAccessTokenMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import * as lessonsController from '../controllers/lessons.controller';
import { requireFile } from '../middleware/requireFile';
import { uploadAttachment as upload, uploadImport } from '../middleware/upload';

const router = Router();
router.use(verifyAccessTokenMiddleware);

router.get('/:courseId/lessons', lessonsController.getLessons);
router.post('/:courseId/lessons', requireRole('ADMIN'), lessonsController.createLesson);
router.get('/:id', lessonsController.getLesson);
router.post('/:id/progress', lessonsController.setProgress);
router.put('/:id', requireRole('ADMIN'), lessonsController.updateLesson);
router.delete('/:id', requireRole('ADMIN'), lessonsController.deleteLesson);
router.patch('/reorder', requireRole('ADMIN'), lessonsController.reorderLessons);
router.post('/:id/files', requireRole('ADMIN'), upload.single('file'), lessonsController.uploadFile);
// Signed Cloudinary params for a direct browser upload — see the matching
// comment on submissions.routes for why the file never touches this server.
router.post('/:id/upload-signature', requireRole('ADMIN'), lessonsController.getUploadSignature);
router.delete('/:id/files/:fileId', requireRole('ADMIN'), lessonsController.deleteFile);
router.patch('/:id/files/:fileId', requireRole('ADMIN'), lessonsController.renameFile);
router.patch('/:id/files/:fileId/required', requireRole('ADMIN'), lessonsController.setFileRequired);
router.post('/:id/files/:fileId/view', lessonsController.markFileViewed);
router.delete('/:id/files/:fileId/view', lessonsController.unmarkFileViewed);
router.post('/:id/import-md', requireRole('ADMIN'), uploadImport.single('file'), requireFile, lessonsController.importMarkdown);
router.get('/:id/access', requireRole('ADMIN'), lessonsController.getLessonAccess);
router.post('/:id/access', requireRole('ADMIN'), lessonsController.grantLessonAccess);
router.post('/:id/access/bulk', requireRole('ADMIN'), lessonsController.grantLessonAccessBulk);
router.delete('/:id/access/:studentId', requireRole('ADMIN'), lessonsController.revokeLessonAccess);

export default router;
