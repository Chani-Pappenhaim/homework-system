import { Router } from 'express';
import multer from 'multer';
import { verifyAccessTokenMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import * as assignmentsController from '../controllers/assignments.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
router.use(verifyAccessTokenMiddleware);

router.get('/:lessonId/assignments', assignmentsController.getAssignments);
router.post('/:lessonId/assignments', requireRole('ADMIN'), assignmentsController.createAssignment);
router.put('/:id', requireRole('ADMIN'), assignmentsController.updateAssignment);
router.delete('/:id', requireRole('ADMIN'), assignmentsController.deleteAssignment);
// upload.single('file') populates req.file — without it importAssignments always
// saw an empty body and answered 400 "No file uploaded" (same fix as groups import).
router.post('/import', requireRole('ADMIN'), upload.single('file'), assignmentsController.importAssignments);
router.get('/:id/submissions', requireRole('ADMIN'), assignmentsController.getSubmissions);

export default router;
