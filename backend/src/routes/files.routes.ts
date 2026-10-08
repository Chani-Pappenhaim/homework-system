import { Router } from 'express';
import * as filesController from '../controllers/files.controller';

// Deliberately not behind verifyAccessTokenMiddleware — the file's own
// short-lived token (verified inside the controller) is the credential.
const router = Router();

// The trailing segment is cosmetic (`file.pptx`) — online Office viewers pick
// the format from the URL path, and a path without an extension makes them
// give up on the file.
router.get('/download/:fileId{/:name}', filesController.download);

export default router;
