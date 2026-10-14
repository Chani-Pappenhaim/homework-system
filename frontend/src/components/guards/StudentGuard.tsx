import { Navigate, useLocation } from 'react-router-dom';
import useAuthStore from '@/store/authStore';
import StudentLayout from '@/components/Layout/StudentLayout';
import { FullPageSpinner } from '@/components/ui/full-page-spinner';

// Student pages that have a teacher counterpart under the same sub-path.
const SHARED_PATHS = /^\/student(\/(messages|courses(?:\/.+)?|lessons\/[^/]+|quiz\/[^/]+))\/?$/;

/**
 * Where a teacher lands when she opens a student link (e.g. the "reply"
 * button in an email that was sent to a student): the matching teacher page
 * when there is one, otherwise the teacher home page.
 */
export function teacherPathFor(pathname: string, search: string): string {
  const match = pathname.match(SHARED_PATHS);
  return match ? `/teacher${match[1]}${search}` : '/teacher';
}

export default function StudentGuard() {
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const { pathname, search } = useLocation();

  if (status === 'loading') return <FullPageSpinner />;
  if (user?.role !== 'STUDENT') return <Navigate to={teacherPathFor(pathname, search)} replace />;
  return <StudentLayout />;
}
