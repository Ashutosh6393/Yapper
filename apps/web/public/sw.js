/**
 * Yapper's service worker (spec 24b, ADR-001/002). Its only job is to make the app *reachable* offline;
 * the offline data itself already lives in Dexie (note metadata) and y-indexeddb (note bodies), and the
 * sync engine already owns retry/backoff. So this caches exactly two things and passes everything else
 * straight through:
 *
 *   1. `/_next/static/**` — content-hashed by the Next build, therefore immutable: cache-first, forever,
 *      no precache manifest and no invalidation logic (which is why there's no next-pwa/serwist here).
 *   2. Navigations — network-first, falling back to the cached document for that **pathname** (the query
 *      string is dropped: notes open as `/dashboard?note=<id>`, spec 22, so one cached `/dashboard`
 *      document covers the whole logged-in surface), else the cached `/dashboard` shell.
 *
 * Never cached: `/api/**`, the socket, and anything that isn't a same-origin GET. Dexie is the local
 * source of truth — a cached API response would be a second, staler authority competing with it.
 */

const CACHE = "yapper-v1";
const SHELL = "/dashboard";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Cache-first: hashed assets never change under a given URL, so a hit is always correct. */
async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) (await caches.open(CACHE)).put(request, response.clone());
  return response;
}

/** Network-first, falling back to this pathname's cached document, then the shell. */
async function navigateOrShell(request) {
  const key = new URL(request.url).pathname; // drop the query — `?note=<id>` is dialog state, not a page
  try {
    const response = await fetch(request);
    if (response.ok) (await caches.open(CACHE)).put(key, response.clone());
    return response;
  } catch {
    return (await caches.match(key)) ?? (await caches.match(SHELL)) ?? Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return; // API + socket: not ours

  if (request.mode === "navigate") event.respondWith(navigateOrShell(request));
  else if (new URL(request.url).pathname.startsWith("/_next/static/"))
    event.respondWith(cacheFirst(request));
});
