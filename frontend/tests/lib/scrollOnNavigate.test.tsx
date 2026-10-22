import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { MemoryRouter, useNavigate, type NavigateFunction } from 'react-router-dom';
import { useScrollToTopOnNavigate } from '@/lib/scrollOnNavigate';

let navigate: NavigateFunction;
function Probe() {
  useScrollToTopOnNavigate();
  navigate = useNavigate();
  return null;
}

const scrollTo = vi.fn();
beforeEach(() => {
  scrollTo.mockClear();
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
});

function mount() {
  render(<MemoryRouter initialEntries={['/teacher/students']}><Probe /></MemoryRouter>);
  scrollTo.mockClear();
}

describe('useScrollToTopOnNavigate', () => {
  it('starts a newly opened page at the top', () => {
    mount();
    act(() => navigate('/teacher/students/s1'));
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('leaves back/forward to the browser, which returns to where the reader was', () => {
    mount();
    act(() => navigate('/teacher/students/s1'));
    scrollTo.mockClear();
    act(() => navigate(-1));
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('keeps the place when only the query changes (a tab or a filter on the same page)', () => {
    mount();
    act(() => navigate('/teacher/students?q=דנה'));
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
