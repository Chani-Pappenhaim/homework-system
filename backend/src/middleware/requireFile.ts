import { Request, Response, NextFunction } from 'express';

/** Rejects the request with 400 unless multer's upload.single() already populated req.file. */
export function requireFile(req: Request, res: Response, next: NextFunction) {
  if (!req.file) {
    res.status(400).json({ success: false, error: 'No file uploaded' });
    return;
  }
  next();
}
