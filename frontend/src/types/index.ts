export type Role = 'ADMIN' | 'STUDENT';

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
  githubUsername: string | null;
  /** Has she confirmed her address? Notification emails go only to verified ones. */
  emailVerified: boolean;
  emailNotifications: boolean;
  /** Link to her profile picture (see apiFileUrl), or null when she has none. */
  avatarUrl: string | null;
  groups: { id: string; name: string }[];
}

export interface GroupDTO {
  id: string;
  name: string;
  seminar?: string;
  year: string;
  /** Whether students added to the group start with notification emails on. */
  emailNotificationsDefault?: boolean;
  createdAt: string;
  studentCount: number;
  /** Sent with the groups list. */
  courseCount?: number;
}

export interface GroupDetailDTO extends GroupDTO {
  students: {
    id: string; name: string; email: string; githubUsername?: string; createdAt: string;
    emailVerified?: boolean; emailNotifications?: boolean;
  }[];
  courses: { id: string; name: string; hidden: boolean; lessonCount: number }[];
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
  /** Teacher view only — hidden from students. */
  hidden?: boolean;
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
  /** Teacher view only — hidden from students. */
  hidden?: boolean;
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
  aiInstructions?: string | null;
  /** Off for exercises the teacher never wants an AI to check. Absent means on. */
  aiReviewEnabled?: boolean;
  /** A large exercise: the AI review reads more and larger code files. */
  aiReviewLarge?: boolean;
  /**
   * An exercise given in parts: the AI review reads a GitHub repo at aiGitToTag
   * (the latest commit when absent), with the changes since aiGitFromTag.
   * Students see them, since they create the tags.
   */
  aiGitFromTag?: string | null;
  aiGitToTag?: string | null;
  /** Kept from students: only the teacher ever receives a hidden assignment. */
  hidden?: boolean;
  /** Not mandatory: never counted as missing or late. */
  optional?: boolean;
  /** Teacher view only - the lesson files the AI review relies on. */
  aiReferenceFileIds?: string[];
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

export type QuizGenerationStage = 'queued' | 'reading-files' | 'generating' | 'saving' | 'retrying';

/** Why the previous attempt failed — the server maps the final one to a message itself. */
export type QuizFailureKind =
  | 'timeout' | 'rate-limit' | 'daily-quota' | 'unavailable' | 'config' | 'blocked' | 'bad-output' | 'no-content' | 'stuck' | 'unknown';

export interface QuizGenerationProgressDTO {
  stage: QuizGenerationStage;
  attempt: number;
  maxAttempts: number;
  withFiles: boolean;
  /** Since the teacher clicked, not since the current attempt began. */
  elapsedSeconds: number;
  lastFailure?: QuizFailureKind;
}

export type QuizSkipReason = 'unsupported' | 'too-large' | 'unreadable' | 'empty' | 'timeout' | 'too-many';

/** What the AI was given when the quiz was generated. null when it was given the lesson text only. */
export interface QuizSourceFilesDTO {
  included: string[];
  skipped: { name: string; reason: QuizSkipReason }[];
}

export type QuizRegenerationDTO =
  | { status: 'generating'; progress: QuizGenerationProgressDTO }
  | { status: 'failed'; message: string };

export interface QuizStateDTO {
  status: QuizStatus;
  message?: string;
  /** While status is 'generating'. */
  progress?: QuizGenerationProgressDTO;
  /** Teacher only: lesson files a generation with "include files" would leave out. */
  excludedFiles?: string[];
  /** Teacher only, on an unpublished draft: a new version being generated to replace it. */
  regeneration?: QuizRegenerationDTO | null;
  quiz?: {
    id: string;
    published: boolean;
    questionCount: number;
    questions: QuizQuestionDTO[];
    /** Teacher only. */
    sourceFiles?: QuizSourceFilesDTO | null;
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
  /** The teacher let the student delete or replace it after she checked it. */
  changesAllowed?: boolean;
  aiError?: string | null;
  grade: GradeDTO | null;
}

export interface MySubmission {
  submissionId: string;
  id: string;
  optional?: boolean;
  /** Why she can no longer delete it (the teacher checked it, a review is running); null when she can. */
  deleteBlockedReason?: string | null;
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
  aiError?: string | null;
  grade: GradeDTO | null;
}

export interface PendingAssignment {
  assignmentId: string;
  assignmentTitle: string;
  lessonId: string;
  lessonTopic: string;
  courseName: string;
  deadline?: string;
  /** Not mandatory: handing it in is up to her. */
  optional?: boolean;
}

export interface ReportRow {
  submissionId: string;
  lessonId: string;
  assignmentId: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  groupName: string;
  courseName: string;
  lessonTopic: string;
  assignmentTitle: string;
  deadline?: string;
  submittedAt: string;
  isLate: boolean;
  /** An AI review of the submission finished. */
  aiReviewed?: boolean;
  submissionScore?: number | null;
  contentScore?: number | null;
  feedback?: string;
  checklist?: ChecklistResult[];
}

export type ThreadAudience = 'DIRECT' | 'GROUP_VISIBLE' | 'GROUP_BCC';

export interface ReactionDTO {
  emoji: string;
  count: number;
  mine: boolean;
  names: string[];
}

export interface MessageEntryDTO {
  id: string;
  fromTeacher: boolean;
  /** Written by the viewer herself. */
  mine: boolean;
  /** The writing student's name, when the viewer may know it. */
  authorName: string | null;
  /** Seen only by the teacher and one student. */
  isPrivate: boolean;
  /** Which student a private entry is for; told to the teacher only. */
  privateToStudentId: string | null;
  content: string;
  isRead: boolean;
  createdAt: string;
  reactions: ReactionDTO[];
}

interface ThreadHeaderDTO {
  id: string;
  audience: ThreadAudience;
  subject: string | null;
  groupId: string | null;
  groupName: string | null;
  assignmentId: string | null;
  createdAt: string;
  participantCount: number;
  /** The one student of a direct thread, for the teacher. */
  student?: { id: string; name: string; email: string };
}

/** A row of the inbox list. */
export interface MessageDTO extends ThreadHeaderDTO {
  replyCount: number;
  unreadCount: number;
  unread: boolean;
  lastEntry: MessageEntryDTO | null;
}

/** An opened thread, with every entry the viewer may see. */
export interface MessageDetailDTO extends ThreadHeaderDTO {
  /** Null when the viewer may not know who else got the message. */
  participants: { id: string; name: string; email?: string }[] | null;
  replyCount: number;
  unread: boolean;
  entries: MessageEntryDTO[];
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
