# 25 · Frontend Hardening — Implementation

## Status: in-progress

Branch: `feat/frontend-hardening` (cut from `main`)

## Slices

Ordered so each merges standalone. **25b is the only urgent one** (real data loss); the rest is polish.
25b does not strictly depend on 25a and can go first; 25c genuinely needs the seam.

- [ ] **25a — the seam** (`lib/report-error.ts` + test, `lib/query-client.ts`, `app/providers.tsx`)
      One function, not a logger. `QueryCache`/`MutationCache` `onError` → `handleError`: `401` flips the
      auth store, everything else → `reportError`. `unhandledrejection` listener for stray async.
      Goal-state test **first** (`lib/report-error.test.ts`): offline → silent; `AbortError` → silent;
      `401`/`403`/`404` → silent; `500` → reports; `ZodError` → reports.
      `lib/http.ts` must not change.

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

- [ ] **25c — error surfaces** (`components/error-boundary.tsx` + test, `lib/is-chunk-error.ts` + test,
      `app/global-error.tsx`, `app/error.tsx`, `components/dashboard/note-dialog.tsx`,
      `app/not-found.tsx`, `app/share/[token]/page.tsx`)
      Hand-rolled class boundary (~25 lines, no `react-error-boundary`), `componentDidCatch` →
      `reportError`. Wrap the editor inside the dialog with `key={noteId}` (free `resetKeys`); fallback's
      recovery is **Close**, or **Reload** when `isChunkError`. `global-error.tsx` reloads, never
      `reset()`.
      Also ports `share/[token]` off inline styles to shadcn/brand tokens — it is the last inline-styled
      page in the app and, fittingly, an error surface whose `#555` text is invisible in dark mode. Makes
      `apps/web/CLAUDE.md`'s no-inline-styles claim true.
      Tests: `isChunkError`, plus **one** boundary integration test (child throws → fallback renders →
      `reportError` called → **the dashboard is still mounted**; that last assertion is the thesis).
      No tests for `not-found.tsx` / `global-error.tsx` — static JSX, no logic.

- [ ] **25d — the missing note** (`lib/sync/reads.ts` + test, `components/dashboard/note-dialog.tsx`)
      `useNoteDetail` → `loading | found | missing` (today `undefined` conflates all three, and
      `note-dialog.tsx:65` branches on `noteId` rather than `note`, so a nonexistent note renders a blank
      editor + a live WebSocket). Dialog branches spinner / editor / *"This note doesn't exist or was made
      private"*. Offline, `missing` reads *"not synced yet"*, not *"gone"*.
      Reachable through a normal flow: owner revokes (spec 07) while a collaborator is offline → the
      `kick` handler never fires for them → silent blank dialog on next open.

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
