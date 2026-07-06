# 19 · Named, Asymmetric Mutators — Decisions

The umbrella rationale is `docs/adr/0007-named-asymmetric-mutators-all-metadata.md` (and ADR-0002,
plus ADR-0006 for createNote and ADR-0009 for verdicts). This file records only the **spec-local**
choices spec 19 makes.

## ADR-001: Extract inline route bodies into service functions (pure refactor first)

### Context

The server mutators must apply the *same* lifecycle/sharing/label writes the REST routes do, or
semantics drift between the flag-off (REST) and flag-on (engine) paths during migration. Today those
writes are inline in `apps/api/src/notes/router.ts` + `labels/router.ts`.

### Decision

Extract each inline body (archive/unarchive/trash/restore/permanentDelete/share/private, createLabel/
deleteLabel) into a small callable **service function**. The existing REST route and the new server
mutator both call it. Do the extraction as a **pure refactor in its own step** (routes call the new
functions; behavior identical), verified by the existing `router.test.ts`/`private.test.ts` staying
green, **before** wiring the server mutators.

### Consequences

- One source of lifecycle/sharing semantics; REST and engine can't diverge mid-migration.
- The extraction touches working routers, so it is isolated and test-guarded to keep blast radius small.
- `renameNote`/`renameLabel`/`applyLabel`/`removeLabel` have **no** existing REST endpoint (title is
  content-derived; labels are replaced whole via `PUT /labels`) — their server mutators are small new
  owner-gated writes, and the engine decomposes "set a note's labels" into per-link apply/remove.

## ADR-002: One transaction per mutation, advancing `last_mutation_id` in lock-step

### Context

The push handler applies a batch; it needs idempotency, ordering, and crash-consistency.

### Decision

Apply mutations in ascending `seq`, each in **its own transaction** that both performs the write and
advances `sync_client.last_mutation_id` to that `seq` (or, for a permanent reject, advances it *without*
the write). Skip any `seq <= last_mutation_id` as an idempotent replay (verdict `applied`).

### Consequences

- A re-pushed batch (transient retry / lost 200) re-executes nothing already recorded — idempotent by
  construction (ADR-0007).
- A crash between mutations leaves a consistent applied prefix; the client re-pushes the rest.
- The de-dup pointer and the effect commit atomically, so they can never disagree.

## ADR-003: Only four permanent reject reasons; everything else is transient

### Context

The pusher must distinguish "drop this mutation" from "retry it" (spec 21).

### Decision

A **permanent** reject is exactly one of `MutationRejected("forbidden"|"invalid"|"conflict"|
"not_found")` — permission denied, arg re-validation failure, illegal state, missing row. Any other
error throws, aborting the request → 5xx → the client treats the whole batch as transient and re-pushes.
The mapping is **deny-by-default**.

### Consequences

- A permanently-bad mutation advances `last_mutation_id` (dropped, never retried forever) — the sole
  poison-pill escape; the queue can't wedge (spec 21 goal #4).
- An unmapped/unexpected error never silently applies; it surfaces as a retryable 5xx.

## ADR-004: `clientGroupID` bound to its first pushing user

### Context

`sync_client` de-dups per `client_group_id`. A group's pointer must not be advanced by a different user.

### Decision

`sync_client` stores `user_id`; a `clientGroupID` is bound to the first authenticated user that pushes
it. A push for that group from a different user is `forbidden`.

### Consequences

- One browser's de-dup pointer can't be moved by another session.
- Spec 16's puller reads the same binding (`last_mutation_id` per group) — documented so both agree.

## ADR-005: `renameNote` vs content-derived title — last writer wins via `meta_version`

### Context

`note.title` is derived from the Yjs body by the content path (socket today, spec 20's `PUT /content`).
`renameNote` is an explicit metadata override (ADR-0007 lists it).

### Decision

Ship `renameNote` as a normal metadata mutator that sets `title` and bumps `meta_version`; the last
writer (a manual rename vs a content re-derive) wins by version. Finalize the derive-vs-rename precedence
with spec 20; flag it in review rather than silently coupling the two paths.

### Consequences

- No hidden coupling between the content lane and the rename mutator now.
- Spec 20 must decide whether a content edit re-derives over a manual title (documented cross-reference).
