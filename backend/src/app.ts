import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import { generalRateLimit } from './middleware/rateLimit';
import { configurePassport } from './config/passport';
import { GENERIC_SERVER_ERROR } from './utils/http';

import authRoutes from './routes/auth.routes';
import groupRoutes from './routes/groups.routes';
import courseRoutes from './routes/courses.routes';
import lessonRoutes from './routes/lessons.routes';
import assignmentRoutes from './routes/assignments.routes';
import submissionRoutes from './routes/submissions.routes';
import gradeRoutes from './routes/grades.routes';
import quizRoutes from './routes/quizzes.routes';
import messageRoutes from './routes/messages.routes';
import aiUsageRoutes from './routes/ai-usage.routes';
import studentRoutes from './routes/students.routes';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1); // nginx reverse proxy
  app.use(helmet());
  app.use(cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  }));
  app.use(express.json());
  app.use(cookieParser());

  // Lightweight liveness probe — no auth, no DB — so an external keep-alive
  // pinger (and the client's warm-up call) can wake a spun-down free-tier
  // instance and confirm it's up without doing any real work. Kept before the
  // rate limiter so frequent pings are never throttled.
  app.get('/api/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok', uptime: process.uptime() } });
  });

  app.use(generalRateLimit);

  configurePassport(passport);
  app.use(passport.initialize());

  app.use('/api/auth', authRoutes);
  app.use('/api/groups', groupRoutes);
  app.use('/api/courses', courseRoutes);
  app.use('/api/courses', lessonRoutes);
  app.use('/api/lessons', lessonRoutes);
  app.use('/api/lessons', assignmentRoutes);
  app.use('/api/assignments', assignmentRoutes);
  app.use('/api/assignments', submissionRoutes);
  app.use('/api/submissions', submissionRoutes);
  app.use('/api/submissions', gradeRoutes);
  app.use('/api/grades', gradeRoutes);
  app.use('/api/lessons', quizRoutes);
  app.use('/api/messages', messageRoutes);
  app.use('/api/ai-usage', aiUsageRoutes);
  app.use('/api/students', studentRoutes);

  // Safety net: anything that escapes a controller's try/catch (or is thrown
  // synchronously by a route) lands here. Log the real error, return a generic
  // message so no internal detail (DB, keys, stack) ever reaches the client.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[unhandled]', err);
    if (res.headersSent) return;
    res.status(500).json({ success: false, error: GENERIC_SERVER_ERROR });
  });

  return app;
}
