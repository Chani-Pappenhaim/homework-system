import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

// A single-page app keeps the window where the previous page left it, so a page
// opened from far down a long list started part-way down. A new page now starts
// at the top. Back/forward is left to the browser, which returns to where the
// reader was, and a change to the query alone (a tab, a filter) is the same page
// and keeps its place.

/** Mount once inside the router so every newly opened page starts at the top. */
export function useScrollToTopOnNavigate(): void {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  const previous = useRef(pathname);
  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    if (navigationType !== 'POP') window.scrollTo(0, 0);
  }, [pathname, navigationType]);
}
