import { Router } from 'express';
import * as filesController from '../controllers/files.controller';

// Deliberately not behind verifyAccessTokenMiddleware — the file's own
// short-lived token (verified inside the controller) is the credential.
const router = Router();

router.get('/download/:fileId', filesController.download);

export default router;
