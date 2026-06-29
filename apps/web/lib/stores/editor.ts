import type { AwarenessUser, Permission } from "@yapper/schemas";
import { create } from "zustand";

/** Connection lifecycle as the editor surfaces it (a superset of the raw provider status). */
export type ConnStatus = "connecting" | "connected" | "disconnected" | "denied" | "made_private";

/**
 * Cross-component editor/collab UI state (ADR-004). The `Editor` writes from the Hocuspocus
 * provider's callbacks; `BoundEditor`/`ConnectionBadge` read it without prop-drilling. This is UI
 * state only — the Yjs document and presence/awareness live on the provider, not here.
 */
interface EditorState {
  status: ConnStatus;
  identity: AwarenessUser | null;
  permission: Permission;
  privateKicked: boolean;
  setStatus: (status: ConnStatus) => void;
  setIdentity: (identity: AwarenessUser) => void;
  setPermission: (permission: Permission) => void;
  markPrivate: () => void;
  reset: () => void;
}

const initial = {
  status: "connecting",
  identity: null,
  permission: "view",
  privateKicked: false,
} satisfies Pick<EditorState, "status" | "identity" | "permission" | "privateKicked">;

export const useEditorStore = create<EditorState>((set) => ({
  ...initial,
  setStatus: (status) => set({ status }),
  setIdentity: (identity) => set({ identity }),
  setPermission: (permission) => set({ permission }),
  markPrivate: () => set({ status: "made_private", privateKicked: true }),
  reset: () => set(initial),
}));
