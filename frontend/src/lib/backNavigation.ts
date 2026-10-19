import { useEffect } from 'react';
import { useLocation, useNavigate, type NavigateFunction } from 'react-router-dom';

// A "back" link to a fixed page (a lesson's "back to the course") used to push
// that page as a new history entry. When the page it pushed steps back through
// history itself, the two sent each other back and forth forever:
// course -> lesson -> (back to course) course -> (back) lesson -> ...
//
// Instead, such a link replaces the current entry, and when the page it lands
// on is the one the previous entry shows, it steps back to that entry - so
// "back" never grows the history. The comparison is made where the link lands,
// after the address redirects (a course's id moves to its name), because the
// link's own address is often not the one the previous entry ended up at.

// The page each history entry of this tab shows, by the entry's position,
// which React Router keeps in history.state.idx.
const shown = new Map<number, string>();
let pending: { idx: number; until: number } | null = null;

// Long enough for the redirect to wait for the course list to load.
const PENDING_MS = 10_000;

function currentIndex(): number | null {
  const idx = window.history.state?.idx;
  return typeof idx === 'number' ? idx : null;
}

function normalize(path: string): string {
  let decoded = path;
  try { decoded = decodeURI(path); } catch { /* keep as is */ }
  return decoded.length > 1 ? decoded.replace(/\/+$/, '') : decoded;
}

/** Records the page now shown, and completes a pending step back when it landed on the previous one. */
export function recordLocation(pathname: string, navigate: NavigateFunction): void {
  const idx = currentIndex();
  if (idx === null) return;
  const path = normalize(pathname);
  shown.set(idx, path);
  if (!pending) return;
  if (pending.idx !== idx || Date.now() > pending.until) { pending = null; return; }
  if (shown.get(idx - 1) === path) {
    pending = null;
    navigate(-1);
  }
}

/** Goes to the page `to` as a "back" step: to the previous entry when it shows that page, else in place of this one. */
export function goBackTo(to: string, navigate: NavigateFunction): void {
  const idx = currentIndex();
  if (idx !== null && idx > 0 && shown.get(idx - 1) === normalize(to)) {
    navigate(-1);
    return;
  }
  pending = idx === null ? null : { idx, until: Date.now() + PENDING_MS };
  navigate(to, { replace: true });
}

/** Mount once inside the router so every page change is recorded. */
export function useBackNavigationTracker(): void {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    recordLocation(location.pathname, navigate);
  }, [location.key, location.pathname, navigate]);
}

/** For tests. */
export function resetBackNavigation(): void {
  shown.clear();
  pending = null;
}
