import { Router } from 'express';
import { verifyAccessTokenMiddleware } from '../middleware/auth';
import { requireFile } from '../middleware/requireFile';
import { uploadImport } from '../middleware/upload';
import * as contentController from '../controllers/content.controller';

const router = Router();
router.use(verifyAccessTokenMiddleware);

// Fills a text field from a file: the editor sends the file, gets Markdown back.
router.post('/convert', uploadImport.single('file'), requireFile, contentController.convert);

export default router;
