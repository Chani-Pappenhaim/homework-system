import { Router } from 'express';
import { verifyAccessTokenMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import * as groupsController from '../controllers/groups.controller';

const router = Router();
router.use(verifyAccessTokenMiddleware, requireRole('ADMIN'));

router.get('/', groupsController.getGroups);
router.post('/', groupsController.createGroup);
router.get('/:id', groupsController.getGroup);
router.put('/:id', groupsController.updateGroup);
router.delete('/:id', groupsController.deleteGroup);
router.post('/:id/students', groupsController.addStudent);
router.delete('/:id/students/:studentId', groupsController.removeStudent);
router.post('/:id/import', groupsController.importStudents);
router.post('/:id/reset-password/:studentId', groupsController.resetPassword);

export default router;
