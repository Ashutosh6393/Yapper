import { beforeEach, describe, expect, it, vi } from "vitest";
import { warmPrecache } from "./precache";

/** Minimal Cache/CacheStorage doubles — jsdom has neither. */
function fakeCaches(alreadyCached: string[] = []) {
  const added: string[] = [];
  const cache = {
    keys: vi.fn(async () => alreadyCached.map((p) => ({ url: `http://x${p}` }))),
    add: vi.fn(async (p: string) => {
      if (p.includes("gone")) throw new Error("404");
      added.push(p);
    }),
  };
  return { added, cache, storage: { open: vi.fn(async () => cache) } };
}

const MANIFEST = ["/_next/static/chunks/editor.js", "/_next/static/chunks/main.js"];

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("warmPrecache", () => {
  // The goal state: the editor chunk is code-split, so a user who never opened a note while online has
  // no editor chunk cached and gets a ChunkLoadError offline. Warming the manifest closes that hole.
  it("caches every manifest asset the cache is missing", async () => {
    const { added, storage } = fakeCaches();
    vi.stubGlobal("caches", storage);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(MANIFEST), { status: 200 })),
    );

    await warmPrecache();

    expect(added).toEqual(MANIFEST);
  });

  it("skips assets already cached (no redundant refetch)", async () => {
    const { added, cache, storage } = fakeCaches(["/_next/static/chunks/main.js"]);
    vi.stubGlobal("caches", storage);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(MANIFEST), { status: 200 })),
    );

    await warmPrecache();

    expect(added).toEqual(["/_next/static/chunks/editor.js"]);
    expect(cache.add).toHaveBeenCalledTimes(1);
  });

  // Warming is best-effort: it must never throw into React. One bad asset can't sink the rest, and an
  // offline load (fetch rejects) is a no-op, not a crash.
  it("survives a failing asset and a failing manifest fetch", async () => {
    const { added, storage } = fakeCaches();
    vi.stubGlobal("caches", storage);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(["/gone.js", ...MANIFEST]), { status: 200 })),
    );

    await expect(warmPrecache()).resolves.toBeUndefined();
    expect(added).toEqual(MANIFEST);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(warmPrecache()).resolves.toBeUndefined();
  });
});
