# 24 · Offline — Design

Make Yapper usable with **no network**: open the app, read your notes, create and edit them, and have
every change reconcile automatically when the connection returns.

This spec does **not** build an offline data layer — one already exists. Specs **14–21** shipped the
local-first sync engine (ADR-0002): Dexie is the durable local source of truth, the mutation queue is
IndexedDB-backed, note ids are client-minted (spec 18), note content is a Yjs doc with `y-indexeddb`
**always** attached (spec 20 / ADR-0008), and both the pusher and the puller already back off while
`navigator.onLine === false` and fire immediately on the `online` event (`lib/sync/backoff.ts:58,72`,
`lib/sync/poke.ts:43`). Spec 23 turned the engine on in prod.

Editing inside an **already-open tab** with the network cut therefore mostly works today. Three things
stop it from being an offline app:

## The three gaps, root-caused

### Gap 1 — a failed session fetch is misread as a sign-out

`apps/web/lib/session.ts:60`:

```ts
} else if (!live.isPending) {
  clearPersistedSession();   // ← also fires when the fetch failed because we're offline
  setCached(null);
}
```

`usePersistedSession` mirrors the Better Auth session to `localStorage` so a reload renders instantly.
But it distinguishes only *pending* from *not pending*. Offline, the `/api/auth/get-session` fetch
**fails** — `data` is `null`, `isPending` is `false` — which is indistinguishable, to this code, from a
confirmed sign-out. So it wipes the mirror, `dashboard/page.tsx:129` (`if (!isPending && !session)
router.replace("/login")`) bounces the user to `/login`, and `/login` offline is a dead page with two
OAuth buttons that cannot work. **Being offline logs you out.** This is the single biggest offline bug
and it is a one-condition fix: only a *confirmed unauthenticated response* (`data == null` **and** no
transport `error`) is a sign-out.

### Gap 2 — the app shell does not load offline

There is no service worker and no web app manifest (`apps/web/public/` holds one static HTML file). A
cold load with no network is the browser's error page, no matter how complete the local store is. The
durable Dexie/Yjs data is unreachable because the code that reads it never gets served.

Two facts make the fix unusually small:

- **Next's build output is content-hashed and immutable** (`/_next/static/**`). It can be cached
  cache-first, forever, with no precache manifest and no invalidation logic.
- **Notes open as `/dashboard?note=<id>`** (spec 22 — the URL *is* the dialog state). Ignoring the query
  string, the whole logged-in surface is **one document: `/dashboard`**. Caching that single navigation
  response makes every note reachable offline.

### Gap 3 — the app never says it is offline

Nothing in the UI reflects connectivity. A user typing offline gets no signal that their changes are
queued rather than saved, which reads as data loss even though nothing is lost.

## Goal State (acceptance)

1. **Offline does not sign you out.** With the network off, a reload of `/dashboard` keeps the user
   signed in and rendered from the persisted session. An explicit sign-out, and a genuine 401/expired
   session while **online**, still clear the mirror and redirect to `/login`.
2. **Cold load works offline.** After one online visit to `/dashboard`, killing the network and loading
   `/dashboard` (or `/dashboard?note=<id>`) serves the cached shell and boots the app — the note list
   renders from Dexie, and note bodies render from `y-indexeddb`.
3. **Offline writes.** With no network: creating a note, editing its content, renaming/archiving/
   trashing/labelling it all apply instantly and persist across a reload (Dexie queue + Yjs local state).
4. **Automatic reconciliation.** On reconnect, the queued mutations push and the CVR pull runs with no
   user action and no page reload; the private-note content flush re-fires. Server state converges with
   what was done offline.
5. **Visible state.** An offline indicator appears in the dashboard header while `navigator.onLine` is
   false and disappears on reconnect.

## Design

### 24a — Session: don't confuse offline with signed-out

`apps/web/lib/session.ts` — clear the mirror only on a confirmed unauthenticated response:

