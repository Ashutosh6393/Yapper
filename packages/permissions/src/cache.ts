import IORedis from "ioredis";

/**
 * Minimal cache surface the permission layer needs. Backed by Redis in prod (see
 * {@link buildRedisPermissionCache}), or an in-memory fake in tests. Kept tiny so `api` and `socket`
 * share one connect-time check without dragging the whole ioredis API into the contract.
 */
export interface PermissionCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(keys: string[]): Promise<void>;
  /** Keys matching a glob pattern (e.g. `perm:{noteId}:*`), for note-wide busting. */
  keys(pattern: string): Promise<string[]>;
}

/** Short TTL: the cache is a connect-time fast path, not the source of truth; mutations bust it. */
export const PERM_TTL_SECONDS = 30;

/** Cache key for one user's effective permission on one note: `perm:{noteId}:{userId}`. */
export function permCacheKey(noteId: string, userId: string): string {
  return `perm:${noteId}:${userId}`;
}

/**
 * Build a Redis-backed cache from `REDIS_URL`, or `null` when it is unset so single-instance dev and
 * tests run without Redis (matching the socket's fanout convention). The permission layer treats a
 * `null` cache as "no caching" — always correct, just no fast path.
 */
export function buildRedisPermissionCache(): PermissionCache | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  const client = new IORedis(url);
  return {
    get: (key) => client.get(key),
    set: async (key, value, ttlSeconds) => {
      await client.set(key, value, "EX", ttlSeconds);
    },
    del: async (keys) => {
      if (keys.length > 0) await client.del(...keys);
    },
    keys: (pattern) => client.keys(pattern),
  };
}
