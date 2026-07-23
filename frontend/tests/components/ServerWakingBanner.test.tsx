import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ServerWakingBanner } from '@/components/ui/server-waking-banner';
import useServerStatus from '@/store/serverStatus';

afterEach(() => {
  act(() => useServerStatus.getState().setWaking(false));
});

describe('ServerWakingBanner', () => {
  it('renders nothing while the server is not waking', () => {
    const { container } = render(<ServerWakingBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the waking message once the store flips to waking', () => {
    render(<ServerWakingBanner />);
    act(() => useServerStatus.getState().setWaking(true));
    expect(screen.getByText(/השרת מתעורר/)).toBeInTheDocument();
  });

  it('hides again when waking clears', () => {
    render(<ServerWakingBanner />);
    act(() => useServerStatus.getState().setWaking(true));
    expect(screen.getByText(/השרת מתעורר/)).toBeInTheDocument();
    act(() => useServerStatus.getState().setWaking(false));
    expect(screen.queryByText(/השרת מתעורר/)).not.toBeInTheDocument();
  });
});
