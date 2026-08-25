import { create } from 'zustand';
import type { UserDTO } from '@/types';

interface AuthState {
  user: UserDTO | null;
  accessToken: string | null;
  /**
   * 'loading' until the refresh-cookie bootstrap resolves. Route guards must wait
   * for 'ready' rather than treating the initial null user as "logged out".
   */
  status: 'loading' | 'ready';
  setAuth: (user: UserDTO, token: string) => void;
  setAccessToken: (token: string) => void;
  setReady: () => void;
  clearAuth: () => void;
}

const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  status: 'loading',
  setAuth: (user, accessToken) => set({ user, accessToken, status: 'ready' }),
  setAccessToken: (accessToken) => set({ accessToken }),
  setReady: () => set({ status: 'ready' }),
  clearAuth: () => set({ user: null, accessToken: null, status: 'ready' }),
}));

export default useAuthStore;
