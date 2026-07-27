import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToast } from '@/components/ui/toast';

function Trigger({ message, variant }: { message: string; variant?: 'success' | 'error' }) {
  const toast = useToast();
  return (
    <button onClick={() => (variant === 'error' ? toast.error(message) : toast.success(message))}>
      fire
    </button>
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Toast', () => {
  it('shows a success message when triggered', async () => {
    render(<ToastProvider><Trigger message="נשמר בהצלחה" /></ToastProvider>);
    await userEvent.click(screen.getByText('fire'));
    expect(screen.getByText('נשמר בהצלחה')).toBeInTheDocument();
  });

  it('auto-dismisses after the timeout', () => {
    vi.useFakeTimers();
    render(<ToastProvider><Trigger message="נעלם" /></ToastProvider>);
    fireEvent.click(screen.getByText('fire'));
    expect(screen.getByText('נעלם')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(3100); });
    expect(screen.queryByText('נעלם')).not.toBeInTheDocument();
  });

  it('can be dismissed with the close button', async () => {
    render(<ToastProvider><Trigger message="לסגור" /></ToastProvider>);
    await userEvent.click(screen.getByText('fire'));
    expect(screen.getByText('לסגור')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('סגירה'));
    expect(screen.queryByText('לסגור')).not.toBeInTheDocument();
  });

  it('useToast is a no-op (does not throw) without a provider', async () => {
    render(<Trigger message="בלי provider" />);
    await userEvent.click(screen.getByText('fire'));
    // No toast rendered, and nothing threw
    expect(screen.queryByText('בלי provider')).not.toBeInTheDocument();
  });
});