```ts
// A failed fetch (offline / 5xx) leaves `error` set — that is NOT a sign-out. Only a resolved
// "no session" response clears the mirror, so going offline can't log the user out.
} else if (!live.isPending && !live.error) {
  clearPersistedSession();
  setCached(null);
}
```

`useSession()` from `better-auth/react` surfaces the transport failure on `error` (a `BetterFetchError`)
while an unauthenticated *response* resolves with `data: null, error: null`. That is exactly the
discriminator we need — no `navigator.onLine` check, no new state.

`clearPersistedSession()` on explicit sign-out (`dashboard/page.tsx:35`) is untouched, so a shared
browser still cannot re-render the previous user's shell.

### 24b — Service worker: one file, no dependency

New `apps/web/public/sw.js` (~35 lines), registered from `app/providers.tsx` in production only (a SW in
`next dev` fights HMR). Three rules, one cache (`yapper-v1`):

| Request | Strategy | Why |
|---|---|---|
| `/_next/static/**` (+ `/fonts`, icons) | **cache-first** | content-hashed & immutable — safe forever, no invalidation |
| navigations (`request.mode === "navigate"`) | **network-first**, fall back to the cached document keyed by **pathname** (query stripped), else the cached `/dashboard` | fresh when online; the whole logged-in surface is `/dashboard` (spec 22) |
| everything else (`/api/**`, `/_next/data`, the socket) | **not intercepted** | the sync engine already owns retry/backoff; a cached API response would fight Dexie for authority |

Never cached, ever: any request to the API origin or a `POST`/`PUT`/`DELETE`. Auth and note data have
exactly one client-side home (the cookie and Dexie); the SW must not become a second, staler one.

No `next-pwa` / `serwist`. Those exist to generate a precache manifest at build time and wire it into the
Next build — machinery we don't need, because Next's assets are already hash-immutable and our offline
surface is a single document. A dependency + build config would be strictly more code than the file it
replaces.

Also add `public/manifest.webmanifest` + the `manifest` link so the app is installable and launches
standalone from the cached shell. (Icons: reuse the existing brand mark.)

### 24c — Offline indicator

A `useOnline()` hook (`navigator.onLine` + the `online`/`offline` events — the same two events
`backoff.ts` already binds) and a small `<OfflineBadge/>` in the dashboard header: *"Offline — changes
saved on this device."* Nothing else changes; the queue is already durable, the badge only tells the
truth about it.

## Out of scope

- **Offline login.** OAuth requires the network, by definition. A signed-out user offline sees `/login`;
  that is correct. Offline only has to preserve an *existing* session (24a).
- **Background Sync API / periodic sync.** The `online` listener already reconciles on reconnect and
  works in every browser; Background Sync would only add reconciliation while the tab is *closed*.
- **Offline capability-link joins** (`/share/:token`) — joining is a server-authoritative permission
  grant; it cannot be faked locally.
- **Offline realtime collaboration.** Hocuspocus needs a socket. Offline edits to a *shared* note stay in
  the local Yjs doc and merge (CRDT) on reconnect — which is already the behaviour, and is enough.
- **Per-route precache.** Offline cold-load of an uncached route (`/`, `/login`) falls back to the
  `/dashboard` shell. Acceptable: those routes are only useful online.

## Files

| File | Change |
|---|---|
| `apps/web/lib/session.ts` | 24a — one condition (`&& !live.error`) |
| `apps/web/lib/session.test.ts` | 24a — new: offline ≠ sign-out |
| `apps/web/public/sw.js` | 24b — new (~35 lines) |
| `apps/web/public/manifest.webmanifest` | 24b — new |
| `apps/web/app/providers.tsx` | 24b — register the SW (prod only) |
| `apps/web/app/layout.tsx` | 24b — `manifest` metadata |
| `apps/web/lib/use-online.ts` | 24c — new hook |
| `apps/web/components/dashboard/offline-badge.tsx` | 24c — new |
| `apps/web/app/dashboard/page.tsx` | 24c — mount the badge in the header |

No API, socket, DB, schema, or dependency changes. `apps/web` only.
