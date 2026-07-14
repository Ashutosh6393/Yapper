# 25 · Frontend Hardening — Design

Make `apps/web` fail **visibly, honestly, and recoverably**. Today the app handles its *expected* errors
reasonably (`toast.error` on mutation failure, the sync engine's transient/permanent classification) and
handles its *unexpected* ones not at all: there is no error boundary anywhere, no `error.tsx`, no
`global-error.tsx`, no `not-found.tsx`, and **zero logging in the entire app** (not one `console.*`). A
render throw in `Editor.tsx` is a white screen. A `401` silently bricks saving.

The bar for this spec is **portfolio-tier**, deliberately: *the app never white-screens, never shows a
stack trace, and never silently lies*. It is **not** "ship logs to a dashboard". Every error funnels
through one `reportError()` seam so that adding Sentry later is a one-line diff inside that function —
the funnel is the deliverable, not the transport.

## The four seams

Errors reach us through exactly four doors. Everything in this spec hangs off one of them.

| Seam | Covers |
|------|--------|
| `QueryCache` / `MutationCache` `onError` | Every read + mutation in the app, retroactively |
| `classify` → new `auth` outcome | The pusher (it does not go through TanStack Query) |
| `window.addEventListener("unhandledrejection")` | Stray async — Hocuspocus socket, effects |
| Error boundaries | Render-phase throws **only** |

**Error boundaries catch far less than people assume.** They do not catch event handlers, async code,
promise rejections, or TanStack Query errors (Query *returns* errors as state; it does not throw). They
are the floor, not the plan — which is why three of the four seams are not boundaries.

## The four gaps, root-caused

### Gap 1 — `401` is classified transient, so an expired session silently stops saving (data loss)

`lib/sync/classify.ts:12` and `lib/sync/push.ts:14` deliberately lump `401` in with offline / timeout /
`5xx`, and `lib/sync/backoff.ts:6` states — correctly, for its intended case — *"There is deliberately no
max-attempts."* Nothing in `apps/web` handles a `401` anywhere.

Trace an expired session: every push `401`s → classified transient → retried forever, capped at 30s → the
user keeps typing → mutations pile up in Dexie → **nothing ever saves**. `useNotes` also `401`s, so they
get one orphaned `"Couldn't refresh notes"` toast (`app/dashboard/page.tsx:122`) and no explanation. The
app is bricked, silently, and looks fine.

The taxonomy is missing a category, not wrong. Retrying forever is *right* for offline — waiting genuinely
fixes it. **Waiting does not fix an expired session.** A `401` is neither transient nor a permanent
per-mutation rejection; it is a third thing: *the queue is fine, the session is dead.*

This matters more here than in a normal app: offline-first means the client is **expected** to come back
after a long absence (closed laptop, three days). A `401` is not an edge case in this architecture — it is
the normal path for any user who shuts the lid over a weekend.

**Never `signOut()` on a `401`.** The unsent mutations are in Dexie keyed to that user. Tearing down the
session to "handle" the error discards their unsaved writing — a worse bug than the one being fixed.

### Gap 2 — the note dialog renders an editor for a note that does not exist

`components/dashboard/note-dialog.tsx:41` reads `useNoteDetail(noteId ?? "").note`, which is `undefined`
when the note is missing. Line 65 then branches on `noteId` — **not on `note`** — and renders `<Editor>`
anyway. Opening `/dashboard?note=<made-up-id>` yields an empty dialog, a blank editor, an sr-only title of
`"Note"`, and a WebSocket connecting to a note that isn't there. No error, no message. **Silently wrong is
worse than crashing** — a crash you would at least see.

`undefined` is ambiguous: it means *loading from Dexie*, *doesn't exist*, and *access revoked*, all at
once. The right UI cannot be chosen without distinguishing them.

This is **reachable through a normal flow**, not a hand-typed URL: an owner makes a note private (spec 07)
→ the collaborator's dashboard link now points at a note they cannot read. The `kick` handler
(`note-dialog.tsx:73-80`) only fires for a *connected* editor, so a collaborator who was **offline** at
revoke time and opens the note later gets exactly the silent empty dialog.

### Gap 3 — a render crash takes the whole app, and recovery buttons that cannot work

There is no boundary of any kind. TipTap + Yjs + Hocuspocus + a CRDT doc is by a wide margin the most
crash-prone code in the repo, and it is mounted **inside** the most valuable surface (the dashboard, via
`dynamic()` in `note-dialog.tsx:13`). A throw there is a white screen.

The stale-deploy `ChunkLoadError` is the concrete case. The service worker (spec 24b) is well-built —
content-hashed cache-first assets, network-first navigations, `warmPrecache` pulling the full manifest —
which closes most of this. What it cannot close: a **long-lived tab across a deploy**. The old hashed
chunks are gone from the server; opening a note fetches the old editor chunk URL → 404 → `ChunkLoadError`
→ into the boundary.

And this is where error pages are near-universally wrong: **Next's `reset()` is a lie for a
`ChunkLoadError`.** It re-renders the same subtree, which re-requests the same dead chunk from the same
router, and fails identically. A "Try again" button that cannot work is worse than no button — it burns
the user's trust in every recovery affordance you have. Only `location.reload()` (fresh HTML → new chunk
URLs) actually fixes it.

