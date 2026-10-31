import 'express';

declare module 'express-serve-static-core' {
  interface Request {
    user?: { userId: string; role: string; mustChangePassword?: boolean; tokenVersion?: number };
    file?: Express.Multer.File;
  }
}
