import { Router } from 'express';
import { verifyAccessTokenMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import * as siteController from '../controllers/site.controller';

const router = Router();

// Public: the names are shown on the sign-in page too.
router.get('/', siteController.getSiteNames);
router.put('/', verifyAccessTokenMiddleware, requireRole('ADMIN'), siteController.updateSiteNames);

export default router;
