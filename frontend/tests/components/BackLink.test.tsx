import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { BackLink } from '@/components/ui/back-link';
import { resetBackNavigation, useBackNavigationTracker } from '@/lib/backNavigation';

// Mirrors the real pages: the course page steps back through history, while the
// lesson page links back to its course by a fixed address - by id, which
// redirects to the course's name like CourseRoute does.
function Shell() {
  useBackNavigationTracker();
  const location = useLocation();
  return (
    <>
      <div data-testid="path">{decodeURI(location.pathname)}</div>
      <Routes>
        <Route path="/" element={<><Link to="/courses">קורסים</Link><Link to="/courses/react/lessons/1">שיעור מהבית</Link></>} />
        <Route path="/courses" element={<Link to="/courses/react">לקורס</Link>} />
        <Route path="/courses/id-1" element={<Navigate to="/courses/react" replace />} />
        <Route
          path="/courses/react"
          element={<><BackLink label="חזרה" /><Link to="/courses/react/lessons/1">לשיעור</Link></>}
        />
        <Route path="/courses/react/lessons/1" element={<BackLink to="/courses/id-1" label="חזרה לקורס" />} />
      </Routes>
    </>
  );
}

const path = () => screen.getByTestId('path').textContent;
const historyIndex = () => window.history.state?.idx;

function start(at: string) {
  window.history.replaceState(null, '', at);
  render(<BrowserRouter><Shell /></BrowserRouter>);
}

describe('BackLink to a fixed page', () => {
  beforeEach(() => resetBackNavigation());

  it('steps back to the course it came from, so the course\'s own "back" leaves it', async () => {
    start('/');
    fireEvent.click(screen.getByText('קורסים'));
    fireEvent.click(screen.getByText('לקורס'));
    fireEvent.click(screen.getByText('לשיעור'));
    expect(historyIndex()).toBe(3);

    fireEvent.click(screen.getByText('חזרה לקורס'));
    await waitFor(() => expect(path()).toBe('/courses/react'));
    await waitFor(() => expect(historyIndex()).toBe(2));

    // Used to land back on the lesson, and from there on the course again, forever.
    fireEvent.click(screen.getByText('חזרה'));
    await waitFor(() => expect(path()).toBe('/courses'));
  });

  it('takes the place of a lesson opened from elsewhere instead of adding an entry', async () => {
    start('/');
    fireEvent.click(screen.getByText('שיעור מהבית'));
    expect(historyIndex()).toBe(1);

    fireEvent.click(screen.getByText('חזרה לקורס'));
    await waitFor(() => expect(path()).toBe('/courses/react'));
    expect(historyIndex()).toBe(1);

    fireEvent.click(screen.getByText('חזרה'));
    await waitFor(() => expect(path()).toBe('/'));
  });
});
