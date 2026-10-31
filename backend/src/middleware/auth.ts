import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { isSessionCurrent, touchLastSeen } from '../services/session.service';

// Routes a user with a temporary password may still call: enough to load her
// profile, replace the password and sign out.
const ALLOWED_BEFORE_PASSWORD_CHANGE = new Set(['/api/auth/me', '/api/auth/change-password', '/api/auth/logout']);

/**
 * Lets through a request carrying a valid access token of a session that was
 * not signed out since, and records the user as active.
 */
export async function verifyAccessTokenMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'אינך מחובר. אנא התחברו מחדש.' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    req.user = verifyAccessToken(token);
  } catch {
    res.status(401).json({ success: false, error: 'החיבור פג תוקף. אנא התחברו מחדש.' });
    return;
  }
  if (req.user.mustChangePassword && !ALLOWED_BEFORE_PASSWORD_CHANGE.has(`${req.baseUrl}${req.path}`.replace(/\/+$/, ''))) {
    res.status(403).json({ success: false, error: 'יש להחליף את הסיסמה הזמנית לפני שממשיכים.' });
    return;
  }
  try {
    if (!(await isSessionCurrent(req.user.userId, req.user.tokenVersion))) {
      res.status(401).json({ success: false, error: 'החיבור נותק. אנא התחברו מחדש.' });
      return;
    }
  } catch (err) {
    next(err);
    return;
  }
  touchLastSeen(req.user.userId);
  next();
}
