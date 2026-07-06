# 21 · Rollback UX — Decisions

The umbrella rationale lives in `docs/adr/0009-rollback-ux-classify-transient-vs-permanent.md` (and
ADR-0007 for the `lastMutationID`-advanced-without-applying mechanism). This file records only the
**spec-local** choices spec 21 makes while implementing that decision.

## ADR-001: `401` / `429` are transient, not permanent

### Context

The classifier must decide which push failures drop the user's mutation (permanent) vs keep it queued
and retry (transient). `403`/`422`/`409`/`404` clearly map to permanent per-mutation rejects. But
`401` (session expired) and `429` (rate limited) are request-level HTTP statuses, not considered
per-mutation verdicts.

### Options Considered

1. Treat any `4xx` as permanent — simpler classifier, but would **throw away the user's work** on a
   transient session-refresh or rate-limit, which is data loss.
2. Only reason codes returned *inside* a `200` push body are permanent; every non-`2xx` (incl.
   `401`/`429`/`5xx`) is transient → `PushTransportError` → retry.

### Decision

Option 2. Permanent = a deliberate per-mutation `rejected(reasonCode)` verdict inside a schema-valid
`200`. Everything else is transient and retried. `401`/`429` retry (a session refresh / backoff makes
the re-push succeed); idempotency makes the retry safe.

### Consequences

- The permanent set stays small and deliberate (four reason codes), minimizing accidental data loss.
- A malformed `200` body also falls to transient — safe, because retries are idempotent.
- The pusher's fetch wrapper (spec 19) must throw `PushTransportError` for all non-`2xx`, not just `5xx`.

## ADR-002: Reason-code set + best-effort generic copy

### Context

The server must tell the client *why* a mutation was permanently rejected, and the client must show a
message. ADR-0009 says copy is best-effort/generic — the server returns a code, not prose.

### Decision

`pushRejectReasonSchema = z.enum(["forbidden", "invalid", "conflict", "not_found"])` in
`@yapper/schemas`. `rejectToastCopy(name, reason)` gives access/existence-specific copy for `forbidden`
("You no longer have access to this note.") and `not_found` ("That note no longer exists."), and falls
through to `"Couldn't ${ACTION_PHRASE[name]}."` for `invalid`/`conflict`. `ACTION_PHRASE` has an entry
for all 14 mutation names (table-completeness test).

### Consequences

- The server maps service-layer errors deny-by-default onto the four codes; an unmapped error throws
  (`5xx` → transient), never a silent apply.
- Adding a new mutation name requires an `ACTION_PHRASE` entry (enforced by test) — a deliberate small
  cost that keeps copy complete.

## ADR-003: Never-give-up backoff, immediate reset on recovery

### Context

Transient failures must eventually land (the mutation is the user's data), but must not spin the CPU or
hammer a down server, and must recover instantly when the network returns.

### Decision

Exponential backoff `base=1s`, `cap=30s`, ±20% jitter, **no max attempts** for transient failures.
Don't schedule a timer while `navigator.onLine === false` (wait for the `online` event). Reset the
attempt counter to 0 and retry immediately on any successful push, `online`, window `focus`, or an
incoming poke (spec 17).

### Consequences

- Recovery does not wait out the 30s cap — a reconnect/focus/poke triggers an immediate re-push, so the
  large cap is safe.
- Only a **permanent** verdict removes a mutation from the queue; that is the sole poison-pill escape
  (a permanently-bad mutation can never wedge the queue).
- `navigator.onLine` is treated as a hint (it can be wrong on captive networks); the push will
  `PushTransportError` and reschedule regardless, so `onLine` only optimizes *when* to first retry.
