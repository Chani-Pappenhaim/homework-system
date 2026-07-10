import { Router } from 'express';
import { verifyAccessTokenMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import * as coursesController from '../controllers/courses.controller';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage() });

const router = Router();
router.use(verifyAccessTokenMiddleware);

router.get('/', coursesController.getCourses);
router.post('/', requireRole('ADMIN'), coursesController.createCourse);
router.get('/:id', coursesController.getCourse);
router.put('/:id', requireRole('ADMIN'), coursesController.updateCourse);
router.post('/:id/copy', requireRole('ADMIN'), coursesController.copyCourse);
router.post('/:id/links', requireRole('ADMIN'), coursesController.addLink);
router.delete('/:id/links/:linkId', requireRole('ADMIN'), coursesController.deleteLink);
router.post('/:id/files', requireRole('ADMIN'), upload.single('file'), coursesController.uploadFile);
router.delete('/:id/files/:fileId', requireRole('ADMIN'), coursesController.deleteFile);

export default router;
