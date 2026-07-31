import { Router, Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { authRateLimit } from '../middleware/rateLimit';
import { verifyAccessTokenMiddleware } from '../middleware/auth';
import * as authController from '../controllers/auth.controller';

const router = Router();

router.post('/login', authRateLimit, authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.post('/forgot-password', authRateLimit, authController.forgotPassword);
router.post('/reset-password', authRateLimit, authController.resetPasswordWithToken);
router.post('/change-password', verifyAccessTokenMiddleware, authController.changePassword);
router.get('/me', verifyAccessTokenMiddleware, authController.me);

// A rejected strategy (an email the teacher has not added) yields no user. Send
// the visitor back to the frontend login with a clear error instead of a silent
// bounce to a backend path that isn't a page.
function oauthCallbackHandler(strategy: 'github' | 'google') {
  return (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate(strategy, { session: false }, (err: unknown, user?: unknown) => {
      if (err) return next(err);
      if (!user) {
        return res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_unregistered`);
      }
      // req.user is typed as the JWT payload elsewhere; the OAuth flow puts the
      // full user here and oauthCallback reads it via `as any`, as before.
      req.user = user as any;
      return authController.oauthCallback(req, res).catch(next);
    })(req, res, next);
  };
}

router.get('/github', passport.authenticate('github', { session: false }));
router.get('/github/callback', oauthCallbackHandler('github'));

// prompt: 'select_account' forces Google's account chooser every time — without
// it, a rejected login (unregistered email) silently re-authenticates the same
// Google session on retry, making the "try again" button look broken.
router.get('/google', passport.authenticate('google', { session: false, scope: ['email', 'profile'], prompt: 'select_account' }));
router.get('/google/callback', oauthCallbackHandler('google'));

export default router;
