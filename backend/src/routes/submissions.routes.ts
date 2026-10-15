import { Router } from 'express';
import { verifyAccessTokenMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { aiRateLimit } from '../middleware/rateLimit';
import { requireFile } from '../middleware/requireFile';
import * as submissionsController from '../controllers/submissions.controller';
import { uploadAttachment, uploadImport } from '../middleware/upload';

const router = Router();
router.use(verifyAccessTokenMiddleware);

router.get('/import-template', requireRole('ADMIN'), submissionsController.downloadImportTemplate);
router.post('/import', requireRole('ADMIN'), uploadImport.single('file'), requireFile, submissionsController.importSubmissions);
router.post('/:id/submit', requireRole('STUDENT'), uploadAttachment.single('file'), submissionsController.submit);
// Signed Cloudinary params for a video submission — the browser uploads directly
// from here, so the file's bytes never pass through this server's memory.
router.post('/:id/video-upload-signature', requireRole('STUDENT'), submissionsController.getVideoUploadSignature);
// Enqueues a billable Gemini review
router.post('/:id/request-ai-review', aiRateLimit, requireRole('STUDENT'), submissionsController.requestAiReview);
router.post('/:id/rerun-ai-review', aiRateLimit, requireRole('ADMIN'), submissionsController.rerunAiReview);
router.post('/:id/approve-ai', requireRole('ADMIN'), submissionsController.approveAiReview);
router.patch('/:id/ai-review', requireRole('ADMIN'), submissionsController.updateAiReview);
router.post('/:id/allow-extra-ai', requireRole('ADMIN'), submissionsController.allowExtraAiReview);
// Unlocks a checked submission so the student can delete or replace it.
router.post('/:id/allow-changes', requireRole('ADMIN'), submissionsController.setChangesAllowed);
router.post('/:id/restore-ai-score', requireRole('ADMIN'), submissionsController.restoreAiScore);
router.post('/:id/approve-content', requireRole('ADMIN'), submissionsController.approveContentScore);
router.post('/bulk-approve-content', requireRole('ADMIN'), submissionsController.bulkApproveContentScore);
router.get('/mine', submissionsController.mySubmissions);
router.get('/:id', submissionsController.getSubmission);
// The student deletes her own submission, so she can submit the assignment again.
router.delete('/:id', requireRole('STUDENT'), submissionsController.deleteMine);

export default router;
