import { Router } from 'express';
import { verifyAccessTokenMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import * as studentsController from '../controllers/students.controller';

const router = Router();
router.use(verifyAccessTokenMiddleware, requireRole('ADMIN'));

router.get('/', (req, res) => {
  if (req.query.email !== undefined) {
    return studentsController.findByEmail(req, res);
  }
  return studentsController.searchStudents(req, res);
});

router.get('/overview', studentsController.overview);
router.get('/:id/profile', studentsController.profile);
router.post('/', studentsController.createStudent);

export default router;
