import { lazyPage } from '@/lib/lazyPage';

export const ChangePasswordPage = lazyPage(() => import('@/pages/auth/ChangePasswordPage'));
export const OAuthCallbackPage = lazyPage(() => import('@/pages/auth/OAuthCallbackPage'));
export const ForgotPasswordPage = lazyPage(() => import('@/pages/auth/ForgotPasswordPage'));
export const ResetPasswordPage = lazyPage(() => import('@/pages/auth/ResetPasswordPage'));
export const VerifyEmailPage = lazyPage(() => import('@/pages/auth/VerifyEmailPage'));

export const TeacherHomePage = lazyPage(() => import('@/pages/teacher/HomePage'));
export const GroupsPage = lazyPage(() => import('@/pages/teacher/GroupsPage'));
export const GroupDetailPage = lazyPage(() => import('@/pages/teacher/GroupDetailPage'));
export const GroupFormPage = lazyPage(() => import('@/pages/teacher/GroupFormPage'));
export const CoursesPage = lazyPage(() => import('@/pages/teacher/CoursesPage'));
export const CourseFormPage = lazyPage(() => import('@/pages/teacher/CourseFormPage'));
export const CourseDetailPage = lazyPage(() => import('@/pages/teacher/CourseDetailPage'));
export const LessonDetailPage = lazyPage(() => import('@/pages/teacher/LessonDetailPage'));
export const TeacherQuizPage = lazyPage(() => import('@/pages/teacher/QuizPage'));
export const ReportsPage = lazyPage(() => import('@/pages/teacher/ReportsPage'));
export const TeacherMessagesPage = lazyPage(() => import('@/pages/teacher/MessagesPage'));
export const AiUsagePage = lazyPage(() => import('@/pages/teacher/AiUsagePage'));
export const TeacherSettingsPage = lazyPage(() => import('@/pages/teacher/SettingsPage'));
export const StudentsPage = lazyPage(() => import('@/pages/teacher/StudentsPage'));
export const StudentDetailPage = lazyPage(() => import('@/pages/teacher/StudentDetailPage'));

export const StudentHomePage = lazyPage(() => import('@/pages/student/HomePage'));
export const StudentCoursesPage = lazyPage(() => import('@/pages/student/CoursesPage'));
export const StudentCourseDetailPage = lazyPage(() => import('@/pages/student/CourseDetailPage'));
export const StudentLessonDetailPage = lazyPage(() => import('@/pages/student/LessonDetailPage'));
export const AssignmentsPage = lazyPage(() => import('@/pages/student/AssignmentsPage'));
export const StudentAttendancePage = lazyPage(() => import('@/pages/student/AttendancePage'));
export const QuizPage = lazyPage(() => import('@/pages/student/QuizPage'));
export const StudentMessagesPage = lazyPage(() => import('@/pages/student/MessagesPage'));
export const ProfilePage = lazyPage(() => import('@/pages/student/ProfilePage'));

const PAGE_BY_PATH: Record<string, { preload: () => void }> = {
  '/teacher': TeacherHomePage,
  '/teacher/groups': GroupsPage,
  '/teacher/courses': CoursesPage,
  '/teacher/students': StudentsPage,
  '/teacher/reports': ReportsPage,
  '/teacher/messages': TeacherMessagesPage,
  '/teacher/ai-usage': AiUsagePage,
  '/teacher/settings': TeacherSettingsPage,
  '/student': StudentHomePage,
  '/student/courses': StudentCoursesPage,
  '/student/assignments': AssignmentsPage,
  '/student/attendance': StudentAttendancePage,
  '/student/messages': StudentMessagesPage,
  '/student/profile': ProfilePage,
};

/** Starts downloading the page behind a navigation link, if it has one. */
export function preloadPage(path: string) {
  PAGE_BY_PATH[path]?.preload();
}
