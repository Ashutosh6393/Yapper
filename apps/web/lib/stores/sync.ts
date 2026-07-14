import { create } from "zustand";

/**
 * The pusher's "the server will never accept this" flag (spec 26c, ADR-005). Set when a push comes back
 * `blocked` — a `4xx` that is not `401`/`429`, e.g. a `clientGroupID` bound to another user (`403`).
 *
 * Not a sign-out and not a rollback: the queue in Dexie is intact and still the user's work. It only means
 * pushing is pointless until something changes, so the pusher stops (retrying identical bytes yields the
 * identical `4xx`, forever) and the user is told their changes are not saving. In-memory: a reload
 * re-mints the client group (26a/26b) and re-runs the bootstrap, which is the recovery path.
 */
interface SyncState {
  blocked: number | null;
  markBlocked: (status: number) => void;
  clearBlocked: () => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  blocked: null,
  markBlocked: (status) => set({ blocked: status }),
  clearBlocked: () => set({ blocked: null }),
}));
