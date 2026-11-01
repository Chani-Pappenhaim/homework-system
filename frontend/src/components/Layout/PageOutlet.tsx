import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import ErrorBoundary from '@/components/ErrorBoundary';

function PageSpinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="h-8 w-8 animate-spin rounded-full border border-primary border-t-transparent" />
    </div>
  );
}

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
      <Suspense fallback={<PageSpinner />}>
        <Outlet />
      </Suspense>
    </ErrorBoundary>
  );
}
