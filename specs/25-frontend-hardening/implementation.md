# 25 · Frontend Hardening — Implementation

## Status: complete — all four slices shipped

Branch: `feat/frontend-hardening` (cut from `main`)

Goal state met on all six acceptance items. Suite: **188 tests / 41 files green**; `tsc --noEmit` clean;
`next build` clean. The two browser checks below are the only things a unit test cannot cover.

## Slices

Ordered so each merges standalone. **25b is the only urgent one** (real data loss); the rest is polish.
25b does not strictly depend on 25a and can go first; 25c genuinely needs the seam.

- [x] **25a — the seam** (`lib/report-error.ts` + test, `lib/query-client.ts`, `app/providers.tsx`)

      Test-first, red confirmed (module absent). One function, not a logger; the Sentry line is a marked
      TODO *inside* it (ADR-001/002).
      - `QueryCache` + `MutationCache` `onError` → `handleError`: `401` → `useAuthStore.markExpired()`
        (feeding 25b's banner + pusher pause), everything else → `reportError`. Covers every read and
        mutation in the app, including unwritten ones. **`lib/http.ts` unchanged**, as designed.
      - `unhandledrejection` listener in `providers.tsx` — the only seam that sees a rejected promise in an
        event handler or a Hocuspocus socket failure. Boundaries catch none of those.
      - Filter (ADR-005): silent for offline / `AbortError` / `ApiError` `401`,`403`,`404` / a `fetch`
        transport `TypeError`. Reports `5xx`, `ZodError`, plain `TypeError`s, and anything unrecognized —
        **report is the default**, so a broken API contract needs no special case to be caught.
      - Context: caller's fields (`noteId`) + `online` + `syncEngine`.

      **Two things the tests caught that review wouldn't have.** `AbortError` is a `DOMException`, which
      is *not* an `instanceof Error` — the first cut's class check silently never matched. And silencing
      `TypeError` wholesale (as the design's "TypeError from fetch" implied) would have swallowed every
      `undefined` deref — precisely the bugs the funnel exists to catch. It now matches the fetch-failure
      *message*, not the type; a browser wording drift over-reports a network blip, which is the safe
      direction to fail (marked `ponytail:`).

      Verified: full `apps/web` suite **178 tests / 38 files green**; `tsc --noEmit` clean.

- [x] **25b — the `401` path** ⚠️ *data loss* (`lib/stores/auth.ts`, `lib/sync/classify.ts` + test,
      `lib/sync/push.ts` + test, `lib/sync/push.rollback.test.ts`,
      `components/session-expired-banner.tsx`, `app/providers.tsx`)

      Test-first, red confirmed: `classifyPushOutcome(new PushTransportError("401", 401))` returned
      `"transient"`, and the pusher's goal-state test couldn't even load. Then:
      - `PushOutcome` gains `{ kind: "auth" }`; `classify` returns it for `status === 401`.
      - **A second bug surfaced while implementing.** `push.ts` wrapped the caught error with
        `new PushTransportError(String(err))` — **discarding the status**. So an `ApiError(401)` reached
        `classify` as a statusless transport error and *no* `classify` fix could ever have seen it. The
        pusher now carries `err.status` across when the error is an `ApiError`. Without this the rest of
        25b is dead code.
      - `auth` → `useAuthStore.markExpired()` and **return without `scheduleRetry`**; `pushOnce` early-
        returns while expired, so nudges can't 401-storm. The queue is never touched, `signOut()` is
        never called.
      - `SessionExpiredBanner` (app-wide, in `providers.tsx`): *"Your session expired — sign in to keep
        saving. Your changes are safe on this device."* + a **Sign in** button → `/login?returnTo=`.

      **Resume needed no code.** Re-auth is an OAuth full-page redirect, so returning signed-in reloads
      the app: the in-memory flag resets and `SyncEngineBootstrap`'s existing `schedulePush()` drains the
      queue. Reused the `/login?returnTo=` flow rather than duplicating provider buttons in the banner.

      Also fixed: both push suites mocked `../http` wholesale (`vi.mock("../http", () => ({ apiFetch }))`),
      which made the real `ApiError` class `undefined` at runtime. They now spread `importActual`.

      Verified: full `apps/web` suite **168 tests / 37 files green**; `tsc --noEmit` clean.
      Still to check in a browser: expire the session cookie → type → banner appears, queue survives a
      reload, sign-in drains it.

- [x] **25c — error surfaces** (`components/error-boundary.tsx` + test, `lib/is-chunk-error.ts` + test,
      `app/global-error.tsx`, `app/error.tsx`, `app/not-found.tsx`,
      `components/dashboard/note-dialog.tsx`, `app/share/[token]/page.tsx`)

      Test-first, red confirmed (both modules absent).
      - `ErrorBoundary`: hand-rolled class, ~25 lines, **no `react-error-boundary`**. `componentDidCatch`
        → `reportError` (a render throw reaches no other seam — without it, white screen and silence).
      - Dialog boundary wraps `<Editor>` with `key={noteId}`. The key **is** the reset: React remounts the
        boundary when the note changes, so a crash on one note leaves no stale fallback on the next — the
        one feature the dependency would have sold us, from the reconciler already running.
      - `EditorCrashed` fallback: recovery is **Close** (blast radius is one note; the dashboard, note
        list and sync engine are all still running behind the dialog) — **Reload** when `isChunkError`,
        because closing wouldn't help a stale-deploy tab and a retry re-requests the same dead URL.
      - `app/error.tsx`: `reset()` normally, `location.reload()` when `isChunkError`.
        `app/global-error.tsx`: **always** reload, never `reset()` — the providers are already unmounted,
        so `reset()` would re-render a corpse. It ships its own `<html>`/`<body>` (no layout above it) and
        deliberately uses no shadcn `Button`, since it renders without the providers.
      - `app/not-found.tsx`: branded 404.
      - `share/[token]` ported to Tailwind/shadcn — the last inline-styled page in the app, and an error
        surface whose `#555` was invisible in dark mode. `apps/web/CLAUDE.md`'s no-inline-styles claim is
        now true.

      Tests: `isChunkError` (3), plus the boundary suite (4) — including the thesis assertion, **the
      surrounding app stays mounted when a child throws**. If that ever flips, the boundary is in the
      wrong place. No tests for `not-found.tsx` / `global-error.tsx`: static JSX, no logic to break.

- [x] **25d — the missing note** (`lib/sync/reads.ts` + test, `components/dashboard/note-dialog.tsx`)

      Test-first, red confirmed (3 new assertions failed; the 9 existing `reads` tests kept passing).
      - **Root cause was in the read, not the dialog.** `useLiveQuery` yields `undefined` while it
        resolves, and `db.notes.get` yields `undefined` for a row that isn't there — so
        `loading: note === undefined` left a missing note *loading forever*. `useLocalNote` now returns
        `?? null`: `undefined` = haven't looked yet, `null` = looked, it's gone. That sentinel is the
        whole fix; `useNoteDetail` derives `loading | found | missing` from it.
      - The Query (flag-off) path maps a `404` — `isPending: false`, no data — to the same `missing`.
      - `NoteMissing` in the dialog, with **offline-aware copy**: online → *"It was deleted, or the owner
        made it private"*; offline → *"This note isn't on this device yet"*. Different sentences, and we
        know which is true.

      **Deviation from design.md, deliberate.** The design said the dialog shows *spinner → editor →
      missing*. Gating the editor behind `status === "found"` would put a spinner between click and
      editor, regressing the **instant open** that specs 13/16 bought on purpose — Dexie answers in
      milliseconds, so that spinner is a flash, and a flash of "gone" for a note that exists is a worse
      lie than no state at all. The editor therefore renders while `loading` **or** `found` (today's
      behavior, preserved); only a *confirmed* `missing` swaps it out.

## Verification

From `apps/web`:

```
bunx vitest run --maxWorkers=1      # full suite OOMs on a parallel run
bun run check-types
```

Browser checks that no unit test covers:
- 25b: expire/clear the session cookie → type in a note → banner appears, queue survives a reload, and
  sign-in drains it.
- 25c: throw inside `Editor` → dialog shows the fallback, dashboard/sidebar/note list still working.
- 25c: `ChunkLoadError` (long-lived tab across a deploy) → the button says **Reload** and actually fixes
  it.

## Notes / gotchas

- Run tests from `apps/web`, not the repo root.
- Error boundaries catch **render throws only** — not event handlers, not async, not TanStack Query errors
  (Query returns errors as state). Three of the four seams are deliberately not boundaries.
