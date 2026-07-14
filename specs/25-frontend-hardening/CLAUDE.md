# CLAUDE.md — 25 · Frontend Hardening

## Project Context

Make `apps/web` fail visibly, honestly, and recoverably. The app handles its *expected* errors fine
(`toast.error` on mutations, the sync engine's transient/permanent split) and its *unexpected* ones not at
all: no error boundary anywhere, no `error.tsx`/`global-error.tsx`/`not-found.tsx`, and zero logging (not
one `console.*` in the whole app).

Four slices: the `reportError` seam (25a), the `401` data-loss fix (25b), the error surfaces (25c), the
missing-note states (25d). **25b is the only urgent one** — an expired session currently retries forever
and silently stops saving.

The bar is **portfolio-tier**: never white-screen, never show a stack trace, never silently lie. It is
**not** "ship logs to a dashboard".

## Before Starting Work

1. Read `specs/25-frontend-hardening/design.md` — especially "The four gaps, root-caused".
2. Check `implementation.md` for current progress.
3. Read `apps/web/CLAUDE.md`, then the code this spec touches:
   - `lib/sync/classify.ts`, `lib/sync/push.ts`, `lib/sync/backoff.ts` (the `401`-as-transient bug)
   - `lib/query-client.ts`, `lib/http.ts` (`ApiError`), `app/providers.tsx`
   - `components/dashboard/note-dialog.tsx` (the blank-editor bug), `lib/sync/reads.ts`
   - `app/share/[token]/page.tsx` (the last inline-styled page)

## Code Patterns

- **Test-first** (repo rule). Goal-state test per slice: 25a → the `reportError` filter; 25b → `classify`
  returns `auth` for `401`; 25c → `isChunkError` + one boundary integration test; 25d → the three states.
- Tests live next to source as `*.test.ts(x)`, jsdom + Testing Library. Run from `apps/web` with
  `bunx vitest run --maxWorkers=1` — **the full suite OOMs on a parallel run.**
- Detect errors at the **cache callbacks** (`QueryCache`/`MutationCache` `onError`), never inside
  `apiFetch`. `lib/http.ts` stays a dumb fetch wrapper that throws `ApiError`.
- The dialog boundary carries `key={noteId}` — that is `resetKeys`, for free, from the reconciler.
- Strict TS, no `as any`. Biome from the repo root. Brand tokens (`bg-background`, `text-muted-foreground`,
  …) + shadcn components — never hard-coded colors, so dark mode works.

## Don't

- **Don't `signOut()` on a `401`.** The unsent mutations are in Dexie keyed to that user; tearing down the
  session discards their unsaved writing. Pause the pusher, keep the queue, prompt re-auth, drain on
  sign-in.
- **Don't schedule a retry for an `auth` outcome.** Waiting cannot fix an expired session — that is the
  whole bug.
- **Don't build a logger.** No levels, transports, child loggers, ring buffer, or `/api/logs`.
  `reportError` is one function. Adding Sentry later must be a one-line diff *inside* it.
- **Don't report expected errors.** Offline, `AbortError`, `401`/`403`/`404` are silent. `5xx`, `ZodError`,
  render crashes always report. A noisy funnel is a dead funnel.
- **Don't add `react-error-boundary`** — `key={noteId}` already gives us the only feature we'd want.
- **Don't wire a "Try again" to `reset()` for a `ChunkLoadError`** — it re-requests the same dead chunk and
  does nothing. Reload, or don't offer the button.
- **Don't add boundaries around cards / the sidebar / the note list.** No meaningful recovery exists there.
- Don't touch `apps/api`, `apps/socket`, or any package. This spec is `apps/web` only.
- Don't add features not in design.md.
