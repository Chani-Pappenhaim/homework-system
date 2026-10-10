import { Router } from 'express';
import { verifyAccessTokenMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import * as coursesController from '../controllers/courses.controller';
import * as attendanceController from '../controllers/attendance.controller';
import { uploadAttachment as upload, uploadImport } from '../middleware/upload';
import { requireFile } from '../middleware/requireFile';

const router = Router();
router.use(verifyAccessTokenMiddleware);

router.get('/', coursesController.getCourses);
router.post('/', requireRole('ADMIN'), coursesController.createCourse);
router.get('/:id', coursesController.getCourse);
router.put('/:id', requireRole('ADMIN'), coursesController.updateCourse);
router.delete('/:id', requireRole('ADMIN'), coursesController.deleteCourse);
router.post('/:id/copy', requireRole('ADMIN'), coursesController.copyCourse);
router.post('/:id/links', requireRole('ADMIN'), coursesController.addLink);
router.delete('/:id/links/:linkId', requireRole('ADMIN'), coursesController.deleteLink);
router.post('/:id/files', requireRole('ADMIN'), upload.single('file'), coursesController.uploadFile);
// Signed Cloudinary params for a direct browser upload — see the matching
// comment on submissions.routes for why the file never touches this server.
router.post('/:id/upload-signature', requireRole('ADMIN'), coursesController.getUploadSignature);
router.delete('/:id/files/:fileId', requireRole('ADMIN'), coursesController.deleteFile);
router.patch('/:id/files/:fileId', requireRole('ADMIN'), coursesController.renameFile);
router.patch('/:id/files/:fileId/hidden', requireRole('ADMIN'), coursesController.setFileHidden);
router.get('/:id/access', requireRole('ADMIN'), coursesController.getAccess);
router.post('/:id/access', requireRole('ADMIN'), coursesController.grantAccess);
router.delete('/:id/access/:studentId', requireRole('ADMIN'), coursesController.revokeAccess);

router.get('/:id/attendance', requireRole('ADMIN'), attendanceController.getCourseAttendance);
router.get('/:id/attendance/template', requireRole('ADMIN'), attendanceController.downloadTemplate);
router.post('/:id/attendance/import', requireRole('ADMIN'), uploadImport.single('file'), requireFile, attendanceController.importAttendance);
router.post('/:id/attendance/sessions', requireRole('ADMIN'), attendanceController.createSession);
router.post('/:id/attendance/sessions/from-lessons', requireRole('ADMIN'), attendanceController.createSessionsFromLessons);
router.put('/:id/attendance/exclusions/:studentId', requireRole('ADMIN'), attendanceController.setExclusion);

export default router;
