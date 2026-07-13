/**
 * Warm the service-worker cache with the full build asset list (spec 24b).
 *
 * The SW caches `/_next/static/**` on demand, which only ever covers what the online session happened to
 * request. Next code-splits the editor, so a user who never opened a note while online would hit a
 * ChunkLoadError the moment they went offline. `public/precache.json` (written by
 * `scripts/precache-manifest.mjs` at build time) lists every chunk; this pulls the missing ones in.
 *
 * Best-effort by construction: a failing asset, a missing manifest, or an offline load must never throw
 * into React — the app still works, it just isn't fully offline-ready yet.
 */

/** Must match `CACHE` in `public/sw.js` — a plain SW script can't import from the bundle. */
const CACHE = "yapper-v1";

export async function warmPrecache(): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const response = await fetch("/precache.json", { cache: "no-store" });
    if (!response.ok) return;

    const manifest: unknown = await response.json();
    if (!Array.isArray(manifest)) return;
    const assets = manifest.filter((a): a is string => typeof a === "string");

    const cache = await caches.open(CACHE);
    const cached = new Set((await cache.keys()).map((request) => new URL(request.url).pathname));
    const missing = assets.filter((asset) => !cached.has(asset));

    // Per-asset `add`, not `addAll`: addAll is atomic, so one 404 would discard the whole warm-up.
    await Promise.all(missing.map((asset) => cache.add(asset).catch(() => {})));
  } catch {
    // Offline, or no manifest (dev). Nothing to warm.
  }
}
