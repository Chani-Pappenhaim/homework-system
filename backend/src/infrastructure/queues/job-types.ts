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
  'storage-alert': { email: string; name: string };
  'student-message': { messageId: string; studentName: string; studentEmail: string; content: string; assignmentTitle?: string };
  'teacher-reply': {
    messageId: string;
    studentEmail: string;
    studentName: string;
    originalContent: string;
    replyContent: string;
  };
  'deadline-report': {
    assignmentTitle: string;
    courseName: string;
    deadline?: string | Date | null;
    rows: DeadlineReportRow[];
  };
}

export type EmailJobName = keyof EmailJobMap;
export type EmailJobData = EmailJobMap[EmailJobName];

// ---- quiz queue ------------------------------------------------------------
export interface QuizJobData {
  lessonId: string;
  lessonContent: string;
}

// ---- ai-review queue -------------------------------------------------------
export interface AiReviewJobData {
  submissionId: string;
}

// ---- scheduled queues (no payload) ----------------------------------------
export type DeadlineJobData = Record<string, never>;
export type StorageJobData = Record<string, never>;
