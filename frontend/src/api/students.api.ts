import api from './axios';
import type { StudentSummary } from '@/types';
import type { AttendanceStatus } from './attendance.api';

export interface StudentSearchResult {
  id: string;
  name: string;
  email: string;
  groupNames: string[];
}

/** One row of the teacher's students page. */
export interface StudentOverview {
  id: string;
  name: string;
  email: string;
  githubUsername: string | null;
  groupNames: string[];
  assignments: { total: number; submitted: number; late: number; missing: number };
  averageContentScore: number | null;
  attendance: { present: number; absent: number; excused: number; rate: number | null };
  unreadMessages: number;
}

export interface StudentProfile {
  student: {
    id: string;
    name: string;
    email: string;
    githubUsername: string | null;
    createdAt: string;
    emailVerified: boolean;
    groupNames: string[];
    extraCourses: string[];
    extraLessons: string[];
  };
  work: Array<{
    assignmentId: string;
    title: string;
    lessonId: string;
    lessonTopic: string;
    courseName: string;
    deadline: string | null;
    overdue: boolean;
    submission: {
      id: string;
      submittedAt: string;
      isLate: boolean;
      githubUrl: string | null;
      fileName: string | null;
      aiStatus: string;
      submissionScore: number | null;
      contentScore: number | null;
      contentApproved: boolean;
    } | null;
  }>;
  attendance: Array<{
    courseId: string;
    courseName: string;
    summary: { present: number; absent: number; excused: number; sessions: number; rate: number | null };
    sessions: Array<{ id: string; date: string; title: string | null; status: AttendanceStatus | null; note: string | null }>;
  }>;
  quizzes: Array<{
    quizId: string;
    lessonTopic: string;
    courseName: string;
    officialScore: number | null;
    bestScore: number;
    attempts: number;
    takenAt: string;
  }>;
  messages: Array<{
    id: string;
    assignmentTitle: string | null;
    lastAt: string;
    lastFromTeacher: boolean;
    preview: string;
    unread: number;
    entries: number;
  }>;
}

export const studentsApi = {
  findByEmail: (email: string) =>
    api.get<{ success: true; data: { student: StudentSummary | null } }>('/students', { params: { email } }),
  search: (query: string) =>
    api.get<{ success: true; data: { students: StudentSearchResult[] } }>('/students', { params: { search: query } }),
  /** A student with no group, for private lessons or a single course. */
  create: (data: { name: string; email: string; githubUsername?: string }) =>
    api.post<{ success: true; data: { student: StudentSummary } }>('/students', data),
  overview: () =>
    api.get<{ success: true; data: { students: StudentOverview[] } }>('/students/overview'),
  profile: (id: string) =>
    api.get<{ success: true; data: StudentProfile }>(`/students/${id}/profile`),
};
