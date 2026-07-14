# 25 · Frontend Hardening — Decisions

## ADR-001 — `reportError` is one function, not a logging system

**Context.** The ask was "a proper logging system". `apps/web` has zero logging today.

**Decision.** `lib/report-error.ts` exports one function: `reportError(err, context?)`. No levels, no child
loggers, no transport interface, no ring buffer, no `/api/logs` endpoint.

**Why.** A browser logging system's only purpose is to get information *out of the user's browser and to
you*. Levels, transports and buffers are all machinery in service of that pipe. We are explicitly not
building the pipe (ADR-002), so every one of those parts would ship logs to a `console` that only the
author reads — a delivery system with no destination. What we actually want is the property that **every
error funnels through one function**, so adding Sentry later is a one-line diff *inside* it, covering every
call site retroactively. The funnel is the deliverable; the abstraction is not. Log levels are something
the browser already gives us for free.

**Consequence.** If you cannot name the screen you would open at 2am, you do not want a logging system —
you want error *reporting*.

## ADR-002 — Portfolio bar, but keep the seam

**Decision.** Target: never white-screen, never show a stack trace, never silently lie. No Sentry yet.

**Why.** Nothing suggests real users yet. But the upgrade path is kept free by ADR-001: the day there are
users, `Sentry.captureException` goes on one line inside `reportError` and the whole app is covered.

## ADR-003 — `401` is a third outcome, not "transient"

**Context.** `classify.ts:12` lumps `401` in with offline/timeout/`5xx`; `backoff.ts:6` has deliberately no
max-attempts. Nothing in `apps/web` handles `401`.

**Decision.** Add `{ kind: "auth" }` to `PushOutcome`. Pause the pusher (no retry scheduled), keep the
queue in Dexie, prompt re-auth, drain on sign-in. **Never call `signOut()`.**

**Why.** The existing taxonomy is missing a category, not wrong. Retrying forever is *correct* for offline
— waiting genuinely fixes it. **Waiting does not fix an expired session**, so the current code retries
forever at a 30s cap while the user keeps typing and nothing saves: silent data loss that looks fine.

`signOut()` — the conventional fix — is worse than the bug. The unsent mutations sit in Dexie keyed to that
user; tearing down the session discards their unsaved writing to "handle" the error.

Offline-first makes this the *normal* path, not an edge case: the client is expected to come back after a
long absence (a laptop closed over a weekend), and the token will have expired while it sat there.

**Consequence.** This is the one place in this spec where laziness does not apply — the failure mode is
data loss. ~30 lines: one outcome variant, a paused flag, a banner, a resume.

## ADR-004 — Detect errors at TanStack's cache callbacks, not inside `apiFetch`

**Decision.** `new QueryClient({ queryCache: new QueryCache({ onError }), mutationCache: new MutationCache({ onError }) })`.
`lib/http.ts` does not change.

**Why.** This covers every read and mutation in the app — including ones not yet written — with two call
sites that must exist anyway. The alternative, a `401` check inside `apiFetch`, makes HTTP stateful by
coupling it to the auth store, in order to hand-roll an interceptor TanStack has shipped the whole time.
`http.ts` stays a dumb fetch wrapper that throws `ApiError`.

**Consequence.** Four seams total, not four hundred: cache callbacks (all API), `classify` → `auth` (the
pusher, which bypasses Query), `unhandledrejection` (stray async), error boundaries (render throws).

## ADR-005 — The filter is the point

**Decision.** `reportError` early-returns for `!navigator.onLine`, network-class failures (`TypeError` from
`fetch`, `AbortError`), and expected `ApiError` statuses (`401`/`403`/`404`). It always reports `ZodError`,
`5xx`, render crashes, and anything unrecognized.

**Why.** In an offline-first app an unfiltered funnel fires constantly for things that are not bugs — ten
minutes offline is a refetch storm. Report all of it and the first hour of real Sentry data is ten thousand
"network request failed" events with the one real `TypeError` buried underneath. Error tracking dies from
drowning in expected errors, not from missing them. Reporting a handled `404` is reporting our own feature
(25d) working.

A **`ZodError` always reports, loudly**: it means the API returned a shape the client does not understand —
a contract break between two apps in one monorepo. Always a bug, never a network condition, and today it
surfaces as a generic "Couldn't refresh notes" toast. Highest-signal error class we have.

A **`5xx` reports even though `classify` retries it.** "We recovered" and "nothing was wrong" are different
claims; retry and report are not in conflict.

## ADR-006 — One boundary, around the editor, hand-rolled

**Decision.** `global-error.tsx` + `app/error.tsx` (free, framework files) + **one** component boundary
around the editor inside the note dialog, carrying `key={noteId}`. ~25-line class component. No
`react-error-boundary`.

**Why placement.** Boundaries belong where there is a **meaningful recovery**, not where there is a
component. TipTap + Yjs + Hocuspocus is the crashiest code in the repo and it is mounted *inside* the
dashboard, so a boundary there converts "the app is dead" into "that one note wouldn't open" — and its
recovery is **Close**: the dashboard, Query cache and sync engine all keep running. A note card has no such
recovery; wrapping every card would render a broken card in a working list that nobody notices, which is
worse than crashing loudly.

`global-error.tsx` is a *last resort*, not a plan — it unmounts the root layout and every provider.

**Why hand-rolled.** The library's headline feature over a hand-roll is `resetKeys`. `note-dialog.tsx:67`
already passes `key={noteId}` to `<Editor>`; putting the boundary around it with the same key means React
remounts the boundary on note change and **the error state resets for free**, from the reconciler already
running. The dep's selling point is a native React behavior we are one line from having. Its other feature,
`useErrorBoundary` (throwing async errors into a boundary), is unnecessary because ADR-004 routes async
errors through the cache callbacks instead.

**Revisit if** several boundaries with different fallbacks and reset semantics appear. One implementation
is not a library.

## ADR-007 — `reset()` is a lie for a `ChunkLoadError`

**Decision.** Branch the recovery button on the error. `isChunkError` → **Reload** (`location.reload()`).
Otherwise → **Try again** (`reset()`). `global-error.tsx` always reloads.

**Why.** Every tutorial wires Next's `reset()` to "Try again". For a `ChunkLoadError` — the most likely
error this app will actually throw, from a long-lived tab across a deploy — `reset()` re-renders the same
subtree, re-requests the same dead chunk URL from the same router, and fails identically. A button that
cannot work is worse than no button: it burns the user's trust in every recovery affordance. Only fresh
HTML (with the new chunk URLs) fixes it.

`global-error.tsx` always reloads because by the time it renders, the providers are gone — `reset()` would
be re-rendering a corpse.

**Not** "always reload": in the *dialog* boundary a full reload nukes the sync engine, the Query cache and
the Yjs docs to fix a problem scoped to one dialog.

## ADR-008 — Error boundaries are the floor, not the plan

**Not a decision so much as the constraint that shaped every other one.** React boundaries catch
render-phase throws only. They do **not** catch event handlers, async code, promise rejections, or TanStack
Query errors (Query *returns* errors as state; it never throws). Every failure this app actually hits —
note gone, access revoked, API `500`, offline, expired session — flows around a boundary entirely, as
`undefined` or as query error state.

Hence three of the four seams in ADR-004 are not boundaries, and the two real bugs found while writing this
spec (the `401` retry loop, the blank editor for a missing note) are both invisible to boundaries.
