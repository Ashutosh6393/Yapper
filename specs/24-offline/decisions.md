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
