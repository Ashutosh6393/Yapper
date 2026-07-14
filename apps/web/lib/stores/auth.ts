import { create } from "zustand";

/**
 * Session-expiry flag (spec 25b, ADR-003). Set when the API answers `401` — from the pusher (via the
 * `auth` push outcome) or, once 25a lands, from the Query cache callbacks. It is *not* a sign-out: the
 * mutation queue in Dexie is intact and still the user's unsaved writing. It only means the credential is
 * dead, so the pusher must pause (retrying cannot mint a new session) and the user must be told.
 *
 * In-memory on purpose. Re-auth is an OAuth full-page redirect, so returning signed-in reloads the app:
 * the flag resets, `SyncEngineBootstrap` runs, and its `schedulePush()` drains the queue. Resume needs no
 * code — it falls out of the reload.
 */
interface AuthState {
  expired: boolean;
  markExpired: () => void;
  clearExpired: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  expired: false,
  markExpired: () => set({ expired: true }),
  clearExpired: () => set({ expired: false }),
}));
