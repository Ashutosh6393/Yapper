# 19 · Named, Asymmetric Mutators — Design

This spec builds the **write half** of the metadata lane (ADR-0007): the mutation framework every
metadata action runs through, all **14 named mutators**, and the push protocol that reconciles them
with `apps/api`. Each of the 14 names gets **two** implementations — deliberately **asymmetric**: a
**client mutator** (pure, replayable, optimistic-local only, invoked by `rebuild()` — no side
effects) and a **server mutator** (authoritative, reuses the existing lifecycle/sharing/label service
logic, bumps `note.meta_version`, and — for `makePrivate` — rotates the token, revokes collaborators,
and fires the existing Redis revoke/kick). The client applies a mutation locally, enqueues it in
`db.mutations` with a monotonic `seq`, and `rebuild()`s; the pusher (`apps/web/lib/sync/push.ts`)
POSTs the batch to `POST /api/sync/push`, which applies each mutation in `seq` order inside its own
transaction, de-dupes via `sync_client.last_mutation_id` per `clientGroupID`, bumps `meta_version`,
and returns a per-mutation verdict (`applied` | `rejected` + reason).

Landing this spec **retires spec-13's optimistic layer**: once `NEXT_PUBLIC_SYNC_ENGINE` is on, the
lifecycle/label/share actions stop going through `apps/web/lib/queries/optimistic.ts` +
`notes.ts`/`labels.ts` Query mutations and run through the engine instead. Nothing changes while the
flag is off — the old TanStack Query path stays byte-for-byte live until the whole engine sequence
(14 → 15 → 18 → 19 → 16 → 21 → 17 → 20) is green and the flag flips. This spec consumes spec 18's
client-minted-id `createNote` contract and publishes pokes on spec 17's Redis channel; it does **not**
build the puller (spec 16), the rollback classifier/toast copy (spec 21), or the SSE transport
(spec 17) — it exposes the seams those specs attach to.

## Goal State (acceptance)

**Mutation framework**
1. A **client-mutator registry** in `apps/web/lib/sync/mutators.ts` maps each of the 14 canonical
   names (`createNote`, `renameNote`, `archiveNote`, `unarchiveNote`, `trashNote`, `restoreNote`,
   `permanentDeleteNote`, `setShareLevel`, `makePrivate`, `createLabel`, `renameLabel`, `deleteLabel`,
   `applyLabel`, `removeLabel`) to a **pure** function `(draft, args) => void` that applies the
   optimistic-local approximation to a working set of note-meta + label rows. Client mutators perform
   **no** I/O and **no** side effects; they are the functions `rebuild()` folds over `db.base` +
   `db.labels` in `seq` order. A table-completeness test asserts every `mutationSchema` name has a
   client mutator.
2. A **server-mutator registry** in `apps/api/src/sync/mutators.ts` maps each of the 14 names to an
   authoritative `async (tx, ctx, args) => void` that **reuses the existing service logic** (the
   lifecycle/sharing/label DB writes now inline in `apps/api/src/notes/router.ts` and
   `apps/api/src/labels/router.ts`, extracted into callable service functions), **authorizes** via
   `@yapper/permissions` / owner-gate, and **bumps `note.meta_version`** for every note it touches.
   A permanent failure throws a typed `MutationRejected(reason)`; an unexpected failure throws
   through (→ 5xx). A table-completeness test asserts every name has a server mutator.
