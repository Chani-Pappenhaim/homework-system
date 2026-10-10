import { Router } from 'express';
import { verifyAccessTokenMiddleware } from '../middleware/auth';
import * as filesController from '../controllers/files.controller';

// Downloads are deliberately not behind verifyAccessTokenMiddleware — the
// file's own short-lived token (verified inside the controller) is the credential.
const router = Router();

// The trailing segment is cosmetic (`file.pptx`) — online Office viewers pick
// the format from the URL path, and a path without an extension makes them
// give up on the file.
router.get('/download/:fileId{/:name}', filesController.download);

// The browser gives up on a direct upload it never registered (failed save,
// closed page). Only the caller's own still-pending upload is ever removed.
router.post('/discard-upload', verifyAccessTokenMiddleware, filesController.discardUpload);

export default router;
