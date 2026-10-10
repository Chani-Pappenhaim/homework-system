import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';

// Routes a user with a temporary password may still call: enough to load her
// profile, replace the password and sign out.
const ALLOWED_BEFORE_PASSWORD_CHANGE = new Set(['/api/auth/me', '/api/auth/change-password', '/api/auth/logout']);

export function verifyAccessTokenMiddleware(req: Request, res: Response, next: NextFunction): void {
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
  next();
}
