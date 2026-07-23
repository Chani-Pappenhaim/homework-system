import { create } from 'zustand';

/**
 * Small cross-component UI state. Right now it holds the header search query so
 * the search box (in TeacherLayout) and the review queue (in the dashboard) can
 * share one value without prop-drilling or a circular import — both sides just
 * import this store.
 */
interface UiState {
  search: string;
  setSearch: (value: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  search: '',
  setSearch: (value) => set({ search: value }),
}));

export default useUiStore;
