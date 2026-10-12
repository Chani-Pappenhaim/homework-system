import type { GeminiFailureKind } from '../../services/gemini.service';

// Typed payloads for every BullMQ job. Keeping these next to the queue
// definitions lets producers (controllers/services) and consumers (workers)
// share one contract instead of passing untyped `any` job data.

// ---- email queue -----------------------------------------------------------
// One queue carries several kinds of email; the job name is the discriminant.
export interface DeadlineReportRow {
  name: string;
  status: 'submitted' | 'late' | 'missing';
  submittedAt?: string | Date;
}

export interface EmailJobMap {
  'reset-password': { email: string; name: string };
  'forgot-password-link': { email: string; name: string; resetUrl: string };
  'verify-email': { email: string; name: string; verifyUrl: string };
  'storage-alert': { email: string; name: string };
  'student-message': { messageId: string; studentName: string; studentEmail: string; content: string; assignmentTitle?: string };
  'teacher-reply': {
    messageId: string;
    studentEmail: string;
    studentName: string;
    originalContent: string;
    replyContent: string;
  };
  'teacher-message': { messageId: string; studentName: string; studentEmail: string; content: string };
  'student-reply': {
    messageId: string;
    studentName: string;
    studentEmail: string;
    originalContent: string;
    replyContent: string;
  };
  'deadline-report': {
    assignmentTitle: string;
    courseName: string;
    deadline?: string | Date | null;
    rows: DeadlineReportRow[];
  };
  'grade-approved': {
    submissionId: string;
    studentEmail: string;
    studentName: string;
    assignmentTitle: string;
    contentScore: number;
  };
}

export type EmailJobName = keyof EmailJobMap;
export type EmailJobData = EmailJobMap[EmailJobName];

// ---- quiz queue ------------------------------------------------------------
export interface QuizJobData {
  lessonId: string;
  /** Feed the lesson's attached files to the AI alongside the lesson text. */
  includeFiles?: boolean;
  /**
   * Replace the lesson's existing draft. The old questions stay until the new
   * ones are ready, and a draft published meanwhile is never replaced.
   */
  replace?: boolean;
}

/** Stored on Quiz.sourceFiles — what the teacher is told the quiz was built from. */
export interface QuizSourceFiles {
  included: string[];
  skipped: { name: string; reason: string }[];
}

/** Where a generation job stands, as the teacher's page displays it. */
export type QuizGenerationStage = 'queued' | 'reading-files' | 'generating' | 'saving' | 'retrying';

/** Why a generation attempt failed — mapped to a user-facing message by the service. */
export type QuizFailureKind = GeminiFailureKind | 'no-content' | 'stuck' | 'unknown';

/**
 * Stored on the job with job.updateProgress(). `at` is when the stage began, so
 * a job that stops reporting can be told apart from one that is merely slow.
 */
export interface QuizJobProgress {
  stage: QuizGenerationStage;
  at: number;
  lastFailure?: QuizFailureKind;
}

// ---- ai-review queue -------------------------------------------------------
export interface AiReviewJobData {
  submissionId: string;
  /** Run by the teacher — doesn't use up the student's own review attempts. */
  byTeacher?: boolean;
}