3. **Asymmetry is real and safe.** A client mutator is a best-effort local preview; the server mutator
   is the source of truth. `makePrivate`'s client mutator only sets `access = "private"` locally
   (goal #8); its server mutator does the full effect (goal #9). A test proves the two registries
   share the same 14 keys but the `makePrivate` client mutator touches no token/collaborator/Redis
   state.

**Client: enqueue + rebuild**
4. Each metadata action calls an `enqueue(mutation)` helper (`apps/web/lib/sync/mutate.ts`) that: (a)
   inserts `{ seq (auto), name, args }` into `db.mutations`, (b) calls `rebuild()` so `db.notes`
   reflects the optimistic effect immediately, and (c) nudges the pusher. The UI reads `db.notes` /
   `db.labels` via `useLiveQuery` (spec 15), so the card/chip updates without a refetch. A test proves
   an `archiveNote` action leaves an `mutations` row and `rebuild()` drops the note from the active
   view.
5. `rebuild()` (body owned by spec 15) replaying `[createNote(id), renameNote(id,"X")]` over an empty
   base yields a `db.notes` row `{ id, title: "X", lifecycle: "active" }`; replaying the same queue
   minus a **dropped** mutation reverts that effect (the rollback primitive spec 21 relies on). Spec
   19 supplies the client mutators these replay tests exercise.

**Server: `POST /api/sync/push`**
6. `apps/api/src/sync/router.ts` mounts `POST /api/sync/push` at `/api/sync`; the body is validated
   against `pushRequestSchema` (`{ clientGroupID, mutations: [{ seq, name, args }] }`). The handler
   logic lives in `apps/api/src/sync/push.ts`.
7. **Ordered, transactional apply.** Mutations are applied in ascending `seq`. Each mutation runs in
   **its own transaction** that both performs the write and advances
   `sync_client.last_mutation_id` to that `seq` — so the de-dup pointer and the effect commit
   atomically. Ordering guarantees `createNote` precedes a later `renameNote`/`applyLabel` on the same
   id.
8. **Idempotent replay.** For a mutation with `seq <= last_mutation_id[clientGroupID]`, the handler
   **skips** it (verdict `applied`, no re-execution). A test re-pushing an already-applied batch is a
   no-op — no double archive, no duplicate note, `meta_version` unchanged.
9. **Per-mutation verdict.** The response is `pushResponseSchema`
   (`{ lastMutationID, verdicts: [{ seq, status, reason? }] }`). A mutation that applies →
   `{ status: "applied" }`; a **permanent** failure (permission denied → `forbidden`, arg validation
   → `invalid`, state conflict → `conflict`, missing row → `not_found`) advances `last_mutation_id`
   **without applying** and returns `{ status: "rejected", reason }`. A **transient/unexpected** error
   (DB down, etc.) throws so the whole request `5xx`s and `last_mutation_id` is **not** advanced past
   the failed mutation — the client re-pushes (classification + toast copy owned by spec 21).
10. **`meta_version` bump is mandatory.** Every server mutator that mutates a surviving note calls the
    shared `bumpMetaVersion(tx, noteId)` helper, so the change propagates to the CVR puller (spec 16)
    and the poke (spec 17). A test asserts `renameNote` increments the row's `meta_version`.

**`makePrivate` — full server side effects**
11. The `makePrivate` **client** mutator sets `access = "private"` on the note in the local draft and
    nothing else (a collaborator's own client never issues `makePrivate`; they lose the note via the
    CVR `dels`, goal #12).
12. The `makePrivate` **server** mutator reproduces today's `POST /api/notes/:id/private` effect
    inside the push transaction: set `access = "private"`, clear `share_token`, set every
    `note_collaborator` row for the note to `status = "revoked"`, `bumpMetaVersion`, then (after the
    txn commits) `bustNotePermissions(permCache, id)` and
    `redisPublisher?.publish(revokeChannel(id), { reason: "made_private" })` — so `apps/socket`'s
    existing `setupRevokeSubscriber` kicks connected non-owners exactly as it does today. The owner is
    never kicked; the realtime path is untouched.
13. **Collaborator removal via CVR.** Because `makePrivate` bumps `meta_version` and revokes
    collaborators, each affected collaborator's next `pull` (spec 16) returns the note in `dels` and
    it disappears from their "Shared with me" — the list-level counterpart to the socket kick. Spec 19
    guarantees the version bump + revoke that make this delta correct; the CVR diffing is spec 16.

**Retirement of spec-13 optimistic**
14. With the flag **on**, the dashboard/editor drive metadata actions through the engine
    (`enqueue` + client mutators), not `apps/web/lib/queries/optimistic.ts` or the
    `notes.ts`/`labels.ts` Query mutation hooks; note **reads** come from Dexie `useLiveQuery`
    (spec 15). With the flag **off**, those Query hooks remain the live path, unchanged. Deletion of
    `optimistic.ts` + the retired hooks happens in the **final cutover** (when the flag flips), not
    mid-migration — coordinated with spec 14's retirement plan.
15. **Undo = queued inverse mutation.** Archive/Trash success still offers Undo; it enqueues the
    inverse named mutation (`unarchiveNote` / `restoreNote`) rather than re-adding to a cache. A
    rejected inverse reverts + toasts through the ordinary rejection path (spec 21) — no special case.

**Cross-cutting**
16. Contracts (`mutationSchema`, `pushRequestSchema`, `pushResponseSchema`) are imported from
    `@yapper/schemas`; no shape is redefined in web or api. Permissions stay server-authoritative
    (`@yapper/permissions`, cache-first). Everything is behind `isSyncEngineEnabled()`. `tsc --noEmit`
    clean in `apps/web` + `apps/api`; Biome clean (2-space, double quotes, 100 cols); no `as any`.
    Goal-state tests written first (TDD) and green.

## Scope

**In:**
- `apps/web/lib/sync/mutators.ts` (new) — the **client**-mutator registry (14 pure functions) + the
  `ClientMutator`/`WorkingSet` types. Imported by `rebuild()` (spec 15).
- `apps/web/lib/sync/mutate.ts` (new) — `enqueue(mutation)` (insert into `db.mutations` → `rebuild()`
  → nudge pusher) and the thin per-action helpers the dashboard/editor call (`archiveNote(id)`,
  `renameNote(id, title)`, `setShareLevel(id, level)`, `applyLabel(noteId, labelId)`, …).
- `apps/web/lib/sync/push.ts` (new) — the pusher: read pending `db.mutations` in `seq` order, POST
  `{ clientGroupID, mutations }` to `/api/sync/push`, hand the outcome to the classifier seam
  (spec 21) and drop rejected seqs / `rebuild()`. Single in-flight push; nudged on enqueue and by the
  poke/pull loop.
- `apps/api/src/sync/router.ts` (new) — mounts `POST /api/sync/push` at `/api/sync` behind
  `requireAuth`.
- `apps/api/src/sync/push.ts` (new) — the ordered, transactional, idempotent apply loop + the
  server-error → `reason` mapping; produces `pushResponseSchema`.
- `apps/api/src/sync/mutators.ts` (new) — the **server**-mutator registry (14 authoritative
  functions) + `MutationRejected` + the `bumpMetaVersion(tx, noteId)` helper.
- **Service extraction (surgical):** pull the DB bodies now inline in `apps/api/src/notes/router.ts`
  (archive/unarchive/trash/restore/permanentDelete/share/private) and
  `apps/api/src/labels/router.ts` (createLabel/deleteLabel) into small callable service functions the
  server mutators and the existing REST routes both call — no behavior change to the REST routes.
- `packages/db` additions: `sync_client` table `(client_group_id pk, last_mutation_id bigint, user_id)`
  and `note.meta_version` (bigint, default 0) + migration. (Spec 19 builds before spec 16, so it
  introduces the shared `meta_version` invariant; spec 16 consumes it — see *Dependencies*.)
- Wiring: mount `<the pusher's lifecycle>` inside spec 14's `<SyncEngineProvider>` seam (flag-gated);
  route the dashboard/editor action handlers to `mutate.ts` when the flag is on.
- Goal-state tests (below), written first.

**Out (see `future-work.md` and the named sibling):**
- `rebuild()`'s **replay body** + `db.notes` materialization + `useLiveQuery` selectors → **spec 15**.
- Client-minted-id **plumbing** (`createNote.args.id` minting at the create site, `POST /api/notes`
  retirement, `y-indexeddb`/`note_doc` id unification) → **spec 18**. Spec 19 consumes the contract
  and implements the idempotent server insert inside the push handler.
- The **puller** (`/api/sync/pull`), CVR diffing, `sync_cvr` table, `dels` computation, and dropping
  **applied** mutations from the queue on pull → **spec 16**. Spec 19 only drops **rejected** seqs.
- **Rollback UX** — the transient-vs-permanent classifier (`classify.ts`), backoff scheduler, and
  `reasonCode → toast copy` map → **spec 21**. Spec 19's pusher exposes the outcome-handler seam and
  the server produces the `reason` codes; spec 21 finalizes the `reasonCode` enum + copy.
- **SSE poke transport** (`/api/sync/stream`, the client subscriber) → **spec 17**. Spec 19 publishes
  to the Redis `poke:user:{userId}` channel after a push; spec 17 delivers it.
- **Content lane** (`PUT /api/notes/:id/content`, content-derived title/preview) → **spec 20**. Note
  the `renameNote` ↔ content-derived-title interaction in *Risks*.
- **Deleting** `optimistic.ts` + the retired Query hooks — happens at the final cutover when the flag
  flips (spec 14 retirement plan), not in this spec.

---

## The mutation framework

### Shared contract (`@yapper/schemas`, defined by spec 14)

Spec 19 imports and does not redefine `mutationSchema` (discriminated union on `name` over the 14
names, each with typed `args`), `mutationNameSchema` (the name enum), `pushRequestSchema`, and
`pushResponseSchema`. The canonical arg shapes (spec 14 *Contracts*):

| Mutation | `args` |
|---|---|
| `createNote` | `{ id: string, title?: string }` (id client-minted, spec 18) |
| `renameNote` | `{ id: string, title: string }` |
| `archiveNote` / `unarchiveNote` / `trashNote` / `restoreNote` / `permanentDeleteNote` | `{ id: string }` |
| `setShareLevel` | `{ id: string, level: "view" \| "edit" }` |
| `makePrivate` | `{ id: string }` |
| `createLabel` | `{ id: string, name: string, color: labelColor }` |
| `renameLabel` | `{ id: string, name: string }` |
| `deleteLabel` | `{ id: string }` |
| `applyLabel` / `removeLabel` | `{ noteId: string, labelId: string }` |

### Client-mutator registry — `apps/web/lib/sync/mutators.ts`

Pure functions folded by `rebuild()`. `WorkingSet` is the in-memory draft `rebuild()` seeds from
`db.base` (note-meta rows) + `db.labels`; a client mutator mutates the draft and returns nothing.

```ts
export type WorkingSet = { notes: Map<string, NoteMeta>; labels: Map<string, LabelRow> };
type ClientMutator<A> = (draft: WorkingSet, args: A) => void;

export const clientMutators: { [K in Mutation["name"]]: ClientMutator<ArgsOf<K>> } = { … };
```

`rebuild()` (spec 15) does: seed `draft` from base → for each queued mutation in `seq` order call
`clientMutators[m.name](draft, m.args)` → write `draft` to `db.notes`/`db.labels`. Because the
functions are pure and keyed by name, dropping a rejected mutation and re-folding **reverts** its
effect — the rollback primitive (spec 21, goal #5). Client mutators **never** authorize (a client
optimistically archiving a note it no longer owns is corrected on the server's rejection + rebuild)
and **never** produce side effects.

### Server-mutator registry — `apps/api/src/sync/mutators.ts`

Authoritative. Each takes the push transaction, an auth context, and validated `args`:

```ts
type MutationCtx = { userId: string; tx: Tx };
type ServerMutator<A> = (ctx: MutationCtx, args: A) => Promise<PostCommit | void>;

export class MutationRejected extends Error {
  constructor(public reason: "forbidden" | "invalid" | "conflict" | "not_found") { super(reason); }
}
export const serverMutators: { [K in Mutation["name"]]: ServerMutator<ArgsOf<K>> } = { … };
```

Each server mutator: (1) **authorizes** — owner-gate for owner-only actions (reuse the existing
`requireOwnedNote` shape) or `resolvePermission` for edit-gated ones; on denial `throw new
MutationRejected("forbidden")`; missing row → `"not_found"`; illegal state (e.g. permanent-delete a
non-trashed note) → `"conflict"`; args that fail the per-member re-parse → `"invalid"`. (2) **applies**
the write via the **extracted service function** (same code the REST route runs). (3) **bumps**
`meta_version` for each surviving affected note via `bumpMetaVersion(tx, noteId)`. (4) optionally
returns a `PostCommit` closure (Redis publishes for `makePrivate`/`setShareLevel`) the handler runs
**after** the txn commits — never inside it.

### Registry table — name → client effect / server effect / `meta_version`

| Name | Client mutator (local draft) | Server mutator (authoritative, reuses service) | bumps `meta_version` |
|---|---|---|---|
| `createNote` | insert `{ id, title: title ?? "Untitled", preview:"", access:"private", lifecycle:"active", labelIds:[] }` | idempotent `INSERT … ON CONFLICT (id) DO NOTHING` (ADR-0006/spec 18); on conflict verify owner else `forbidden` | yes (new row, v0) |
| `renameNote` | set `note.title = title` | owner-gate → `UPDATE note SET title` | yes |
| `archiveNote` | `lifecycle = "archived"` | owner-gate → set `archived_at = now()` | yes |
| `unarchiveNote` | `lifecycle = "active"` | owner-gate → clear `archived_at` | yes |
| `trashNote` | `lifecycle = "trashed"` | owner-gate → set `trashed_at = now()` + `bustNotePermissions` | yes |
| `restoreNote` | `lifecycle = "active"` | owner-gate → clear both timestamps + `bustNotePermissions` | yes |
| `permanentDeleteNote` | remove note from draft | owner-gate → `409/conflict` unless trashed → `DELETE note` (FK cascade) | n/a (row gone → CVR `del`) |
| `setShareLevel` | `access = level` | owner-gate → set `access`, mint `share_token` if absent + `bustNotePermissions` + **post-commit** publish `roleChange` | yes |
| `makePrivate` | `access = "private"` | owner-gate → set `access="private"`, clear token, revoke collaborators + `bustNotePermissions` + **post-commit** publish `revoke` | yes (+ collaborators via CVR) |
| `createLabel` | insert label row `{ id, name, color, noteCount:0 }` | `INSERT … ON CONFLICT (id) DO NOTHING`; owner-scoped; dup **name** → `conflict` | n/a (label, not note) |
| `renameLabel` | set `label.name` | owner-gate label → `UPDATE label SET name`; dup name → `conflict` | notes carrying it (chip text) |
| `deleteLabel` | remove label; strip from every `note.labelIds` | owner-gate → `DELETE label` (cascade `note_label`) | notes that carried it |
| `applyLabel` | add `labelId` to `note.labelIds` | owner-gate note+label → `INSERT note_label ON CONFLICT DO NOTHING` | the note |
| `removeLabel` | remove `labelId` from `note.labelIds` | owner-gate → `DELETE note_label` row | the note |

> **New service logic.** `renameNote`, `renameLabel`, `applyLabel`, `removeLabel` have no existing
> REST endpoint (today title is content-derived and labels are replaced whole via
> `PUT /api/notes/:id/labels`). Their server mutators are small new owner-gated writes; the engine
> decomposes "set a note's labels" into idempotent per-link `applyLabel`/`removeLabel` mutations. See
> *Risks* for the `renameNote` ↔ content-derived-title interaction (spec 20).

## Push protocol

### Client — `apps/web/lib/sync/push.ts`

```
push():
  if a push is already in flight: return               # single in-flight (backoff owned by spec 21)
  pending = db.mutations.orderBy("seq").toArray()       # everything not yet confirmed by pull
  if pending is empty: return
  clientGroupID = await getClientGroupID()              # spec 14 bootstrap
  body = { clientGroupID, mutations: pending.map(({ seq, name, args }) => ({ seq, name, args })) }
  outcome = await pushFetch("/api/sync/push", body)     # throws PushTransportError on offline/5xx/non-200 (spec 21)
  handleOutcome(outcome)                                 # spec 21 classifier plugs in here:
    #   settled → drop each rejected seq from db.mutations → rebuild() → toast (spec 21)
    #   applied seqs are dropped later by the pull loop when lastMutationID advances (spec 16)
    #   transient → keep queued, schedule backoff retry (spec 21)
```

`enqueue()` inserts the mutation, `rebuild()`s, then nudges `push()`. Applied mutations are **not**
dropped by the pusher — the pull loop (spec 16) drops them when `lastMutationID` catches up, which is
also what makes a lost-response retry a safe no-op.

### Server — `apps/api/src/sync/push.ts`

```
POST /api/sync/push  (behind requireAuth; userId = req.userId)
  body = pushRequestSchema.parse(req.body)              # 400 on malformed envelope
  verdicts = []
  for m of body.mutations sorted by seq ascending:
    await db.transaction(tx => {
      lastId = SELECT last_mutation_id FROM sync_client WHERE client_group_id = body.clientGroupID  # 0 if none
      if m.seq <= lastId:                                # idempotent replay guard
        verdicts.push({ seq: m.seq, status: "applied" }); return
      const parsed = mutationSchema.safeParse({ name: m.name, args: m.args })   # per-member re-validate
      if (!parsed.success) throw new MutationRejected("invalid")
      try:
        postCommit = await serverMutators[m.name]({ userId, tx }, parsed.data.args)   # authorize → apply → bumpMetaVersion
      catch e:
        if e instanceof MutationRejected:
          advanceLastMutationID(tx, body.clientGroupID, userId, m.seq)   # advance WITHOUT applying
          verdicts.push({ seq: m.seq, status: "rejected", reason: e.reason }); return
        throw e                                          # UNEXPECTED → abort txn → propagate → 5xx (transient)
      advanceLastMutationID(tx, body.clientGroupID, userId, m.seq)       # atomic with the effect
      verdicts.push({ seq: m.seq, status: "applied" })
      queuePostCommit(postCommit)                        # run Redis publishes after commit
    })
  runPostCommits()                                       # bustNotePermissions + revoke/roleChange publishes
  const lastMutationID = SELECT last_mutation_id …       # final pointer
  publishPokesToAffectedUsers()                          # Redis poke:user:{userId} (spec 17 delivers)
  res.json({ lastMutationID, verdicts })                 # pushResponseSchema
```

Key invariants:

- **One txn per mutation**, and that txn advances `last_mutation_id` in lock-step with the effect (or,
  for a permanent reject, advances it *without* the effect). A crash between mutations leaves a
  consistent prefix applied; the client re-pushes the rest.
- **De-dup is a `seq <= last_mutation_id` skip.** A re-pushed batch (transient retry, or a lost
  200-response) re-executes nothing already recorded — idempotent by construction (ADR-0007). `seq` is
  the monotonic `db.mutations` key, unique per `clientGroupID`.
- **Permanent vs transient.** Only the four `MutationRejected` reasons produce a `rejected` verdict
  (with `last_mutation_id` advanced so the poison mutation is dropped, never retried forever). Any
  other throw aborts the request → 5xx → the client treats the whole batch as transient and re-pushes
  (spec 21). The mapping is **deny-by-default**: unmapped errors never silently apply.
- **Pokes after commit.** Once verdicts are decided, publish a content-free poke on
  `poke:user:{userId}` for every affected audience (the owner; for `makePrivate`/`setShareLevel` the
  revoked/affected collaborators) so their pull picks up the delta (spec 17 transport, spec 16 pull).

### DB additions (`packages/db`)

- `note.meta_version bigint NOT NULL DEFAULT 0` — the central staleness invariant; `bumpMetaVersion`
  does `UPDATE note SET meta_version = meta_version + 1 WHERE id = :id` inside the mutation txn. Spec
  19 introduces it (it builds before spec 16, which reads it for CVR diffing).
- `sync_client (client_group_id text PRIMARY KEY, last_mutation_id bigint NOT NULL DEFAULT 0,
  user_id text NOT NULL)` — per-client-group de-dup pointer. `advanceLastMutationID` upserts it
  (`ON CONFLICT (client_group_id) DO UPDATE SET last_mutation_id = :seq`), scoped to the authenticated
  `user_id` (a `clientGroupID` is bound to the first user that pushes it; a mismatch is `forbidden`).

## TDD — tests to write first

Write these failing first; a slice is done only when green + `tsc --noEmit` clean + Biome clean. Run
`apps/web` tests from `apps/web` with `bunx vitest run --maxWorkers=1` (the full suite OOMs on the
default parallel run — project memory); `apps/api` tests with `bun test` from `apps/api`. Web
Dexie/`rebuild()` tests use `fake-indexeddb/auto` (spec 14 test setup).

**Client (web):**
1. `apps/web/lib/sync/mutators.test.ts` — **registry completeness + purity:** every
   `mutationSchema` name has a `clientMutators` entry; applying each to a draft produces the documented
   effect (archive → `lifecycle:"archived"`; `makePrivate` → `access:"private"` and **no**
   token/collaborator field touched; `deleteLabel` strips the id from every `note.labelIds`).
2. `apps/web/lib/sync/rebuild.replay.test.ts` (over a fake Dexie + spec 15's `rebuild()`) —
   **replay + rollback:** queue `[createNote(id), renameNote(id,"X")]` → `db.notes` has title `"X"`;
   **drop** the `renameNote` seq and re-`rebuild()` → title reverts to `"Untitled"`; drop the
   `createNote` seq → the note vanishes.
3. `apps/web/lib/sync/mutate.test.ts` — **enqueue:** an `archiveNote(id)` action inserts one
   `db.mutations` row with a monotonically greater `seq`, `rebuild()` removes it from the active view,
   and the pusher is nudged (spied).

**Server (api):**
4. `apps/api/src/sync/push.ordering.test.ts` — a batch `[createNote(id), renameNote(id,"X"),
   applyLabel(id,l)]` applied in `seq` order leaves the note titled `"X"` with label `l`; a batch
   whose `renameNote` precedes its `createNote` in the array is still applied by ascending `seq`.
5. `apps/api/src/sync/push.idempotency.test.ts` — pushing the same batch **twice** applies each
   mutation once (no duplicate note, `meta_version` bumped once per logical apply); a batch with
   `seq <= last_mutation_id` returns `applied` verdicts and mutates nothing.
6. `apps/api/src/sync/push.verdicts.test.ts` — a `renameNote` the caller doesn't own →
   `rejected(reason:"forbidden")` **and** `last_mutation_id` advanced without the title changing; a
   `permanentDeleteNote` on a non-trashed note → `rejected("conflict")`; a valid mutation in the same
   batch → `applied`; an unexpected error (mock the tx to throw) → the request `5xx`s with **no**
   partial verdicts leaked and `last_mutation_id` not advanced past the failure.
7. `apps/api/src/sync/push.makeprivate.test.ts` — a `makePrivate` mutation: `access` becomes
   `private`, `share_token` cleared, every `note_collaborator` row `revoked`, `meta_version` bumped,
   and (with a mock publisher) a `revokeChannel(id)` publish fired **after** commit; the owner's row
   is untouched. Mirrors the existing `apps/api/src/notes/private.test.ts` assertions, now via push.

## Dependencies & build order

Spec numbers follow the ADRs (19 ↔ 0007); the **build** order differs. Spec 19 builds **after** 14,
15, and 18, and **before** 16, 21, 17, 20 in the recommended sequence
**14 → 15 → 18 → 19 → 16 → 21 → 17 → 20**.

| Prereq | Why spec 19 needs it |
|---|---|
| **14** (sync-foundations) | The flag, the `@yapper/schemas` sync contracts (`mutationSchema`, push req/resp), the Dexie `yapper-sync` schema (`db.mutations`, `db.base`, `db.sync`), `getClientGroupID()`, and the `<SyncEngineProvider>` seam + `rebuild()` symbol. |
| **15** (dexie-local-store) | The `rebuild()` **body** that folds the client mutators over base and materializes `db.notes`; the `useLiveQuery` read selectors the UI reads. Spec 19 supplies the mutators `rebuild()` calls. |
| **18** (client-minted-ids) | The `createNote({ id, … })` client-minted id + idempotent-create contract. Spec 19's `createNote` server mutator implements the `ON CONFLICT DO NOTHING` insert; the create **site** (id minting, `POST /api/notes` retirement) is spec 18. |

Spec 19 in turn **unblocks**: spec 16 (consumes `meta_version` + the `applied` `lastMutationID` to
drop confirmed mutations on pull), spec 21 (plugs its classifier/backoff/copy into `push.ts`'s outcome
handler and finalizes the `reasonCode` enum the verdicts carry), and spec 17 (delivers the pokes
`push.ts` publishes). Everything stays behind `NEXT_PUBLIC_SYNC_ENGINE` until the sequence completes.

## Cross-cutting rules

- **Contracts in `@yapper/schemas`.** `mutationSchema` / `pushRequestSchema` / `pushResponseSchema`
  are imported by web (pusher) and api (handler); never duplicate a shape per app. Derive types with
  `z.infer`. The 14 names are canonical — do not rename.
- **Permissions stay server-authoritative.** The server mutator authorizes with `@yapper/permissions`
  (owner-gate / `resolvePermission`, cache-first — the same decision REST and socket make). The client
  mutator is **never** a trust boundary; an optimistic write the server rejects is *corrected* by
  drop + `rebuild()` (spec 21), it was never authoritative.
- **Reuse existing service logic.** Server mutators call the same DB writes the REST routes use
  (extracted into service functions), so lifecycle/sharing semantics can't drift between the REST path
  (flag off) and the engine path (flag on) during migration.
- **`meta_version` is the invariant.** Every server mutator that leaves a note present bumps it, or
  clients go stale (shared with ADR-0004/0008). Deletes need no bump (they surface as CVR `dels`).
- **Behind the feature flag.** All spec-19 wiring lives inside the `isSyncEngineEnabled()` path; the
  flag-off TanStack Query path (spec 13) is untouched and keeps working. No deletion of `optimistic.ts`
  until the final cutover.
- **Realtime co-editing is orthogonal.** `makePrivate`'s socket kick flows through the **existing**
  `revokeChannel` + `apps/socket/src/revoke.ts` — unchanged. Spec 19 only moves the *publish* into the
  push transaction's post-commit step; the subscriber/kick is not touched.
- **No `as any`.** Strict TS; type the registries from the `mutationSchema` union so a missing/renamed
  name is a compile error. Match Biome style (2-space, double quotes, 100 cols). Small, reviewable
  diffs.

## Risks / notes

- **Avoiding dual optimistic systems.** The whole reason both lifecycle/sharing **and** create/rename
  move onto the engine at once (ADR-0007) is that a half-migration — some actions on the engine,
  others on the spec-13 Query cache — would have two writers fighting over the same note list. Spec 19
  must flip **all 14** actions behind the flag together; do not leave a subset on `optimistic.ts` when
  the flag is on. The flag-off path stays whole until cutover.
- **Poison-mutation safety.** A permanently-failing mutation advances `last_mutation_id` (dropped, not
  retried forever), so a single bad entry can never wedge the queue; later seqs still push and settle
  (spec 21 goal #4). The escape hatch is *only* the four `MutationRejected` reasons — every other error
  must throw to 5xx (transient), never silently apply. Guarded by the `push.verdicts` test.
- **`renameNote` vs content-derived title.** Today `note.title` is derived from the Yjs body by the
  socket (`apps/socket/src/metadata.ts`); the content lane (spec 20) keeps deriving it. `renameNote`
  is an explicit metadata override in the registry (ADR-0007 lists it) — the last writer (a manual
  rename vs a content re-derive) wins via `meta_version`. Spec 19 ships the mutator; the derive-vs-
  rename precedence is finalized with spec 20. Flag it in review rather than silently coupling them.
- **Dependent-mutation cascade on rollback.** Dropping a rejected `createNote` and re-`rebuild()`ing
  replays later `renameNote`/`applyLabel` of that id over a base without the row; those orphans may
  themselves be rejected server-side (`not_found`) → dropped + toasted. The queue self-heals; ordering
  is preserved by `seq`. The user may see two toasts (accepted — spec 21 risk).
- **`clientGroupID` ↔ user binding.** `sync_client.user_id` binds a group to its first pusher; a push
  from a different user for that group is `forbidden`. This stops one browser's queue de-dup pointer
  from being advanced by another session. Documented so spec 16's puller uses the same binding.
- **Service extraction blast radius.** Extracting the inline route bodies into service functions
  touches `notes/router.ts` + `labels/router.ts`. Keep it a pure refactor (routes call the new
  functions; behavior identical) in its own reviewable step before wiring the server mutators, so the
  existing `router.test.ts` / `private.test.ts` stay green unchanged.
