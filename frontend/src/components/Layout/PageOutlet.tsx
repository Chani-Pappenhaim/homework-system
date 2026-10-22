import { Outlet, useLocation } from 'react-router-dom';
import ErrorBoundary from '@/components/ErrorBoundary';

/**
 * The page area of a layout. Each route gets a fresh page (its state, and a
 * clean error boundary), while the layout around it - the header and its
 * search field - stays mounted, so typing there is never interrupted by a
 * route change.
 */
export default function PageOutlet() {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary key={pathname}>
      <Outlet />
    </ErrorBoundary>
  );
}
