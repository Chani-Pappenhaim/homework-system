import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import { generalRateLimit } from './middleware/rateLimit';
import { configurePassport } from './config/passport';

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

  return app;
}
