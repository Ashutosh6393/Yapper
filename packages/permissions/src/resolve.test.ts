import { expect, test } from "bun:test";
import type { PermissionCache } from "./cache";
import { permCacheKey } from "./cache";
import type { PermissionNote } from "./derive";
import { bustNotePermissions, bustUserPermission, resolvePermission } from "./resolve";

const OWNER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const COLLAB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const NOTE = "cccccccc-cccc-cccc-cccc-cccccccccccc";

/** Minimal in-memory cache standing in for Redis (ttl ignored — behavior is identical for tests). */
function fakeCache(): PermissionCache & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    get: async (key) => store.get(key) ?? null,
    set: async (key, value) => {
      store.set(key, value);
    },
    del: async (keys) => {
      for (const k of keys) store.delete(k);
    },
    keys: async (pattern) => {
      const prefix = pattern.replace(/\*$/, "");
      return [...store.keys()].filter((k) => k.startsWith(prefix));
    },
  };
}

function deps(
  over: { note?: PermissionNote | null; isCollab?: boolean; cache?: PermissionCache } = {},
) {
  let loadCalls = 0;
  const d = {
    loadNote: async () => {
      loadCalls++;
      return over.note === undefined ? { ownerId: OWNER, access: "edit" as const } : over.note;
    },
    isActiveCollaborator: async () => over.isCollab ?? false,
    cache: over.cache,
    counts: () => loadCalls,
  };
  return d;
}

test("resolves and caches the derived permission on a cache miss", async () => {
  const cache = fakeCache();
  const d = deps({ note: { ownerId: OWNER, access: "view" }, isCollab: true, cache });

  const perm = await resolvePermission(NOTE, COLLAB, d);
  expect(perm).toBe("view");
  expect(cache.store.get(permCacheKey(NOTE, COLLAB))).toBe("view");
});

test("a cache hit short-circuits the db loaders", async () => {
  const cache = fakeCache();
  cache.store.set(permCacheKey(NOTE, COLLAB), "edit");
  const d = deps({ note: null, cache });

  const perm = await resolvePermission(NOTE, COLLAB, d);
  expect(perm).toBe("edit");
  expect(d.counts()).toBe(0); // loadNote never called
});

test("a missing note resolves to none", async () => {
  const perm = await resolvePermission(NOTE, COLLAB, deps({ note: null }));
  expect(perm).toBe("none");
});

test("works without a cache (cache is optional)", async () => {
  const perm = await resolvePermission(
    NOTE,
    COLLAB,
    deps({ note: { ownerId: OWNER, access: "edit" }, isCollab: true }),
  );
  expect(perm).toBe("edit");
});

test("bustUserPermission removes only that user's entry", async () => {
  const cache = fakeCache();
  cache.store.set(permCacheKey(NOTE, COLLAB), "view");
  cache.store.set(permCacheKey(NOTE, OWNER), "edit");

  await bustUserPermission(cache, NOTE, COLLAB);
  expect(cache.store.has(permCacheKey(NOTE, COLLAB))).toBe(false);
  expect(cache.store.has(permCacheKey(NOTE, OWNER))).toBe(true);
});

test("bustNotePermissions removes every cached entry for the note", async () => {
  const cache = fakeCache();
  cache.store.set(permCacheKey(NOTE, COLLAB), "view");
  cache.store.set(permCacheKey(NOTE, OWNER), "edit");
  cache.store.set(permCacheKey("other-note", COLLAB), "view");

  await bustNotePermissions(cache, NOTE);
  expect(cache.store.has(permCacheKey(NOTE, COLLAB))).toBe(false);
  expect(cache.store.has(permCacheKey(NOTE, OWNER))).toBe(false);
  expect(cache.store.has(permCacheKey("other-note", COLLAB))).toBe(true);
});
