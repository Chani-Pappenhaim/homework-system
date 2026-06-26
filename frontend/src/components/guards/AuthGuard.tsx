import { Navigate, Outlet } from 'react-router-dom';
import useAuthStore from '@/store/authStore';

interface Props { children?: React.ReactNode }

export default function AuthGuard({ children }: Props) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return children ? <>{children}</> : <Outlet />;
}
