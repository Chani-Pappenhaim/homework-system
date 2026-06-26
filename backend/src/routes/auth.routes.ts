import { Router } from 'express';
import passport from 'passport';
import { authRateLimit } from '../middleware/rateLimit';
import { verifyAccessTokenMiddleware } from '../middleware/auth';
import * as authController from '../controllers/auth.controller';

const router = Router();

router.post('/login', authRateLimit, authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.post('/change-password', verifyAccessTokenMiddleware, authController.changePassword);
router.get('/me', verifyAccessTokenMiddleware, authController.me);

router.get('/github', passport.authenticate('github', { session: false }));
router.get('/github/callback',
  passport.authenticate('github', { session: false, failureRedirect: '/login' }),
  authController.oauthCallback
);

router.get('/google', passport.authenticate('google', { session: false, scope: ['email', 'profile'] }));
router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login' }),
  authController.oauthCallback
);

export default router;
