import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useBootstrapAuth } from '@/hooks/useAuth';
import useAuthStore from '@/store/authStore';

vi.mock('@/api/auth.api', () => ({
  authApi: { refresh: vi.fn(), me: vi.fn() },
}));

import { authApi } from '@/api/auth.api';
const refresh = authApi.refresh as unknown as ReturnType<typeof vi.fn>;
const me = authApi.me as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ user: null, accessToken: null });
});

describe('useBootstrapAuth', () => {
  it('refreshes the token and loads the current user when not authenticated', async () => {
    refresh.mockResolvedValue({ data: { data: { accessToken: 'tok' } } });
    me.mockResolvedValue({ data: { data: { user: { id: 'u1', name: 'N', email: 'e', role: 'STUDENT', mustChangePassword: false } } } });

    renderHook(() => useBootstrapAuth());

    await waitFor(() => expect(useAuthStore.getState().accessToken).toBe('tok'));
    expect(useAuthStore.getState().user?.id).toBe('u1');
  });

  it('does nothing when a token is already present', async () => {
    useAuthStore.setState({ user: null, accessToken: 'existing' });
    renderHook(() => useBootstrapAuth());
    expect(refresh).not.toHaveBeenCalled();
  });

  it('swallows a failed refresh without throwing', async () => {
    refresh.mockRejectedValue(new Error('no session'));
    renderHook(() => useBootstrapAuth());
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(useAuthStore.getState().user).toBeNull();
  });
});
