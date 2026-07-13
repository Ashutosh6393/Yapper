# 24 · Offline — Decisions

## ADR-001: Hand-written service worker, no `next-pwa` / `serwist`

### Context

The app shell can't load without the network — there is no service worker. The conventional answer in
Next.js is a PWA plugin (`next-pwa`, `@serwist/next`), which generates a Workbox precache manifest at
build time and injects it into a generated SW.

### Options Considered

1. **`@serwist/next`** — batteries included; adds a dependency, a build-config change, a generated SW,
   and a precache manifest listing every build asset.
2. **Hand-written `public/sw.js`** — ~35 lines, zero dependencies, zero build integration.

### Decision

Hand-written `public/sw.js`.

Two properties of *this* app make the plugin's main deliverable — the precache manifest — redundant:

- Next's build output under `/_next/static/**` is **content-hashed and immutable**, so a plain
  cache-first rule is correct forever with no manifest and no invalidation logic.
- Notes open as `/dashboard?note=<id>` (spec 22 — the URL is the dialog state), so ignoring the query
  string the entire logged-in offline surface is **one document**. There is no route graph to precache.

A dependency plus build config would be strictly more code, and more to understand at 3am, than the file
it replaces.

### Consequences

- We own the SW's cache-versioning (`yapper-v1`) and its update/activate cleanup — a few lines, but ours.
- Offline cold-load of a route we never cached (`/`, `/login`) falls back to the `/dashboard` shell.
  Accepted: those routes are only useful online.
- If the offline surface later grows to several genuinely distinct documents, revisit — the SW is one
  file and swapping it for Serwist is a contained change.
- **Amended during implementation — we do need a build-time asset list** (see ADR-004). The "no precache
  manifest" half of this decision was wrong; the "no dependency" half survived.

---

## ADR-004: Precache the build's assets from a generated manifest

### Context

ADR-001 claimed cache-first on `/_next/static/**` needed no precache manifest, because those assets are
content-hashed and immutable. Immutability is about **invalidation** — and on that, the claim holds.
It says nothing about **coverage**.

Caught in browser verification: with the SW live and the server killed, `/dashboard?note=<id>` threw a
client-side exception. The network log showed the document and 14 assets served 200 from cache, and
**seven `/_next/static/chunks/*.js` failing** — the code-split note-dialog/editor chunks. They had never
been fetched during the online visit (which was a plain `/dashboard`, no note opened), so cache-on-demand
never stored them, and a missing chunk is a `ChunkLoadError`, not a degraded experience.

The hole is structural, not incidental: **cache-on-demand only ever holds what an online session happened
to request.** Next code-splits the editor, so the exact code needed to write a note offline is the code
most likely to be absent. "It works offline if you opened a note first" is not offline support.

### Options Considered

1. **Eagerly `import()` the editor on dashboard load** — 3 lines, but it only patches the chunks we know
   about today. Any future dynamic import silently re-opens the hole, offline and unnoticed.
2. **Adopt `@serwist/next` after all** — its precache manifest is exactly the missing piece.
3. **Generate the list ourselves** — walk `.next/static` post-build, write `public/precache.json`, and
   have the client warm it into the SW cache on load.

### Decision

Option 3. `scripts/precache-manifest.mjs` (~25 lines) runs after `next build`; `lib/precache.ts`
(`warmPrecache()`) fetches the list on load and `cache.add`s whatever is missing.

Option 1 is rejected because it trades a *known* hole for an *invisible* one. Option 2 remains rejected:
the manifest was the only part of Serwist we needed, and generating it is a directory walk — the
dependency, its build-config integration and its generated SW are all still cost we'd carry for nothing.

Warming is driven from the **page**, not the SW's `install`. A SW only reinstalls when `sw.js`'s bytes
change, and ours don't change between builds — so an install-time precache would pin the cache to
whichever build first registered it. Warming on every page load sidesteps SW versioning entirely and
keeps `sw.js` a dumb cache-first responder.

The manifest is written to `public/`, **not** `.next/static/`, precisely because the latter is served
immutable and is cache-first in our own SW — which would pin the *manifest itself* to the first build,
forever.

### Consequences

- Offline coverage no longer depends on what the user happened to click while online. Verified: cache
  wiped, one plain `/dashboard` visit with no note opened, server killed → `/dashboard?note=<id>` boots
  with all 42 assets cached and 0 missing.
- Every build ships ~2.4 MB of JS/CSS/fonts to the cache on first load. Acceptable for an app whose whole
  point is working offline; revisit if it grows.
- `public/precache.json` is generated and **gitignored** — the build owns it, not the repo.
- `warmPrecache()` is best-effort: a failing asset, a missing manifest, or an offline load is a silent
  no-op. It must never throw into React.
- Stale entries from a previous build linger in the cache until the `yapper-v1` version is bumped. Small
  and harmless (they're hash-keyed, so nothing *reads* them); prune if it ever matters.

---

## ADR-002: The service worker never caches API responses

### Context

The obvious next step after caching the shell is caching `/api/**` reads so the note list survives
offline. It would also be wrong.

### Decision

The SW intercepts static assets and navigations only. Every API/socket request passes through untouched.

Dexie is already the durable local source of truth for note metadata (ADR-0003) and `y-indexeddb` for
content (ADR-0008); the sync engine already owns retry and backoff while offline. A cached HTTP response
would be a **second, staler authority** competing with Dexie for the same data, with none of the
engine's rollback or CVR-versioning guarantees. The offline read path already exists — it just needs the
shell to be served.

### Consequences

- The SW cannot help a user whose Dexie store is empty (a brand-new device, first visit, offline). Fine —
  they have nothing to read.
- No cache-invalidation coupling between the SW and the sync engine. They stay orthogonal.

---

## ADR-003: A failed session fetch is not a sign-out

### Context

`lib/session.ts` mirrors the Better Auth session to `localStorage` and clears the mirror when
`useSession()` settles with no data. Offline, the session *fetch* fails and settles with no data — so the
mirror is cleared, the dashboard redirects to `/login`, and **going offline logs the user out**.

### Options Considered

1. Gate the clear on `navigator.onLine` — works, but couples auth to a connectivity signal and still
   mishandles a 5xx or a DNS failure while nominally "online".
2. Gate the clear on the absence of a transport `error` — `better-auth/react`'s `useSession` resolves an
   unauthenticated *response* as `data: null, error: null`, and a failed *request* as `error: <fetch
   error>`. That distinction is exactly the question being asked.

### Decision

Option 2: `else if (!live.isPending && !live.error)`.

### Consequences

- Offline (or a flaky API) preserves the session and the app keeps working; only a real "you are not
  signed in" answer, or an explicit sign-out, clears it.
- A session that expires *while the user is offline* stays optimistically rendered until the next
  successful session fetch says otherwise. Correct: the server cookie remains authoritative for every
  actual write, and the sync engine already rolls back rejected mutations (ADR-0009).
