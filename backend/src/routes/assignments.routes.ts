import { Router } from 'express';
import { verifyAccessTokenMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import * as assignmentsController from '../controllers/assignments.controller';
import * as submissionsController from '../controllers/submissions.controller';
import { requireFile } from '../middleware/requireFile';
import { uploadImport as upload } from '../middleware/upload';

const router = Router();
router.use(verifyAccessTokenMiddleware);

router.get('/:lessonId/assignments', assignmentsController.getAssignments);
router.post('/:lessonId/assignments', requireRole('ADMIN'), assignmentsController.createAssignment);
router.put('/:id', requireRole('ADMIN'), assignmentsController.updateAssignment);
router.delete('/:id', requireRole('ADMIN'), assignmentsController.deleteAssignment);
// upload.single('file') must run before requireFile so req.file is populated.
router.post('/import', requireRole('ADMIN'), upload.single('file'), requireFile, assignmentsController.importAssignments);
router.get('/:id/submissions', requireRole('ADMIN'), assignmentsController.getSubmissions);
// One assignment's submissions from a sheet listing the course's students.
router.get('/:id/submissions/import-template', requireRole('ADMIN'), submissionsController.downloadAssignmentImportTemplate);
router.post('/:id/submissions/import', requireRole('ADMIN'), upload.single('file'), requireFile, submissionsController.importAssignmentSubmissions);

export default router;
