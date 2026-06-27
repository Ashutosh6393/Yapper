import { buildRedisPermissionCache, type PermissionCache } from "./cache";
import { isActiveCollaborator, loadNote } from "./loaders";
import type { ResolveDeps } from "./resolve";

export {
  buildRedisPermissionCache,
  PERM_TTL_SECONDS,
  type PermissionCache,
  permCacheKey,
} from "./cache";
export { effectivePermission, type Permission, type PermissionNote } from "./derive";
export { isActiveCollaborator, loadNote } from "./loaders";
export {
  bustNotePermissions,
  bustUserPermission,
  type ResolveDeps,
  resolvePermission,
} from "./resolve";

/**
 * Production wiring: the db-backed loaders plus an optional Redis cache. `api` and `socket` call this
 * once and pass the result to `resolvePermission`, guaranteeing identical permission decisions.
 */
export function defaultResolveDeps(cache?: PermissionCache | null): ResolveDeps {
  return { loadNote, isActiveCollaborator, cache: cache ?? null };
}

/** Convenience: build the default deps with a freshly built Redis cache (null when REDIS_URL unset). */
export function buildResolveDeps(): ResolveDeps {
  return defaultResolveDeps(buildRedisPermissionCache());
}
