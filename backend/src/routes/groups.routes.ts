import { Router } from 'express';
import { verifyAccessTokenMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import * as groupsController from '../controllers/groups.controller';
import { requireFile } from '../middleware/requireFile';
import { uploadImport as upload } from '../middleware/upload';

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
// upload.single('file') must run first so it populates req.file for requireFile.
router.post('/:id/import', upload.single('file'), requireFile, groupsController.importStudents);
router.post('/:id/reset-password/:studentId', groupsController.resetPassword);

export default router;
