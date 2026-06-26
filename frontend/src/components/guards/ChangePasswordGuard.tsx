import { Navigate, Outlet } from 'react-router-dom';
import useAuthStore from '@/store/authStore';
import StudentLayout from '@/components/Layout/StudentLayout';

interface Props { children?: React.ReactNode }

export default function ChangePasswordGuard({ children }: Props) {
  const user = useAuthStore((s) => s.user);

  if (user?.mustChangePassword) return <Navigate to="/change-password" replace />;

  if (children) return <>{children}</>;

  return user?.role === 'STUDENT' ? <StudentLayout /> : <Outlet />;
}
