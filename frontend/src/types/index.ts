export type Role = 'ADMIN' | 'STUDENT';

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
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
  sizeBytes?: string;
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
  githubUrl?: string;
  hidden: boolean;
  order: number;
  courseId: string;
  files: LessonFile[];
  assignments: AssignmentDTO[];
}

export interface GradeDTO {
  score?: number;
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
  lessonTopic: string;
  courseName: string;
  deadline?: string;
}

export interface ReportRow {
  studentName: string;
  studentEmail: string;
  groupName: string;
  courseName: string;
  lessonTopic: string;
  assignmentTitle: string;
  deadline?: string;
  submittedAt: string;
  isLate: boolean;
  score?: number;
  feedback?: string;
  checklist?: ChecklistResult[];
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex?: number;
}

export interface QuizDTO {
  id: string;
  questions: QuizQuestion[];
}

export interface QuizAttemptResult {
  score: number;
  correct: number;
  total: number;
}

export interface ApiResponse<T> {
  success: true;
  data: T;
}
