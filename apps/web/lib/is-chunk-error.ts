/**
 * A code-split chunk that no longer exists on the server (spec 25c, ADR-007).
 *
 * The case that matters: a long-lived tab across a deploy. The old hashed chunks are gone, so opening a
 * note fetches the previous build's Editor chunk URL and 404s. The service worker (spec 24b) covers most
 * of this via `warmPrecache`, but only for assets it actually caught.
 *
 * Worth its own predicate because it is the one error whose recovery is **reload, not retry**: `reset()`
 * re-renders the same subtree, which re-requests the same dead URL from the same router, and fails
 * identically. Only fresh HTML carries the new chunk URLs.
 */
const CHUNK_FAILURE =
  /loading chunk|chunkloaderror|dynamically imported module|importing a module script/i;

export function isChunkError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const { name, message } = err as { name?: unknown; message?: unknown };
  if (name === "ChunkLoadError") return true;
  return typeof message === "string" && CHUNK_FAILURE.test(message);
}
