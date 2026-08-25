import { create } from 'zustand';

interface ServerStatusState {
  /**
   * True while a request is stalling long enough to indicate the backend is
   * cold-starting. Drives the global "server is waking up" banner.
   */
  waking: boolean;
  setWaking: (waking: boolean) => void;
}

const useServerStatus = create<ServerStatusState>((set) => ({
  waking: false,
  setWaking: (waking) => set({ waking }),
}));

export default useServerStatus;
