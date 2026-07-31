import { Router } from 'express';
import { verifyAccessTokenMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import * as studentsController from '../controllers/students.controller';

const router = Router();
router.use(verifyAccessTokenMiddleware, requireRole('ADMIN'));

router.get('/', studentsController.searchStudents);

export default router;
