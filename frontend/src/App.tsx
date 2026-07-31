import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import ErrorBoundary from '@/components/ErrorBoundary';
import AuthGuard from '@/components/guards/AuthGuard';
import AdminGuard from '@/components/guards/AdminGuard';
import ChangePasswordGuard from '@/components/guards/ChangePasswordGuard';

import LoginPage from '@/pages/auth/LoginPage';
import ChangePasswordPage from '@/pages/auth/ChangePasswordPage';
import OAuthCallbackPage from '@/pages/auth/OAuthCallbackPage';
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage';
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage';

import TeacherHomePage from '@/pages/teacher/HomePage';
import GroupsPage from '@/pages/teacher/GroupsPage';
import GroupDetailPage from '@/pages/teacher/GroupDetailPage';
import GroupFormPage from '@/pages/teacher/GroupFormPage';
import CoursesPage from '@/pages/teacher/CoursesPage';
import CourseFormPage from '@/pages/teacher/CourseFormPage';
import CourseDetailPage from '@/pages/teacher/CourseDetailPage';
import LessonDetailPage from '@/pages/teacher/LessonDetailPage';
import ReportsPage from '@/pages/teacher/ReportsPage';
import TeacherMessagesPage from '@/pages/teacher/MessagesPage';
import AiUsagePage from '@/pages/teacher/AiUsagePage';

import StudentHomePage from '@/pages/student/HomePage';
import StudentCourseDetailPage from '@/pages/student/CourseDetailPage';
import StudentLessonDetailPage from '@/pages/student/LessonDetailPage';
import AssignmentsPage from '@/pages/student/AssignmentsPage';
import QuizPage from '@/pages/student/QuizPage';
import StudentMessagesPage from '@/pages/student/MessagesPage';

function AppRoutes() {
  const location = useLocation();
  return (
    <ErrorBoundary key={location.pathname}>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/auth/callback" element={<OAuthCallbackPage />} />

        {/* Must change password */}
        <Route path="/change-password" element={
          <AuthGuard><ChangePasswordPage /></AuthGuard>
        } />

        {/* Teacher routes */}
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
          <Route path="courses/:id/edit" element={<CourseFormPage />} />
          <Route path="courses/:id" element={<CourseDetailPage />} />
          <Route path="lessons/:id" element={<LessonDetailPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="messages" element={<TeacherMessagesPage />} />
          <Route path="ai-usage" element={<AiUsagePage />} />
        </Route>

        {/* Student routes */}
        <Route path="/student" element={
          <AuthGuard><ChangePasswordGuard /></AuthGuard>
        }>
          <Route index element={<StudentHomePage />} />
          <Route path="courses/:id" element={<StudentCourseDetailPage />} />
          <Route path="lessons/:id" element={<StudentLessonDetailPage />} />
          <Route path="assignments" element={<AssignmentsPage />} />
          <Route path="quiz/:lessonId" element={<QuizPage />} />
          <Route path="messages" element={<StudentMessagesPage />} />
        </Route>

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
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
