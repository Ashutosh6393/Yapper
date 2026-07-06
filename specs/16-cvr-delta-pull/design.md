# 16 · CVR Delta Pull — Design

The pusher (spec 19) sends the client's own mutations up; this spec builds the other half of the
metadata lane — the **puller** that brings the server's authoritative view *down*, including
**removals**. `POST /api/sync/pull` takes the client's last cookie and returns the delta since then:
`puts` (new/changed notes), `dels` (notes that left the caller's view — make-private, revoke, or
hard-delete), the caller's `lastMutationID`, and a fresh cookie. It does this with a **Client View
Record (CVR)** (ADR-0004): the server stores, per client group per cookie, the exact
`{ noteId → metaVersion }` snapshot it last sent, and each pull **diffs the caller's current
authorized view against that stored snapshot** — so removals fall out of the diff for free, with no
tombstone table and no special client code.

This spec adds the server state the diff needs (`note.meta_version` + a `sync_cvr` table), the
`apps/api/src/sync/router.ts` `pull` handler, and the client puller `apps/web/lib/sync/pull.ts` that
applies the delta to `db.base`, records the cookie + `lastMutationID` in `db.sync`, drops confirmed
mutations from `db.mutations`, and calls `rebuild()` (spec 15). Everything stays behind
`NEXT_PUBLIC_SYNC_ENGINE`; with the flag off the app is byte-for-byte today's TanStack Query notes
path. This spec is the **bootstrap-pull seam** spec 15 hydrates against and the reconcile step the
poke transport (spec 17) and rollback UX (spec 21) trigger.

## Goal State (acceptance)

**Server: metadata version + CVR store**
1. `packages/db` adds `note.meta_version` (`bigint`, default `0`). It is the per-note metadata
   version the CVR diffs on. **This spec adds the column and reads it; the *bumps* live in the server
   mutators (spec 19) and the content-derive helper (spec 20)** — spec 16 does not redefine those
   mutators, it depends on the invariant "*every authoritative metadata write bumps `meta_version`*"
   (see *Dependencies*). A migration is generated under `packages/db/drizzle/`.
2. `packages/db` adds a `sync_cvr` table keyed `(client_group_id, cookie)` storing the
   `{ noteId → metaVersion }` snapshot last returned to that client group at that cookie (jsonb — see
   *CVR storage shape*). A migration is generated.

**Server: `POST /api/sync/pull`**
3. A new router `apps/api/src/sync/router.ts` is mounted at `/api/sync` in `apps/api/src/app.ts`,
   behind the same `requireAuth` middleware as the notes router. `pull` parses its body with
   `pullRequestSchema` (`@yapper/schemas`) → `{ clientGroupID, cookie }`; a bad body is `400`.
4. `pull` computes **`authorizedNotes(user)`** — the caller's owned notes (all lifecycle states) plus
   notes they collaborate on that are still shared and not trashed — using the **same rule as
   `@yapper/permissions`** (`effectivePermission != "none"`), expressed as the set query (see
   *authorizedNotes*). Each note carries its `metaVersion` and the `NoteMeta` fields.
5. `pull` loads `prev = sync_cvr[clientGroupID][cookie]` (empty `{}` when `cookie` is `null`, unknown,
   or pruned), then diffs (ADR-0004):
   - `puts = { n ∈ view | n.id ∉ prev  OR  n.metaVersion > prev[n.id] }`
   - `dels = { id ∈ prev | id ∉ view }`
6. `pull` issues a **new opaque monotonic cookie** (per-client-group sequence, never wall-clock),
   stores `sync_cvr[clientGroupID][cookie'] = { id → metaVersion for view }`, and returns
   `{ puts, dels, lastMutationID, cookie }` matching `pullResponseSchema`. `lastMutationID` is read
   from `sync_client` (spec 19; `0` when absent) so the pull closes the loop with the pusher.
7. **Removal correctness — make-private**: given a collaborator C who has note N in their CVR, after
   the owner makes N private, C's next `pull` returns `N.id ∈ dels` (N is absent from C's `view`
   because `access = "private"` → `effectivePermission = none`). The **owner's** next pull does *not*
   list N in `dels` (they still own it). A goal-state test asserts both.
