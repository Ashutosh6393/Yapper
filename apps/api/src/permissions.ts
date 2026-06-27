import {
  buildRedisPermissionCache,
  defaultResolveDeps,
  type Permission,
  resolvePermission,
} from "@yapper/permissions";

/**
 * api-side wiring of the shared permission rule. The same derivation + Redis cache the `socket` uses
 * (ADR-001), built once. Routes call {@link resolvePerm} to gate, and reuse {@link permCache} to bust
 * cached entries on access/collaborator mutations.
 */
const cache = buildRedisPermissionCache();
const deps = defaultResolveDeps(cache);

/** The shared cache (null when REDIS_URL is unset), for busting on mutations. */
export const permCache = cache;

/** Effective permission for a user on a note (cache-first), identical to the socket's decision. */
export function resolvePerm(noteId: string, userId: string): Promise<Permission> {
  return resolvePermission(noteId, userId, deps);
}
