import { Router } from 'express';
import multer from 'multer';
import { verifyAccessTokenMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import * as groupsController from '../controllers/groups.controller';

const upload = multer({ storage: multer.memoryStorage() });

const router = Router();
router.use(verifyAccessTokenMiddleware, requireRole('ADMIN'));

router.get('/', groupsController.getGroups);
router.post('/', groupsController.createGroup);
// Must come before '/:id' or it would be swallowed as an id param.
router.get('/import-template', groupsController.downloadImportTemplate);
router.get('/:id', groupsController.getGroup);
router.put('/:id', groupsController.updateGroup);
router.delete('/:id', groupsController.deleteGroup);
router.post('/:id/students', groupsController.addStudent);
router.post('/:id/students/remove-bulk', groupsController.removeStudents);
router.put('/:id/students/:studentId', groupsController.updateStudent);
router.delete('/:id/students/:studentId', groupsController.removeStudent);
// upload.single('file') is what populates req.file — without it the controller
// always saw an empty body and answered 400 "No file uploaded".
router.post('/:id/import', upload.single('file'), groupsController.importStudents);
router.post('/:id/reset-password/:studentId', groupsController.resetPassword);

export default router;