8. **Removal correctness — revoke**: given collaborator C with N in their CVR, after C's collaborator
   row is set `revoked` (which make-private also does), C's next pull returns `N.id ∈ dels`
   (non-active collaborator → `none`). Test asserts it.
9. **Removal correctness — hard delete**: after a note is permanently deleted (row gone), every client
   group that had it in its CVR gets `N.id ∈ dels` on the next pull. Test asserts it.
10. **Full resync on unknown/stale cookie**: when `cookie` is `null`/unknown/pruned, `prev` is empty,
    so `puts` = the entire authorized view and `dels` = `[]`; the response carries `reset: true` (the
    spec-16 additive flag — see *Contract note*) so the client can reconcile local rows the empty
    `prev` could not name. A test asserts a `null`-cookie pull returns the whole view with
    `reset: true` and an empty `dels`.

**Client: puller `apps/web/lib/sync/pull.ts`**
11. `pull()` reads `clientGroupID` + `cookie` from `db.sync`, POSTs `{ clientGroupID, cookie }` to
    `/api/sync/pull`, and validates the response with `pullResponseSchema`.
12. In a single Dexie transaction it applies the delta to **`db.base`** only (puller-only writer,
    spec 14): `db.base.bulkPut(puts)` then `db.base.bulkDelete(dels)`. On `reset: true` it *also*
    deletes every `db.base` row whose id is **not** in `puts` (missing-as-delete), so a stale cookie
    self-heals to the server's exact view.
13. It writes `cookie` and `lastMutationID` into `db.sync` (keys `cookie`, `lastMutationID`), then
    **drops confirmed mutations** from `db.mutations` (`where seq <= lastMutationID`) — the client's
    own mutations now baked into `base`.
14. It calls `rebuild()` (spec 15) so `db.notes` re-materializes from the new `base` + the remaining
    queue, and the `useLiveQuery` UI updates. A goal-state test proves a make-private `del` removes
    the note from `db.base` and, after `rebuild()`, from `db.notes`.
15. `pull()` is exported as the **bootstrap-pull** primitive spec 15's hydrate step calls and the
    poke/focus/reconnect backstops (spec 17) trigger. It is a no-op path when
    `isSyncEngineEnabled()` is false (never called from the live flag-off path).

**Cross-cutting**
16. Contracts come from `@yapper/schemas` (`pullRequestSchema` / `pullResponseSchema`); no shape is
    duplicated in web or api. `tsc --noEmit` clean in `apps/api`, `apps/web`, `packages/db`,
    `packages/schemas`; Biome clean (2-space, double quotes, 100 cols); no `as any`. Goal-state tests
    written first (TDD) and green.

## Scope

**In:**
- `packages/db/src/schema.ts` — add `note.meta_version` (`bigint`, default `0`) and the `sync_cvr`
  table; generate the migration under `packages/db/drizzle/`.
- `apps/api/src/sync/router.ts` (new) — the `pull` handler: `authorizedNotes` set query, CVR diff,
  cookie issue + snapshot store. Mounted at `/api/sync` in `apps/api/src/app.ts`.
- `apps/api/src/sync/cvr.ts` (new, optional split) — CVR read/write + cookie helpers, kept out of the
  route handler for unit-testability.
- `packages/schemas/src/sync.ts` — **additive** `reset: z.boolean().optional()` on
  `pullResponseSchema` (see *Contract note*); no rename of any existing field.
- `apps/web/lib/sync/pull.ts` (new) + test — the client puller (apply puts/dels to `db.base`, store
  cookie + `lastMutationID`, drop confirmed mutations, `rebuild()`).
- Goal-state tests: api `pull` unit tests (puts/dels/removal/full-resync) and the client apply test.

**Out (see future-work.md and the named sibling spec):**
- The **push** side (`/api/sync/push`, `sync_client`, `lastMutationID` *writes*, server mutators that
  *bump* `meta_version`) → **spec 19** (named-mutators). Spec 16 *reads* `sync_client.last_mutation_id`
  and depends on the mutators to bump versions; it does not write either.
- `rebuild()` **replay body** and `db.notes` / `useLiveQuery` selectors → **spec 15** (dexie-local-store).
  Spec 16 *calls* `rebuild()` as the seam spec 14 exported.
- SSE poke transport / focus + reconnect backstops that *trigger* `pull()` → **spec 17** (sse-poke).
  Spec 16 exports `pull()`; it does not wire the triggers.
