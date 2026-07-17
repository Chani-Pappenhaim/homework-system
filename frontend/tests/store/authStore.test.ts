import { describe, it, expect, beforeEach } from 'vitest';
import useAuthStore from '@/store/authStore';
import type { UserDTO } from '@/types';

const user: UserDTO = {
  id: 'u1', name: 'רות', email: 'ruth@x.com', role: 'STUDENT', mustChangePassword: false,
};

beforeEach(() => useAuthStore.setState({ user: null, accessToken: null }));

describe('authStore', () => {
  it('starts empty', () => {
    const s = useAuthStore.getState();
    expect(s.user).toBeNull();
    expect(s.accessToken).toBeNull();
  });

  it('setAuth stores the user and token', () => {
    useAuthStore.getState().setAuth(user, 'tok123');
    const s = useAuthStore.getState();
    expect(s.user).toEqual(user);
    expect(s.accessToken).toBe('tok123');
  });

  it('setAccessToken replaces only the token, keeping the user', () => {
    useAuthStore.getState().setAuth(user, 'old');
    useAuthStore.getState().setAccessToken('new');
    const s = useAuthStore.getState();
    expect(s.accessToken).toBe('new');
    expect(s.user).toEqual(user);
  });

  it('clearAuth resets user and token', () => {
    useAuthStore.getState().setAuth(user, 'tok');
    useAuthStore.getState().clearAuth();
    const s = useAuthStore.getState();
    expect(s.user).toBeNull();
    expect(s.accessToken).toBeNull();
  });
});
