# 9. Rollback UX: retry transient failures, revert + toast on permanent rejection

Date: 2026-07-05

## Status

Accepted. Completes the mutation lifecycle (ADR-0007) for the metadata lane.

## Context

With base + queue + materialize (ADR-0003), a server **rejection** of a queued mutation makes its optimistic effect vanish automatically on the next `rebuild()`. Silent reversion is confusing — a user sees a rename undo itself or a trashed note reappear with no explanation, especially for permission changes mid-session. But not every failure is a rejection: a network blip or 5xx is transient and should not throw away the user's work.

## Decision

The pusher **classifies** push outcomes and treats them differently:

- **Transient** (offline, network error, 5xx, timeout): keep the mutation in the queue, **retry with backoff**, no user-facing noise. `lastMutationID` is **not** advanced, so the mutation is re-sent until it succeeds.
- **Permanent rejection** (4xx — `403` permission denied, `422` validation, `409` conflict such as permanent-delete of a non-trashed note): the server advances `lastMutationID` **without applying** the mutation (ADR-0007). The client drops it from the queue → `rebuild()` reverts the optimistic effect → a **toast** `"Couldn't <action>"` explains it, with copy derived from the server's error reason.

The server therefore returns, per mutation, a verdict distinguishing "applied", "rejected (permanent, reason)", and "not processed (transient/leave queued)".

## Consequences

- **Clear and non-nagging.** Users are told when the server refuses an action; ordinary network hiccups stay silent and self-heal on reconnect.
- **The queue never wedges** on a poison mutation — a permanently-bad entry is dropped, not retried forever (ADR-0007). This is essential given offline queues can accumulate.
- **Rejection copy** is best-effort and generic (`"Couldn't archive note"`, `"You no longer have access"`), mapped from server error codes; the server need not return user-ready prose.
- **Undo interplay** (ADR-0007): an Undo that itself gets rejected (e.g. unarchive a note deleted elsewhere) reverts and toasts like any other rejection — no special case.
- **Idempotency-safe retries.** Because transient retries re-send the same `seq`/`clientGroupID`, the server's `lastMutationID` guard makes a duplicate delivery a no-op — retry can never double-apply.
- Requires the push response schema (in `@yapper/schemas`) to carry a per-mutation verdict + optional reason code, shared by client and server.
