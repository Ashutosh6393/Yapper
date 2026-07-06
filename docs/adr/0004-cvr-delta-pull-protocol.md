# 4. CVR-based delta pull protocol (removals included)

Date: 2026-07-05

## Status

Accepted. Defines the puller half of the metadata lane (ADR-0002, ADR-0003).

## Context

The pull must return not only *changed* rows but **removals**. Yapper's removals are permission-driven: when an owner makes a shared note **private**, or a collaborator is **revoked**, that note must **disappear** from the affected user's list on their next pull. A "rows changed since cookie" query cannot express "no longer yours" without extra machinery.

Two candidate models were considered:

- **Per-row version + explicit tombstones** — simpler pull query, but requires hand-written tombstone records on every revoke/make-private, plus garbage collection and coverage of re-share/long-offline edge cases. That complexity lands exactly where Yapper is already most complex (sharing/revocation).
- **Client View Records (CVR)** — the server records, per client group, the exact `{noteId → version}` set it last sent; each pull diffs the user's *current authorized view* against the stored CVR, so removals fall out of the diff for free.

## Decision

Use the **CVR** model.

**Server state:**
- `note_meta.version` — a per-note metadata version, bumped on every authoritative write to that note's metadata (rename, lifecycle change, share-level change, label change, and title/preview re-derivation from content).
- A `cvr` table keyed by `(clientGroupID, cookie)` storing the `{noteId → version}` snapshot last returned to that client group.

**`POST /api/sync/pull`** (cookie in, delta out):

```
view = authorizedNotes(user)          # owned + shared-not-revoked, via @yapper/permissions
prev = cvr[clientGroupID][cookie]     # {id → version} last sent (empty on first pull)
puts = { n ∈ view | n.id ∉ prev  OR  n.version > prev[n.id] }
dels = { id ∈ prev | id ∉ view }      # make-private / revoke / hard-delete → delete locally
cookie' = new monotonic cookie; store cvr[clientGroupID][cookie'] = {id → version for view}
return { puts, dels, lastMutationID, cookie' }
```

The client applies `puts`/`dels` to `db.base`, records `cookie'` and `lastMutationID` in `db.sync`, drops confirmed mutations from the queue, and calls `rebuild()` (ADR-0003).

Authorization reuses the same cache-first rule as REST/socket (`@yapper/permissions`), so the pull view never disagrees with what the editor would grant.

## Consequences

- **Removals are correct by construction.** Make-private and revoke need no special client code and no tombstone table — the note is simply absent from `view`, so it appears in `dels`.
- **`lastMutationID` rides the pull**, closing the loop with the pusher (ADR-0007): the client learns which of its own mutations are now baked into `base` and can safely drop them from the queue.
- **CVR storage cost.** One `{id → version}` snapshot per client group per outstanding cookie. Mitigate by keeping only the latest 1–2 cookies per client group and pruning old rows; a stale/unknown cookie triggers a **full resync** (empty `prev` → every authorized note is a `put`, and the client treats any local base row not in the response as a delete).
- **Every authoritative metadata write must bump `note_meta.version`** — this is a hard invariant; a missed bump means a silently stale client. Centralize version bumping in the server mutators (ADR-0007) and the content-derive helper (ADR-0008).
- **Cookies are opaque and monotonic** (e.g. a per-client-group sequence), never a wall-clock timestamp, to avoid clock-skew gaps.
- Pull is triggered by the poke channel and by focus/reconnect backstops (ADR-0005).
