import { Navigate, Outlet } from 'react-router-dom';
import useAuthStore from '@/store/authStore';
import TeacherLayout from '@/components/Layout/TeacherLayout';

export default function AdminGuard() {
  const user = useAuthStore((s) => s.user);
  if (user?.role !== 'ADMIN') return <Navigate to="/student" replace />;
  return <TeacherLayout />;
}
