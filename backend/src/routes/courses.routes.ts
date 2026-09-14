import { Router } from 'express';
import { verifyAccessTokenMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import * as coursesController from '../controllers/courses.controller';
import { uploadAttachment as upload } from '../middleware/upload';

const router = Router();
router.use(verifyAccessTokenMiddleware);

router.get('/', coursesController.getCourses);
router.post('/', requireRole('ADMIN'), coursesController.createCourse);
router.get('/:id', coursesController.getCourse);
router.put('/:id', requireRole('ADMIN'), coursesController.updateCourse);
router.delete('/:id', requireRole('ADMIN'), coursesController.deleteCourse);
router.post('/:id/copy', requireRole('ADMIN'), coursesController.copyCourse);
router.post('/:id/links', requireRole('ADMIN'), coursesController.addLink);
router.delete('/:id/links/:linkId', requireRole('ADMIN'), coursesController.deleteLink);
router.post('/:id/files', requireRole('ADMIN'), upload.single('file'), coursesController.uploadFile);
// Signed Cloudinary params for a direct browser upload — see the matching
// comment on submissions.routes for why the file never touches this server.
router.post('/:id/upload-signature', requireRole('ADMIN'), coursesController.getUploadSignature);
router.delete('/:id/files/:fileId', requireRole('ADMIN'), coursesController.deleteFile);

export default router;
