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
router.get('/:id', groupsController.getGroup);
router.put('/:id', groupsController.updateGroup);
router.post('/:id/students', groupsController.addStudent);
router.delete('/:id/students/:studentId', groupsController.removeStudent);
// upload.single('file') is what populates req.file — without it the controller
// always saw an empty body and answered 400 "No file uploaded".
router.post('/:id/import', upload.single('file'), groupsController.importStudents);
router.post('/:id/reset-password/:studentId', groupsController.resetPassword);

export default router;
