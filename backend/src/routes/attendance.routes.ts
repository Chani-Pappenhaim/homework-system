import { Router } from 'express';
import { verifyAccessTokenMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import * as attendanceController from '../controllers/attendance.controller';

// Session- and homework-level routes. The course-level ones (overview, new
// session, import) live on courses.routes under /courses/:id/attendance.
const router = Router();
router.use(verifyAccessTokenMiddleware);

router.get('/me', requireRole('STUDENT'), attendanceController.getMyAttendance);

router.patch('/sessions/:id', requireRole('ADMIN'), attendanceController.updateSession);
router.delete('/sessions/:id', requireRole('ADMIN'), attendanceController.deleteSession);
router.put('/sessions/:id/records', requireRole('ADMIN'), attendanceController.saveRecords);
router.post('/sessions/:id/homework', requireRole('ADMIN'), attendanceController.addHomework);
router.patch('/homework/:id', requireRole('ADMIN'), attendanceController.renameHomework);
router.delete('/homework/:id', requireRole('ADMIN'), attendanceController.deleteHomework);
router.put('/homework/:id/marks', requireRole('ADMIN'), attendanceController.saveHomeworkMarks);

export default router;
