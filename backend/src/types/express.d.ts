import 'express';

declare module 'express-serve-static-core' {
  interface Request {
    user?: { userId: string; role: string; mustChangePassword?: boolean };
    file?: Express.Multer.File;
  }
}
