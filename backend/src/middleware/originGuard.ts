import { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Refuses state-changing requests sent by a page other than the app itself.
 *
 * CORS only stops a foreign page from reading the response; the request still
 * arrives, carrying the refresh cookie (SameSite=None in production). Browsers
 * always attach an Origin header to cross-origin and non-GET requests — a
 * sandboxed frame sends "null" — so anything that names a different origin is
 * turned away. Requests with no Origin at all (server-to-server, curl, tests)
 * can't carry a victim's cookie and pass through.
 */
export function originGuard(allowedOrigin: string | undefined) {
  const allowed = allowedOrigin?.replace(/\/+$/, '');
  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;
    if (SAFE_METHODS.has(req.method) || !origin || !allowed || origin === allowed) {
      next();
      return;
    }
    res.status(403).json({ success: false, error: 'הבקשה נחסמה: היא לא נשלחה מתוך האתר.' });
  };
}
