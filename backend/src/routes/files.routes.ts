import { Router } from 'express';
import { verifyAccessTokenMiddleware } from '../middleware/auth';
import * as filesController from '../controllers/files.controller';

// Downloads are deliberately not behind verifyAccessTokenMiddleware — a plain
// <a>/<img>/<iframe> can't send the Authorization header, so the controller
// checks the file's own short-lived token together with the session cookie.
const router = Router();

// The trailing segment is cosmetic (`file.pptx`) — online Office viewers pick
// the format from the URL path, and a path without an extension makes them
// give up on the file.
router.get('/download/:fileId{/:name}', filesController.download);

router.post('/viewer-link', verifyAccessTokenMiddleware, filesController.viewerLink);

// The browser gives up on a direct upload it never registered (failed save,
// closed page). Only the caller's own still-pending upload is ever removed.
router.post('/discard-upload', verifyAccessTokenMiddleware, filesController.discardUpload);

export default router;
