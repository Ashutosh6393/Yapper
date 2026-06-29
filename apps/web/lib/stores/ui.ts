import { create } from "zustand";

/**
 * Cross-component UI toggles (ADR-004). Currently the owner's share panel on the note page; more
 * dialogs/toasts move here as the shadcn migration (09d) lands. Not for server data.
 */
interface UiState {
  shareDialogOpen: boolean;
  openShareDialog: () => void;
  closeShareDialog: () => void;
  toggleShareDialog: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  shareDialogOpen: false,
  openShareDialog: () => set({ shareDialogOpen: true }),
  closeShareDialog: () => set({ shareDialogOpen: false }),
  toggleShareDialog: () => set((s) => ({ shareDialogOpen: !s.shareDialogOpen })),
}));
