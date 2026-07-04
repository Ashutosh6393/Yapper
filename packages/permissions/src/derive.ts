/**
 * Effective per-user permission on a note. The single source of truth for "who can do what",
 * imported by both `api` route guards and `socket.onAuthenticate` so REST and realtime never drift
 * (ADR-001). Pure and synchronous — fetching the inputs (note + collaborator flag) is the caller's
 * job (see {@link resolvePermission}).
 */
export type Permission = "none" | "view" | "edit";

/** The minimal note shape the derivation needs. Mirrors `note.ownerId` + `note.access` +
 * `note.trashedAt` from the db. */
export interface PermissionNote {
  ownerId: string;
  access: "private" | "view" | "edit";
  /** Set when the note is in the owner's trash — hides it from non-owners (ADR-005). */
  trashedAt: Date | null;
}

/**
 * Derive a user's effective permission. The rule (06 design + slice 12):
 * - owner          → always `edit` (even when trashed — they can restore/preview)
 * - trashed note   → `none` for everyone else (blocks new reads/reconnects; ADR-005)
 * - private note   → `none` for everyone else
 * - not an active collaborator → `none` (must have joined via the share link)
 * - otherwise inherit the note-level role: `view` access → `view`, `edit` access → `edit`.
 */
export function effectivePermission(
  userId: string,
  note: PermissionNote,
  isActiveCollaborator: boolean,
): Permission {
  if (note.ownerId === userId) return "edit";
  if (note.trashedAt !== null) return "none";
  if (note.access === "private") return "none";
  if (!isActiveCollaborator) return "none";
  return note.access === "edit" ? "edit" : "view";
}
