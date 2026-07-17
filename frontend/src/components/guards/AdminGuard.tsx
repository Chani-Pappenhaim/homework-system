import { Navigate } from 'react-router-dom';
import useAuthStore from '@/store/authStore';
import TeacherLayout from '@/components/Layout/TeacherLayout';
import FullPageSpinner from '@/components/ui/FullPageSpinner';

export default function AdminGuard() {
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);

  if (status === 'loading') return <FullPageSpinner />;
  if (user?.role !== 'ADMIN') return <Navigate to="/student" replace />;
  return <TeacherLayout />;
}
