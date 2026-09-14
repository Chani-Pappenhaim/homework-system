import { Router } from 'express';
import { verifyAccessTokenMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { aiRateLimit } from '../middleware/rateLimit';
import { requireFile } from '../middleware/requireFile';
import * as submissionsController from '../controllers/submissions.controller';
import { uploadAttachment, uploadImport } from '../middleware/upload';

const router = Router();
router.use(verifyAccessTokenMiddleware);

router.post('/import', requireRole('ADMIN'), uploadImport.single('file'), requireFile, submissionsController.importSubmissions);
router.post('/:id/submit', requireRole('STUDENT'), uploadAttachment.single('file'), submissionsController.submit);
// Signed Cloudinary params for a video submission — the browser uploads directly
// from here, so the file's bytes never pass through this server's memory.
router.post('/:id/video-upload-signature', requireRole('STUDENT'), submissionsController.getVideoUploadSignature);
// Enqueues a billable Gemini review
router.post('/:id/request-ai-review', aiRateLimit, requireRole('STUDENT'), submissionsController.requestAiReview);
router.post('/:id/approve-ai', requireRole('ADMIN'), submissionsController.approveAiReview);
router.post('/:id/allow-extra-ai', requireRole('ADMIN'), submissionsController.allowExtraAiReview);
router.post('/:id/restore-ai-score', requireRole('ADMIN'), submissionsController.restoreAiScore);
router.post('/:id/approve-content', requireRole('ADMIN'), submissionsController.approveContentScore);
router.post('/bulk-approve-content', requireRole('ADMIN'), submissionsController.bulkApproveContentScore);
router.get('/mine', submissionsController.mySubmissions);
router.get('/:id', submissionsController.getSubmission);

export default router;
