import { create } from 'zustand';

interface ServerStatusState {
  /**
   * True while a request has been stalling long enough that the backend is
   * almost certainly cold-starting (free-tier spin-down). Drives the global
   * "server is waking up" banner. Set by the axios interceptors.
   */
  waking: boolean;
  setWaking: (waking: boolean) => void;
}

const useServerStatus = create<ServerStatusState>((set) => ({
  waking: false,
  setWaking: (waking) => set({ waking }),
}));

export default useServerStatus;
