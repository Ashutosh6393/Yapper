# 7. Named, asymmetric mutators for all metadata actions

Date: 2026-07-05

## Status

Accepted. Defines the write half of the metadata lane (ADR-0002, ADR-0003). Retires the spec-13 optimistic layer (`apps/web/lib/queries/optimistic.ts`).

## Context

Every metadata action needs to be optimistic *and* reversible on server rejection (ADR-0009). Some actions are pure row changes (rename, archive); others have **server-only side effects** that cannot be replayed on the client — `makePrivate` rotates the share token, marks collaborators revoked, and kicks live sockets via Redis (`apps/api` sharing routes + `@yapper/permissions` revoke/role channels; `apps/socket/src/revoke.ts`). A single, uniform mechanism is wanted so two optimistic systems don't fight over the same note list (the risk if lifecycle/sharing stayed on their old endpoints while create/rename moved to the engine).

## Decision

**All** metadata actions become **named mutations** run through the engine:
`createNote`, `renameNote`, `archiveNote`/`unarchiveNote`, `trashNote`/`restoreNote`, `permanentDeleteNote`, `setShareLevel`, `makePrivate`, and label CRUD + `applyLabel`/`removeLabel`.

Each mutation name has **two implementations** — deliberately **asymmetric**:

- **Client mutator** (pure, replayable): applies the *optimistic local approximation* to `db.base`+queue during `rebuild()`. E.g. `makePrivate(id)` locally sets `access = "private"` and drops the note from shared-with-me views. It performs no side effects.
- **Server mutator** (authoritative): reuses existing service logic for the *full* effect and bumps `note_meta.version`. E.g. `makePrivate(id)` rotates the token, revokes collaborators, publishes revoke/kick on Redis, and bumps versions for every affected note.

**Push protocol** (`POST /api/sync/push`):

```
body: { clientGroupID, mutations: [{ id: seq, name, args }, ...] }   # ordered by seq
server, in one transaction per mutation, in order:
  if seq <= lastMutationID[clientGroupID]: skip        # idempotent replay guard
  else: run server mutator (authorize → apply → version++ → advance lastMutationID)
  on permanent failure: advance lastMutationID WITHOUT applying → mutation is "rejected"
respond; then publish pokes to affected audiences (ADR-0005)
```

The client learns `lastMutationID` via the pull (ADR-0004), drops confirmed/rejected mutations from the queue, and `rebuild()`s — so a rejected `makePrivate` simply vanishes locally on the next rebase.

## Consequences

- **One paradigm for all metadata.** The spec-13 `optimistic.ts` (archive/trash/restore/delete over the Query cache) and the `noteKeys` invalidation model are removed; those actions become client+server mutators. Undo (archive→unarchive) remains "fire the inverse mutation," now as a queued mutation rather than a Query mutation.
- **Asymmetry is explicit and safe.** The client mutator is a best-effort local preview; the server mutator is the source of truth. Because permission checks live in the server mutator and rejection auto-reverts (ADR-0009), a client that optimistically "makes private" a note it no longer owns is corrected on rebase.
- **Idempotency via `lastMutationID`** per `clientGroupID` makes push retries safe. `clientGroupID` is minted once per browser and stored in `db.sync` (shared across tabs); mutation `seq` is the monotonic queue key (ADR-0003).
- **Ordering guaranteed.** Mutations push and apply in `seq` order, so `createNote` always precedes a later `renameNote`/`applyLabel` on the same id (ADR-0006).
- **Poison-mutation safety.** A permanently failing mutation advances `lastMutationID` (dropped, not retried forever), so it can never wedge the queue; the user is toasted (ADR-0009). Transient failures do *not* advance it and are retried.
- **Realtime kick stays orthogonal.** `makePrivate`'s socket disconnect still flows through the existing revoke channel; collaborators also lose the note from their list via CVR `dels` (ADR-0004). The two mechanisms are consistent, not redundant.
- Every server mutator **must** bump `note_meta.version` for each note it touches, or clients go stale (shared invariant with ADR-0004/0008).
