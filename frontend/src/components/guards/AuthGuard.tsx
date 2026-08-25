import { Navigate, Outlet } from 'react-router-dom';
import useAuthStore from '@/store/authStore';
import { FullPageSpinner } from '@/components/ui/full-page-spinner';

interface Props { children?: React.ReactNode }

export default function AuthGuard({ children }: Props) {
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);

  // Wait for the session bootstrap to finish before deciding to redirect,
  // so a valid session isn't treated as logged-out on the first render.
  if (status === 'loading') return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  return children ? <>{children}</> : <Outlet />;
}
