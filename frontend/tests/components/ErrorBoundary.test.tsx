import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorBoundary from '@/components/ErrorBoundary';

function Page({ broken }: { broken: boolean }) {
  if (broken) throw new Error('boom');
  return <p>הדף עובד</p>;
}

afterEach(() => vi.restoreAllMocks());

describe('ErrorBoundary', () => {
  it('shows the error screen instead of a blank page', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary><Page broken /></ErrorBoundary>);
    expect(screen.getByText('אופס, משהו השתבש בטעינת העמוד')).toBeInTheDocument();
  });

  it('recovers when the reset key changes, e.g. on leaving the broken page', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(<ErrorBoundary resetKey="/a"><Page broken /></ErrorBoundary>);
    rerender(<ErrorBoundary resetKey="/b"><Page broken={false} /></ErrorBoundary>);
    expect(screen.getByText('הדף עובד')).toBeInTheDocument();
  });

  it('keeps showing the error while the reset key stays the same', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(<ErrorBoundary resetKey="/a"><Page broken /></ErrorBoundary>);
    rerender(<ErrorBoundary resetKey="/a"><Page broken={false} /></ErrorBoundary>);
    expect(screen.getByText('אופס, משהו השתבש בטעינת העמוד')).toBeInTheDocument();
  });
});