### Gap 4 — the error surfaces are the only undesigned surfaces in the app

`app/share/[token]/page.tsx` is the **last inline-styled page** in `apps/web` — `fontFamily: "system-ui"`,
`color: "#555"`, a hand-rolled `ghostBtn`. `apps/web/CLAUDE.md` currently claims *"No inline `style`
objects remain except genuinely dynamic values."* That claim is false, and the file where it is false is
an **error surface**: the "This share link is invalid or no longer active" screen. `#555` on the dark
theme's background is effectively invisible.

So today, the single most likely moment a user sees something go wrong is *also* the only moment the app
stops looking like itself. Error paths went undesigned because nobody looks at them until they fire.

A stock Next 404 is the same seam in miniature — the framework leaking through the one artifact whose
entire purpose is to be looked at.

## Goal State (acceptance)

1. **An expired session never loses data.** With a `401` from the pusher: the queue stays intact in Dexie,
   the pusher pauses (no infinite retry), the user sees *"Your session expired — sign in to keep saving"*
   with a sign-in button. On successful re-auth the pusher resumes and the queue drains. `signOut()` is
   never called on a `401`.
2. **A missing note says so.** `useNoteDetail` reports `loading | found | missing`. The dialog shows a
   spinner, the editor, or *"This note doesn't exist or was made private"* respectively — never a blank
   editor for a note that isn't there. Offline, `missing` says *"not synced yet"*, not *"gone"*.
3. **A render crash costs one dialog, not the app.** A throw inside `Editor` renders a fallback inside the
   dialog with a **Close** button; the dashboard, the note list, the Query cache and the sync engine stay
   mounted and working. Opening a different note afterwards shows a working editor.
4. **Every recovery button works.** A `ChunkLoadError` offers **Reload** (`location.reload()`), not "Try
   again". `global-error.tsx` offers reload, never `reset()` (its providers are already unmounted — it
   would be re-rendering a corpse).
5. **One funnel, and it is quiet.** Every unexpected error in the app reaches `reportError()`. It stays
   *silent* for offline, `AbortError`, and expected `ApiError` statuses (`401`/`403`/`404`); it *reports*
   `5xx`, `ZodError`, render crashes, and anything unrecognized.
6. **Nothing looks unbranded.** `not-found.tsx` and `share/[token]` render in brand tokens with shadcn
   components and work in dark mode. `apps/web/CLAUDE.md`'s no-inline-styles claim becomes true.

## Design

### `lib/report-error.ts` — the seam

One function. Not a logger.

```ts
reportError(err: unknown, context?: Record<string, unknown>): void
```

Today it is a filtered `console.error`. Tomorrow a `Sentry.captureException(err, { extra: ctx })` goes on
the line below, and **every call site in the app is covered retroactively**. That property — the funnel —
is the entire point; levels, child loggers, transports and ring buffers are machinery in service of
shipping logs somewhere, and we are explicitly not shipping them anywhere (see *Non-goals*).

**The filter is the highest-value code in this spec.** In an offline-first app, an unfiltered funnel fires
constantly for reasons that are not bugs: go offline for ten minutes and every `useNotes` refetch, every
retry, throws. Report all of it and the first hour of real Sentry data is ten thousand "network request
failed" events with the one real `TypeError` buried underneath. That is how error tracking dies — not from
missing errors, from drowning in expected ones.

**Silent** (an early return, not a report):
- `navigator.onLine === false`
- network-class failures — `TypeError` from `fetch`, `AbortError`
- *expected* `ApiError` statuses: `401` (Gap 1 handles it), `403`, `404` (Gap 2 handles it)

**Always reports:**
- `ZodError` — **loudly.** A `noteSummarySchema.parse()` throw means the API returned a shape the client
  does not understand: a contract break between two apps in one monorepo. It is *always* a bug, never a
  network condition, and today it surfaces as a generic `"Couldn't refresh notes"` toast. Highest-signal
  error class in the app.
- `5xx` — even though `classify.ts` calls it transient. The pusher is right to *retry* it, but "we
  recovered" and "nothing was wrong" are different claims. Retry and report are not in conflict.
- render crashes, and anything unrecognized.

**Context** is what makes the future Sentry swap useful rather than noise: `noteId`, `navigator.onLine`,
whether the sync engine is on, and last sync state. A stack trace from `Editor.tsx` with no note id and no
idea whether the user was offline is nearly worthless; with those four fields it is usually reproducible
without asking. Ten lines of value, routinely skipped by people busy building log levels.

### Detection: TanStack's cache callbacks, not an interceptor

```ts
new QueryClient({
  queryCache: new QueryCache({ onError: handleError }),
  mutationCache: new MutationCache({ onError: handleError }),
})
```

