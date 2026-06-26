import { create } from 'zustand';
import type { UserDTO } from '@/types';

interface AuthState {
  user: UserDTO | null;
  accessToken: string | null;
  setAuth: (user: UserDTO, token: string) => void;
  setAccessToken: (token: string) => void;
  clearAuth: () => void;
}

const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  setAuth: (user, accessToken) => set({ user, accessToken }),
  setAccessToken: (accessToken) => set({ accessToken }),
  clearAuth: () => set({ user: null, accessToken: null }),
}));

export default useAuthStore;
