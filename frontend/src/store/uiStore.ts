import { create } from 'zustand';

/**
 * Cross-component UI state, currently just the header search query, shared
 * between components without prop-drilling.
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