- Content lane (`PUT /api/notes/:id/content`, shared derive helper) that bumps `meta_version` on
  title/preview re-derivation → **spec 20** (content-lane).
- Rollback classification / verdict toasts (the `push` response) → **spec 21** (rollback-ux).
- Client-minted ids and idempotent create → **spec 18**. Spec 16 assumes note ids are already the
  shared client-minted `crypto.randomUUID()` that keys `db.base` and the CVR.
- Retiring `apps/web/lib/queries/notes.ts` / `optimistic.ts` — only at the final cutover (spec 19),
  and only when the flag flips. Spec 16 must not touch them.

---

## Server state — `packages/db`

### `note.meta_version`

```
// packages/db/src/schema.ts — added to the existing `note` table
metaVersion: bigint("meta_version", { mode: "number" }).notNull().default(0),
```

The per-note metadata version the CVR diffs on. Stored `bigint` (monotonic counter; `mode: "number"`
so it matches `NoteMeta.metaVersion: z.number()` on the wire — a version counter stays well within
`Number.MAX_SAFE_INTEGER`). **Invariant (ADR-0004): every authoritative metadata write to a note
bumps `meta_version`** — rename, lifecycle (archive/unarchive/trash/restore), share-level change,
label apply/remove, and title/preview re-derivation from content. Those writes are the **server
mutators (spec 19)** and the **content-derive helper (spec 20)**; this spec neither owns nor
duplicates them — it consumes the invariant. A missed bump = a silently stale client (see *Risks*).

### `sync_cvr`

```
export const syncCvr = pgTable(
  "sync_cvr",
  {
    clientGroupId: uuid("client_group_id").notNull(),
    cookie: bigint("cookie", { mode: "number" }).notNull(), // opaque monotonic per client group
    // { noteId -> metaVersion } snapshot last returned to this client group at this cookie
    snapshot: jsonb("snapshot").$type<Record<string, number>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.clientGroupId, t.cookie] }),
    index("sync_cvr_client_group_idx").on(t.clientGroupId),
  ],
);
```

