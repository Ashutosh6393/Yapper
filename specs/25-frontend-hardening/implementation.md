# 25 · Frontend Hardening — Implementation

## Status: not started

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

- [ ] **25b — the `401` path** ⚠️ *data loss* (`lib/sync/classify.ts` + test, `lib/sync/push.ts`,
      `lib/sync/backoff.ts`, a `lib/stores/` auth flag, the re-auth banner)
      Goal-state test **first**: `classifyPushOutcome` returns `{ kind: "auth" }` for a
      `PushTransportError` with `status: 401` (today it returns `transient` and retries forever).
      Then: pause the pusher on `auth` (**no** `scheduleRetry` — waiting cannot fix an expired session),
      keep the queue intact in Dexie, raise *"Your session expired — sign in to keep saving"*, and on
      successful re-auth resume + `resetBackoff()` + drain.
      **Never `signOut()`** — the queue is keyed to that user.

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
