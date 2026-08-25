import { Router } from 'express';
import multer from 'multer';
import { verifyAccessTokenMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import * as assignmentsController from '../controllers/assignments.controller';
import { requireFile } from '../middleware/requireFile';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
router.use(verifyAccessTokenMiddleware);

router.get('/:lessonId/assignments', assignmentsController.getAssignments);
router.post('/:lessonId/assignments', requireRole('ADMIN'), assignmentsController.createAssignment);
router.put('/:id', requireRole('ADMIN'), assignmentsController.updateAssignment);
router.delete('/:id', requireRole('ADMIN'), assignmentsController.deleteAssignment);
// upload.single('file') must run before requireFile so req.file is populated.
router.post('/import', requireRole('ADMIN'), upload.single('file'), requireFile, assignmentsController.importAssignments);
router.get('/:id/submissions', requireRole('ADMIN'), assignmentsController.getSubmissions);

export default router;