`handleError` checks `err instanceof ApiError && err.status === 401` → flips the auth store to `expired`;
everything else → `reportError`.

This covers **every read and mutation in the app, including ones not yet written**, and `lib/http.ts` does
not change at all — it stays a dumb fetch wrapper that throws `ApiError`. The alternative (a `401` check
inside `apiFetch`) would make HTTP stateful by coupling it to the auth store, to hand-roll an interceptor
TanStack has shipped the whole time.

The pusher does not go through Query, so it gets the same treatment via the new `auth` outcome in
`classify`. Two call sites, both of which must exist anyway.

### `PushOutcome` gains a third variant

```ts
type PushOutcome =
  | { kind: "settled"; rejected: RejectedMutation[] }
  | { kind: "transient" }
  | { kind: "auth" };        // queue is fine; the session is dead
```

`auth` → pause the pusher (**do not** schedule a retry — waiting cannot fix this), keep the queue, raise
the re-auth banner. On successful sign-in: resume, reset backoff, drain.

### One boundary, hand-rolled

`components/error-boundary.tsx`, ~25 lines, class component (`getDerivedStateFromError` +
`componentDidCatch` → `reportError`). **No `react-error-boundary` dependency.**

The library's headline feature over a hand-roll is `resetKeys` — auto-clearing the fallback when a value
changes, so the user is not stuck staring at it forever. We need exactly that (crash on note A → open note
B → working editor). But `note-dialog.tsx:67` **already** passes `key={noteId}` to `<Editor>`. Put the
boundary around the editor with the same `key={noteId}` and **React remounts it on note change — the error
state resets for free**, from the reconciler already running. The library's selling point is a native React
behavior we are one line from having.

**Placement is the whole design.** The dialog boundary is the only place in this codebase where the blast
radius and the correct recovery genuinely differ from everything else: the crashiest code in the repo,
mounted inside the most valuable surface. It converts *"the app is dead"* into *"that one note wouldn't
open"*, and its recovery is **Close** — not retry. Dashboard survives, sync keeps running, open another
note.

Boundaries belong where there is a **meaningful recovery**, not where there is a component. Wrapping every
note card would render a broken card inside a working list that nobody ever notices — worse than crashing
loudly. A card has no recovery. The dialog does.

### Recovery, per surface

| Surface | Button | Why |
|---------|--------|-----|
| Dialog boundary | **Close** | Blast radius is one note; the app is fine |
| Dialog boundary, `ChunkLoadError` | **Reload** | `reset()` re-requests the same dead chunk. Only fresh HTML fixes it |
| `app/error.tsx` | **Try again** (`reset()`), or **Reload** if `isChunkError` | A fair bet for a transient render throw |
| `global-error.tsx` | **Reload**, never `reset()` | Root layout + providers are already unmounted |

`isChunkError(err)` is a three-line name/message check.

## Non-goals

- **No logging system.** No levels, transports, child loggers, or ring buffer. No `/api/logs` endpoint. A
  browser logging system exists to get information *out of the browser and to you*; we are not building
  that pipe, so all that machinery would ship logs to a console only the author reads. If you cannot name
  the screen you would open at 2am, you do not want a logging system — you want error *reporting*.
- **No Sentry (yet).** The seam makes it a one-line diff when there are users to page someone about.
- **No `react-error-boundary`** — see above.
- **No boundaries around cards, the sidebar, or the note list.** No recovery exists there.
- **No tests for `not-found.tsx` / `global-error.tsx`.** Static JSX with a link and a button: no logic to
  break; a test asserting the `h1` copy tests the copy, not the code.
- **`apps/web` only.** `apps/api`'s bare `console.*` logging (`src/index.ts`, `src/cron.ts`) is out of
  scope.

## Slices → PRs

Ordered so each merges standalone.

| Slice | Contents | Test |
|-------|----------|------|
| **25a — the seam** | `lib/report-error.ts` (+ Q7 filter), `QueryCache`/`MutationCache` `onError` in `lib/query-client.ts`, `unhandledrejection` in `app/providers.tsx` | the filter |
| **25b — the `401` path** ⚠️ | `auth` outcome in `lib/sync/classify.ts`, pusher pause/resume, auth store, re-auth banner, drain on sign-in | `classify` → `auth` |
| **25c — error surfaces** | `components/error-boundary.tsx`, `isChunkError`, `app/global-error.tsx`, `app/error.tsx`, dialog boundary (`key={noteId}`), `app/not-found.tsx`, port `app/share/[token]/page.tsx` to shadcn | `isChunkError` + one boundary integration test |
| **25d — the missing note** | `useNoteDetail` → `loading \| found \| missing`, dialog branches, offline-aware copy | the three states |

**25b is the only urgent one** — it is real data loss; 25c and 25d are (valuable) polish. If time-boxed,
ship 25a → 25b. An app that silently stops saving is a worse look on a portfolio than a plain 404 page.

25b does not strictly depend on 25a (`classify` is self-contained) and can go first. 25c genuinely needs
the seam.
