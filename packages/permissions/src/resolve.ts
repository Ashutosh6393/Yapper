import { PERM_TTL_SECONDS, type PermissionCache, permCacheKey } from "./cache";
import { effectivePermission, type Permission, type PermissionNote } from "./derive";

/**
 * Inputs `resolvePermission` needs to compute a fresh permission. The loaders are injected so the
 * function is unit-testable without a db; `api` and `socket` pass the db-backed defaults from
 * {@link ./loaders}.
 */
export interface ResolveDeps {
  /** Note's `ownerId` + `access`, or `null` if it does not exist. */
  loadNote: (noteId: string) => Promise<PermissionNote | null>;
  /** Whether the user is an `active` collaborator row on the note. */
  isActiveCollaborator: (noteId: string, userId: string) => Promise<boolean>;
  /** Optional Redis cache; omitted/`null` means recompute every time (always correct). */
  cache?: PermissionCache | null;
}

/**
 * Cache-first effective-permission lookup shared by `api` guards and `socket.onAuthenticate` (ADR-001).
 * On a cache miss it loads the note + collaborator flag, derives the permission, and writes it back
 * with a short TTL. A missing note resolves to `none`.
 */
export async function resolvePermission(
  noteId: string,
  userId: string,
  deps: ResolveDeps,
): Promise<Permission> {
  const key = permCacheKey(noteId, userId);
  if (deps.cache) {
    const cached = await deps.cache.get(key);
    if (cached === "none" || cached === "view" || cached === "edit") return cached;
  }

  const note = await deps.loadNote(noteId);
  const perm: Permission = note
    ? effectivePermission(userId, note, await deps.isActiveCollaborator(noteId, userId))
    : "none";

  if (deps.cache) await deps.cache.set(key, perm, PERM_TTL_SECONDS);
  return perm;
}

/** Bust one user's cached permission for a note (e.g. after they join). No-op without a cache. */
export async function bustUserPermission(
  cache: PermissionCache | null | undefined,
  noteId: string,
  userId: string,
): Promise<void> {
  if (!cache) return;
  await cache.del([permCacheKey(noteId, userId)]);
}

/** Bust every cached permission for a note (e.g. after the owner changes `access`). */
export async function bustNotePermissions(
  cache: PermissionCache | null | undefined,
  noteId: string,
): Promise<void> {
  if (!cache) return;
  const keys = await cache.keys(`${permCacheKey(noteId, "")}*`);
  await cache.del(keys);
}
