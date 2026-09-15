export type Role = 'ADMIN' | 'STUDENT';

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
  groups: { id: string; name: string }[];
}

export interface GroupDTO {
  id: string;
  name: string;
  seminar?: string;
  year: string;
  createdAt: string;
  studentCount: number;
}

export interface GroupDetailDTO extends GroupDTO {
  students: { id: string; name: string; email: string; githubUsername?: string; createdAt: string }[];
  courses: { id: string; name: string }[];
}

export interface CourseDTO {
  id: string;
  name: string;
  year?: string;
  description?: string;
  imageUrl?: string;
  hidden: boolean;
  groupId: string;
  groupName?: string;
  lessonCount: number;
  completedLessons?: number;
  createdAt: string;
}

export interface CourseLink {
  id: string;
  label: string;
  url: string;
  order: number;
}

export interface CourseFile {
  id: string;
  name: string;
  url: string;
  extension?: string;
  sizeBytes?: string;
  uploadedAt: string;
}

export interface LessonSummary {
  id: string;
  topic: string;
  lessonDate?: string;
  hidden: boolean;
  order: number;
  assignmentCount?: number;
  completed?: boolean;
  /** Teacher view only: how many students in the course's group finished this lesson. */
  completedCount?: number;
  groupStudentCount?: number;
}

export interface CourseDetailDTO extends CourseDTO {
  links: CourseLink[];
  files: CourseFile[];
  lessons: LessonSummary[];
}

export interface LessonFile {
  id: string;
  name: string;
  url: string;
  extension?: string;
  sizeBytes?: string;
  required?: boolean;
  /** Present only in the student's view of a lesson — has she marked this file as seen? */
  viewed?: boolean;
}

export interface ChecklistItem {
  id: string;
  text: string;
}

export interface ChecklistResult {
  id: string;
  text: string;
  checked: boolean;
}

export interface AssignmentDTO {
  id: string;
  lessonId: string;
  title: string;
  description?: string;
  deadline?: string;
  allowedTypes: string[];
  allowGithub: boolean;
  allowFile: boolean;
  requirements?: ChecklistItem[];
  aiInstructions?: string;
}

export interface LessonDetailDTO {
  id: string;
  topic: string;
  lessonDate?: string;
  contentMd?: string;
  githubUrls: string[];
  hidden: boolean;
  order: number;
  courseId: string;
  completed?: boolean;
  files: LessonFile[];
  assignments: AssignmentDTO[];
  // For a student, `exists` reflects whether a quiz is available to take; an
  // unpublished draft is reported as false so its existence isn't revealed early.
  quiz?: { exists: boolean; published: boolean };
}

export interface QuizQuestionDTO {
  id: string;
  question: string;
  options: string[];
  /** Teacher-only — never sent to a student. */
  correctIndex?: number;
}

/**
 * Returned only by POST /quiz/attempt — the one response that includes correct
 * answers, since the student has already submitted and can now review results.
 */
export interface QuizReviewItemDTO {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  selectedIndex: number;
  isCorrect: boolean;
}

export interface QuizAttemptResultDTO {
  score: number;
  correct: number;
  total: number;
  review: QuizReviewItemDTO[];
  /** True only for the first attempt — the one that counts as the grade. */
  isOfficial: boolean;
}

export interface QuizAttemptHistoryItem {
  attemptNumber: number;
  score: number;
  takenAt: string;
  isOfficial: boolean;
}

export interface QuizAttemptHistoryDTO {
  attempts: QuizAttemptHistoryItem[];
}

/** Per-question class performance — teacher only. */
export interface QuizQuestionStatsDTO {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  /** How many attempts chose each option, by option index. */
  optionCounts: number[];
  unanswered: number;
  correctCount: number;
  /** null when nobody has answered yet — not 0, which would read as "all wrong". */
  correctRate: number | null;
}

export interface QuizResultsDTO {
  quiz: { id: string; createdAt: string; published: boolean; questionCount: number };
  summary: { attemptCount: number; averageScore: number | null };
  questions: QuizQuestionStatsDTO[];
  results: { studentName: string; studentEmail: string; score: number; takenAt: string }[];
}

export type QuizStatus = 'ready' | 'generating' | 'none' | 'unavailable' | 'failed';

export interface QuizStateDTO {
  status: QuizStatus;
  message?: string;
  quiz?: {
    id: string;
    published: boolean;
    questionCount: number;
    questions: QuizQuestionDTO[];
  };
}

export interface GradeDTO {
  submissionScore?: number | null;
  contentScore?: number | null;
  contentApproved?: boolean;
  feedback?: string;
  checklist?: ChecklistResult[];
  gradedAt: string;
}

export interface SubmissionDTO {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  fileUrl?: string;
  fileName?: string;
  githubUrl?: string;
  notes?: string;
  submittedAt: string;
  isLate: boolean;
  aiStatus?: string;
  aiScore?: number | null;
  aiApproved?: boolean;
  aiCodeReview?: string | null;
  aiVerbalReview?: string | null;
  aiExtraAllowed?: boolean;
  grade: GradeDTO | null;
}

export interface MySubmission {
  submissionId: string;
  id: string;
  assignmentId: string;
  assignmentTitle: string;
  lessonTopic: string;
  courseName: string;
  submittedAt: string;
  isLate: boolean;
  notes?: string;
  githubUrl?: string;
  fileUrl?: string;
  fileName?: string;
  aiStatus?: string;
  aiScore?: number | null;
  aiApproved?: boolean;
  aiVerbalReview?: string | null;
  aiCodeReview?: string | null;
  grade: GradeDTO | null;
}

export interface PendingAssignment {
  assignmentId: string;
  assignmentTitle: string;
  lessonId: string;
  lessonTopic: string;
  courseName: string;
  deadline?: string;
}

export interface ReportRow {
  submissionId: string;
  lessonId: string;
  assignmentId: string;
  studentName: string;
  studentEmail: string;
  groupName: string;
  courseName: string;
  lessonTopic: string;
  assignmentTitle: string;
  deadline?: string;
  submittedAt: string;
  isLate: boolean;
  submissionScore?: number | null;
  contentScore?: number | null;
  feedback?: string;
  checklist?: ChecklistResult[];
}

export interface MessageDTO {
  id: string;
  studentId: string;
  content: string;
  fromTeacher: boolean;
  assignmentId?: string | null;
  isRead: boolean;
  replyContent?: string | null;
  repliedAt?: string | null;
  replySeen: boolean;
  createdAt: string;
  student?: { id: string; name: string; email: string };
}

export interface StudentSummary {
  id: string;
  name: string;
  email: string;
}

export interface ApiResponse<T> {
  success: true;
  data: T;
}