**CVR storage shape — jsonb, not child rows.** The snapshot is stored as one `jsonb` blob per
`(client_group_id, cookie)` row rather than a `sync_cvr_entry(client_group_id, cookie, note_id,
meta_version)` child table. Rationale: the diff is a whole-snapshot set operation done **in
application memory** over a *bounded* set (a user's authorized notes — tens to low hundreds), never a
SQL join, so the queryability a child table buys is unused; jsonb gives one atomic read and one atomic
write per pull versus N-row `insert`/`delete` churn, and pruning is a single-row delete. Tradeoff:
the whole snapshot is read/rewritten each pull even for a one-note change (acceptable at this
cardinality) and individual entries aren't SQL-indexable (not needed). See *decisions.md* for the full
ADR-style entry.

**Cookie scheme.** The cookie is an **opaque monotonic integer per client group**, serialized to a
string on the wire (`pullResponseSchema.cookie: z.string()`), never a wall-clock timestamp
(ADR-0004 — avoids clock-skew gaps). The next cookie is `(sent cookie ?? maxExistingCookieForGroup ??
0) + 1`, computed inside the pull transaction, so it strictly increases while the client is live.
Pruning keeps the **latest 1–2 cookies per client group** (delete older rows), and because a single
client group shares one `db.sync` cookie across tabs (IndexedDB is origin-scoped), the in-use cookie
is never pruned. A genuinely stale/unknown cookie (DB reset, long-pruned) falls through to the
full-resync path (#10). See *Risks* for the sequence-restart edge.

---

## Server route — `apps/api/src/sync/router.ts`

Mounted next to the notes router:

```ts
// apps/api/src/app.ts
app.use("/api/sync", syncRouter(requireAuth(options.resolveSession)));
```

Uses the existing `authed()` wrapper (`apps/api/src/authed.ts`) for the non-nullable `userId`.

### `authorizedNotes(user)`

The caller's current view. This is the **set form** of `@yapper/permissions`'
`effectivePermission != "none"` — identical rule to REST/socket, so the pull view never disagrees with
what `GET /api/notes/:id` (`resolvePerm`) would grant. Two queries, unioned into a `Map<id, NoteMeta>`:

- **Owned** — `note.ownerId = user` in **all** lifecycle states (active/archived/trashed are all part
  of the metadata view; a trashed note is `lifecycle: "trashed"`, not a removal — the owner always
  resolves to `edit`). Selects `id, title, preview, access, archivedAt, trashedAt, updatedAt,
  metaVersion`; `labelIds` from `note_label` (one grouped query over the page's ids, mirroring
  `notesRouter`'s no-N+1 label embed).
- **Shared** — `note_collaborator ⋈ note` where `noteCollaborator.userId = user AND
  noteCollaborator.status = 'active' AND note.access != 'private' AND note.trashedAt IS NULL`. These
  are exactly the rows `effectivePermission` grants `view`/`edit` for a non-owner. `labelIds = []`
  (labels are the owner's private organization; a collaborator doesn't see them).

Each row is projected to `NoteMeta`: `lifecycle` derived (`trashedAt` set → `trashed`, else
`archivedAt` set → `archived`, else `active`), `updatedAt` as ISO string, `metaVersion` from the
column.

### Pull algorithm (matches ADR-0004)

```
POST /api/sync/pull  { clientGroupID, cookie }  (parsed by pullRequestSchema)

view  = authorizedNotes(user)                 // Map<id, NoteMeta>, via @yapper/permissions rule
prev  = syncCvr.get(clientGroupID, cookie)    // {id -> metaVersion}; {} if cookie null/unknown/pruned
reset = (cookie != null) is unmatched OR cookie == null   // empty prev → full snapshot

puts  = [ n for n in view.values()
          if n.id not in prev  or  n.metaVersion > prev[n.id] ]
dels  = [ id for id in prev.keys()  if id not in view ]     // make-private / revoke / hard-delete

cookie' = nextCookie(clientGroupID, cookie)   // (cookie ?? maxForGroup ?? 0) + 1
syncCvr.put(clientGroupID, cookie', { n.id -> n.metaVersion  for n in view })
pruneOldCookies(clientGroupID)                // keep latest 1-2

lastMutationID = syncClient.lastMutationId(clientGroupID) ?? 0   // spec 19 writes it

return { puts, dels, lastMutationID, cookie: String(cookie'), reset }
```

Removals are correct **by construction**: a made-private / revoked / hard-deleted note is simply
absent from `view`, so its id (present in `prev`) lands in `dels`. No tombstones, no client-special
casing.

### Contract note — additive `reset`

`pullResponseSchema` (spec 14) fixes `{ puts, dels, lastMutationID, cookie }`. Spec 16 makes one
**additive, optional** extension: `reset: z.boolean().optional()`. It is `true` only when `prev` was
empty (first pull, or unknown/pruned cookie). This is the additive-change lane spec 14 explicitly
permits ("*additive changes by later specs are fine, renames are not*"); every existing field keeps
its name and meaning, and a parser that ignores `reset` still validates. It exists because on an empty
`prev` the server **cannot name** the client's now-orphaned local rows in `dels` (it never recorded
them), so the client must reconcile by missing-as-delete — and it needs the flag to know a delta from
a full snapshot. Without it, a stale-cookie pull silently leaves removed notes in `db.base`
(data-corruption bug). See *decisions.md*.

---

## Client puller — `apps/web/lib/sync/pull.ts`

```ts
export async function pull(): Promise<void> {
  const clientGroupID = await getClientGroupID();
  const cookie = (await db.sync.get("cookie"))?.value ?? null;

  const res = await apiFetch("/api/sync/pull", {
    method: "POST",
    body: { clientGroupID, cookie },
  });
  const { puts, dels, lastMutationID, cookie: next, reset } = pullResponseSchema.parse(res);

  await db.transaction("rw", db.base, db.sync, db.mutations, async () => {
    await db.base.bulkPut(puts);
    await db.base.bulkDelete(dels);
    if (reset) {
      const keep = new Set(puts.map((p) => p.id));
      const orphans = (await db.base.toCollection().primaryKeys()).filter((id) => !keep.has(id));
      await db.base.bulkDelete(orphans); // missing-as-delete on full resync
    }
    await db.sync.put({ key: "cookie", value: next });
    await db.sync.put({ key: "lastMutationID", value: String(lastMutationID) });
    // Drop the client's own mutations the server has now baked into base.
    await db.mutations.where("seq").belowOrEqual(lastMutationID).delete();
  });

  await rebuild(); // spec 15 — re-materialize db.notes from base + remaining queue
}
```

- **`db.base` is the only authoritative table the puller writes** (spec 14). It never writes
  `db.notes` directly — that is `rebuild()`'s job, keeping a single materialization path.
- **Confirmed-mutation drop** uses `db.mutations.seq` (the client-local monotonic id the pusher sent);
  `lastMutationID` is the highest `seq` the server applied for this client group, so `seq <=
  lastMutationID` are done and safe to drop. The remaining (higher-`seq`) mutations replay over the
  fresh `base` in `rebuild()`, preserving optimistic local state.
- **Full resync** (`reset: true`) reconciles orphaned local rows the empty `prev` could not name.
- `apiFetch` / the exact HTTP helper follows whatever spec 15/19 establish for the engine's server
  calls; if none exists yet, use the same credentialed `fetch` wrapper the Query path uses
  (`apps/web/lib/api.ts`). Do not introduce a second auth mechanism.

---

## Dependencies & build order

Spec numbers follow the ADRs (16 ↔ 0004); the **build** order differs. Per the engine graph, spec 16
**depends on 14, 15, and 19** and is built **after** them (recommended sequence:
`14 → 15 → 18 → 19 → 16 → 21 → 17 → 20`):

| Needs from | What |
|---|---|
| **14** (sync-foundations) | `pullRequestSchema` / `pullResponseSchema` / `NoteMeta` contracts; the Dexie `yapper-sync` schema (`base`/`mutations`/`sync`); the `rebuild()` seam; `getClientGroupID()`; the feature flag. |
| **15** (dexie-local-store) | the `rebuild()` **replay body** + `db.notes` materialization the puller's `rebuild()` call drives. |
| **19** (named-mutators) | `sync_client.last_mutation_id` (read here), and the **server mutators that bump `meta_version`** — without the bumps, `puts` never fires for changed rows. Build 19 first. |
| **18** (client-minted-ids) | note ids already client-minted `crypto.randomUUID()`, shared across `db.base` / CVR / `note_doc.note_id`. |

Spec 16 in turn **unblocks 17** (poke triggers `pull()`) and feeds **21** (pull carries
`lastMutationID` that confirms/drops pushed mutations). Everything stays behind
`NEXT_PUBLIC_SYNC_ENGINE` until the whole sequence lands.

---

## TDD — failing goal-state tests first

**api `pull` unit tests** (`apps/api/src/sync/router.test.ts`, `bun test` + supertest, `x-test-user-id`
resolver via `buildApp({ skipAuth: true })`; drive metadata changes by writing `note.meta_version` /
`note.access` / `note_collaborator.status` directly — this isolates the puller from the spec-19
mutators):
1. **First pull (`cookie: null`)** returns all authorized notes in `puts`, empty `dels`,
   `reset: true`, and a non-null `cookie`; a CVR row is stored for the new cookie.
2. **Delta — changed row**: bump one note's `meta_version`, pull with the prior cookie → that note (and
   only it) is in `puts`; unchanged notes are absent.
3. **Delta — new row**: insert a new owned note (bumped version), pull → it appears in `puts`.
4. **Removal — make-private** (goal #7): owner-B makes note N private (set `access=private` + revoke
   collaborators); collaborator-C's next pull → `N.id ∈ dels`; owner-B's next pull → `N.id ∉ dels`.
5. **Removal — revoke** (goal #8): set C's collaborator row `revoked`; C's pull → `N.id ∈ dels`.
6. **Removal — hard delete** (goal #9): delete the note row; a client group that had it → `N.id ∈ dels`.
7. **Full resync on unknown cookie** (goal #10): pull with a bogus cookie → whole view in `puts`,
   empty `dels`, `reset: true`.
8. `lastMutationID` is echoed from `sync_client` (0 when absent).

**client apply test** (`apps/web/lib/sync/pull.test.ts`, Vitest + `fake-indexeddb/auto`, mocked
`fetch`; run from `apps/web` with `bunx vitest run --maxWorkers=1`):
9. `pull()` applies `puts` to `db.base` and, after `rebuild()`, the note is in `db.notes`.
10. A `dels` entry (make-private) removes the note from `db.base` and, after `rebuild()`, from
    `db.notes` (goal #14).
11. `pull()` stores `cookie` + `lastMutationID` in `db.sync` and deletes `db.mutations` rows with
    `seq <= lastMutationID`, leaving higher-`seq` mutations queued.
12. `reset: true` deletes local `db.base` rows absent from `puts` (missing-as-delete).

A slice is **done** only when these are green + `tsc --noEmit` clean (api/web/db/schemas) + Biome
clean.

---

## Cross-cutting rules
- **Contracts in `@yapper/schemas`** (`pullRequestSchema` / `pullResponseSchema`), imported by web +
  api; never duplicate a shape. The only contract change is the **additive** optional `reset` — no
  renames (spec 14 owns the envelope names).
- **Permissions stay server-authoritative.** `authorizedNotes` is the *set form* of the exact
  `@yapper/permissions` rule (`effectivePermission != "none"`), so the pull view never disagrees with
  the single-note gate (`resolvePerm`). The client is never a trust boundary; optimistic local state
  is always reconcilable to the pulled view.
- **Everything behind the feature flag.** `pull()` is only ever called from engine code gated by
  `isSyncEngineEnabled()`; with the flag off, no pull runs and today's Query path is unchanged.
- **`db.base` is puller-only**; `db.notes` is written only by `rebuild()`. One materialization path.
- **Cookie is opaque + monotonic** per client group (never wall-clock).
- **No `as any`.** Strict TS; type the CVR snapshot as `Record<string, number>`, the wire rows as
  `NoteMeta` from `@yapper/schemas`.
- **Realtime co-editing is untouched** — Hocuspocus cursors/presence and the made-private *kick* are
  orthogonal; this spec only adds the metadata *list* removal via `dels`. (The kick and the `dels`
  removal are triggered by the same make-private action but are independent mechanisms.)
- **TDD**: failing goal-state tests first (above), then green + `tsc --noEmit` + Biome.

## Risks / notes
- **Missed `meta_version` bump = silently stale client.** The whole diff rides on the invariant that
  *every* authoritative metadata write bumps the version. Spec 16 doesn't own the mutators (spec 19/20
  do), so it can't enforce it here — but it depends on it. Mitigation: a shared server helper that
  performs the bump in the same statement/transaction as the write (spec 19), and a puller test that
  fails loudly if a changed row doesn't surface in `puts`. Call this out in spec 19's review.
- **CVR storage growth / pruning.** One `{id→version}` jsonb blob per client group per outstanding
  cookie. Unpruned, abandoned client groups accumulate rows. Mitigation: prune to the latest 1–2
  cookies per client group on every pull (single-row delete), and a future janitor sweeps client
  groups idle > N days (future-work). At Yapper's scale the per-user note count bounds each blob to a
  few KB.
- **Cookie sequence restart after full prune.** Deriving the next cookie as `max(existing)+1` means a
  client group whose rows were *all* pruned restarts the sequence at 1, potentially reusing a number.
  This is **safe**: a reused cookie only ever matters if a client presents it, and any cookie the
  server can't currently find triggers a full resync regardless of its numeric value (the number is
  opaque — it's only ever looked up, never compared for ordering by the client). Documented, accepted.
- **Full-resync missing-as-delete needs the `reset` flag.** Without the additive `reset`, a
  stale-cookie pull would leave removed notes in `db.base` (empty `prev` can't name them in `dels`).
  The optional flag closes this; it's the one place spec 16 extends the spec-14 envelope, additively.
- **`authorizedNotes` is two queries, not per-note `resolvePerm`.** For a *list* we express the
  permission rule as SQL (as REST's `GET /` and `GET /shared` already do) rather than N cache lookups.
  The rule is identical to `effectivePermission`; if the derivation ever changes, both the pure
  function and this set query must move together (note it in `@yapper/permissions` review).
- **jsdom has no IndexedDB.** The client puller test needs `fake-indexeddb/auto` (dev-only, in the web
  test setup); keep it out of the app bundle. The `apps/web` full Vitest suite OOMs on default
  parallel — run `bunx vitest run --maxWorkers=1` from `apps/web`.
- **No local Docker.** api/db tests hit real Neon Postgres + optional Upstash Redis; run from each
  app's dir so Bun loads its `.env` (see CLAUDE.md).
