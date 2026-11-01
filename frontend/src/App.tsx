import { Suspense, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { CourseByName, LessonById, LessonByNumber } from '@/components/lesson/LessonRoute';
import ErrorBoundary from '@/components/ErrorBoundary';
import { UpdateNotice } from '@/components/UpdateNotice';
import { useNewVersionAvailable } from '@/lib/appVersion';
import { useBackNavigationTracker } from '@/lib/backNavigation';
import { useScrollToTopOnNavigate } from '@/lib/scrollOnNavigate';
import AuthGuard from '@/components/guards/AuthGuard';
import AdminGuard from '@/components/guards/AdminGuard';
import ChangePasswordGuard from '@/components/guards/ChangePasswordGuard';
import StudentGuard from '@/components/guards/StudentGuard';

import LoginPage from '@/pages/auth/LoginPage';
import {
  ChangePasswordPage, OAuthCallbackPage, ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage,
  TeacherHomePage, GroupsPage, GroupDetailPage, GroupFormPage, CoursesPage, CourseFormPage,
  CourseDetailPage, LessonDetailPage, TeacherQuizPage, ReportsPage, TeacherMessagesPage,
  AiUsagePage, TeacherSettingsPage, StudentsPage, StudentDetailPage,
  StudentHomePage, StudentCoursesPage, StudentCourseDetailPage, StudentLessonDetailPage,
  AssignmentsPage, StudentAttendancePage, QuizPage, StudentMessagesPage, ProfilePage,
} from '@/lib/pages';
import { FullPageSpinner } from '@/components/ui/full-page-spinner';

function AppRoutes() {
  const location = useLocation();
  useBackNavigationTracker();
  useScrollToTopOnNavigate();
  const newVersion = useNewVersionAvailable();

  // Moving to another page is a safe moment to switch to the new build: nothing
  // typed on the page being left is lost. The note is shown meanwhile.
  const lastPath = useRef(location.pathname);
  useEffect(() => {
    const moved = location.pathname !== lastPath.current;
    lastPath.current = location.pathname;
    if (newVersion && moved) window.location.reload();
  }, [newVersion, location.pathname]);

  return (
    <ErrorBoundary resetKey={location.pathname}>
      {newVersion && <UpdateNotice />}
      <Suspense fallback={<FullPageSpinner />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/auth/callback" element={<OAuthCallbackPage />} />

        <Route path="/change-password" element={
          <AuthGuard><ChangePasswordPage /></AuthGuard>
        } />

        <Route path="/teacher" element={
          <AuthGuard><ChangePasswordGuard><AdminGuard /></ChangePasswordGuard></AuthGuard>
        }>
          <Route index element={<TeacherHomePage />} />
          <Route path="groups" element={<GroupsPage />} />
          <Route path="groups/new" element={<GroupFormPage />} />
          <Route path="groups/:id" element={<GroupDetailPage />} />
          <Route path="groups/:id/edit" element={<GroupFormPage />} />
          <Route path="courses" element={<CoursesPage />} />
          <Route path="courses/new" element={<CourseFormPage />} />
          <Route path="courses/:courseId/edit" element={<CourseByName area="teacher" page={CourseFormPage} />} />
          <Route path="courses/:courseId" element={<CourseByName area="teacher" page={CourseDetailPage} />} />
          <Route path="courses/:courseId/lessons/:lessonNumber" element={<LessonByNumber area="teacher" page={LessonDetailPage} />} />
          <Route path="lessons/:id" element={<LessonById area="teacher" page={LessonDetailPage} />} />
          {/* Mirrors the student quiz route so the same lesson quiz is reachable from either role */}
          <Route path="quiz/:lessonId" element={<TeacherQuizPage />} />
          <Route path="students" element={<StudentsPage />} />
          <Route path="students/:id" element={<StudentDetailPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="messages" element={<TeacherMessagesPage />} />
          <Route path="ai-usage" element={<AiUsagePage />} />
          <Route path="settings" element={<TeacherSettingsPage />} />
        </Route>

        <Route path="/student" element={
          <AuthGuard><ChangePasswordGuard><StudentGuard /></ChangePasswordGuard></AuthGuard>
        }>
          <Route index element={<StudentHomePage />} />
          <Route path="courses" element={<StudentCoursesPage />} />
          <Route path="courses/:courseId" element={<CourseByName area="student" page={StudentCourseDetailPage} />} />
          <Route path="courses/:courseId/lessons/:lessonNumber" element={<LessonByNumber area="student" page={StudentLessonDetailPage} />} />
          <Route path="lessons/:id" element={<LessonById area="student" page={StudentLessonDetailPage} />} />
          <Route path="assignments" element={<AssignmentsPage />} />
          <Route path="attendance" element={<StudentAttendancePage />} />
          <Route path="quiz/:lessonId" element={<QuizPage />} />
          <Route path="messages" element={<StudentMessagesPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>

        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
