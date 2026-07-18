import { Navigate, Outlet } from 'react-router-dom';
import useAuthStore from '@/store/authStore';
import { FullPageSpinner } from '@/components/ui/full-page-spinner';

interface Props { children?: React.ReactNode }

export default function AuthGuard({ children }: Props) {
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);

  // Wait for the refresh-cookie bootstrap; redirecting on the first render
  // logged the user out on every reload even with a valid session.
  if (status === 'loading') return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  return children ? <>{children}</> : <Outlet />;
}
