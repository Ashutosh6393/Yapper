# CLAUDE.md — 16 · CVR Delta Pull

## Project Context

The **puller** half of the metadata lane (ADR-0004): brings the server's authoritative view *down*,
including **removals**. `POST /api/sync/pull` takes the client's last cookie and returns the delta —
`puts` (new/changed notes), `dels` (notes that left the caller's view: make-private / revoke /
hard-delete), the caller's `lastMutationID`, and a fresh cookie — computed with a **Client View
Record (CVR)**: the server stores `{ noteId → metaVersion }` per client group per cookie and diffs the
caller's current authorized view against it, so removals fall out for free (no tombstones).

Adds `note.meta_version` + a `sync_cvr` table, the `apps/api/src/sync/router.ts` pull handler, and the
client puller `apps/web/lib/sync/pull.ts` (apply delta to `db.base`, store cookie + `lastMutationID`,
drop confirmed mutations, `rebuild()`). Behind `NEXT_PUBLIC_SYNC_ENGINE`; flag off ⇒ today's Query
path unchanged. This is the bootstrap-pull seam spec 15 hydrates against and the reconcile step
spec 17 (poke) and spec 21 (rollback) trigger.

## Before Starting Work

1. Read `specs/16-cvr-delta-pull/design.md` (Goal State + `authorizedNotes`, the pull algorithm, CVR
   storage shape, the additive `reset` flag, the client puller, and TDD).
2. Read `decisions.md` (spec-local choices) and the governing ADR `docs/adr/0004-…` (+ `0002-…`).
3. Check `implementation.md` for progress / next step.
4. Look at existing patterns in:
   - `specs/14-sync-foundations/design.md` (`pullRequestSchema`/`pullResponseSchema`, `NoteMeta`,
     `db.base`/`db.sync`/`db.mutations`, `getClientGroupID()`, `rebuild()` seam).
   - `apps/api/src/notes/router.ts` (`GET /` + `GET /shared` — the label-embed / no-N+1 pattern and the
     lifecycle projection) + `apps/api/src/permissions.ts` + `packages/permissions`
     (`effectivePermission` — express its **set form** as `authorizedNotes`).
   - `apps/api/src/app.ts` (`app.use("/api/sync", …)`) + `apps/api/src/authed.ts` (non-null `userId`).
   - `packages/db/src/schema.ts` (`note`, `note_collaborator`, `note_label`; add `meta_version` +
     `sync_cvr`).
   - `apps/web/lib/api.ts` (the credentialed fetch wrapper the puller reuses — no second auth path).

## Code Patterns

- **`authorizedNotes(user)` = the set form of `effectivePermission != "none"`** — owned notes (all
  lifecycle states) ∪ collaborations still shared & not trashed & `status = active`. Two queries → one
  `Map<id, NoteMeta>`. Identical rule to REST/socket, so the pull view never disagrees with `resolvePerm`.
- **CVR diff (in app memory, not SQL):** `puts = view rows new-or-metaVersion-greater-than prev`;
  `dels = prev ids not in view`. Removals are correct by construction (a made-private/revoked/deleted
  note is simply absent from `view`).
- **CVR stored as one `jsonb` blob** per `(client_group_id, cookie)` (`Record<noteId, metaVersion>`),
  not a child-row table — the diff is a whole-snapshot set op over a bounded set; one atomic read/write
  per pull, single-row prune.
- **Cookie = opaque monotonic integer per client group** (string on the wire), never wall-clock;
  `next = (cookie ?? maxForGroup ?? 0) + 1` inside the pull txn; prune to the latest 1–2 per group;
  unknown/pruned cookie → full resync.
- **Additive `reset: z.boolean().optional()`** on `pullResponseSchema` — `true` only when `prev` was
  empty. On reset the client also deletes local `db.base` rows absent from `puts` (missing-as-delete).
  This is the **only** contract change and it is additive (no renames).
- **Client puller writes `db.base` ONLY** (puller-only writer), in one Dexie txn: `bulkPut(puts)` +
  `bulkDelete(dels)` (+ reset orphan sweep), store `cookie`/`lastMutationID` in `db.sync`, delete
  `db.mutations where seq <= lastMutationID`, then `rebuild()` (spec 15) — never write `db.notes`.
- **`meta_version` bumps are NOT this spec's** — spec 19 (mutators) + spec 20 (content) own them; spec
  16 only **reads** the column and **depends on the invariant** that every authoritative write bumps it.
- **No `as any`** — type the CVR snapshot `Record<string, number>`, wire rows as `NoteMeta`.

## Repo Gotchas (for the implementer)

- **No local Docker** — DB = Neon Postgres, Redis = Upstash. api/db tests hit real Neon; run from
  `apps/api` / `packages/db` (Bun loads `.env` from cwd; repo-root run fails "DATABASE_URL is not set").
  Don't run concurrent `bun test` processes (lock-deadlock).
- **api route tests** use supertest with a fake `SessionResolver` (`x-test-user-id`) via `buildApp`.
- **Client puller test** needs `fake-indexeddb/auto` + mocked `fetch`; run from `apps/web` with
  `bunx vitest run --maxWorkers=1`.

## Don't

- **Don't add or own the `meta_version` bumps** — that's spec 19/20. Spec 16 adds the **column** and
  reads it; the bumps live in the mutators/derive helper.
- **Don't build the push side** (`/api/sync/push`, `sync_client` writes, mutators) — spec 19. Spec 16
  **reads** `sync_client.last_mutation_id` (0 if absent).
- **Don't write `db.notes`** — call `rebuild()` (spec 15). `db.base` is the only table the puller writes.
- **Don't rename any `pullResponseSchema` field** — the only change is the additive optional `reset`.
- **Don't use tombstones or client-special-case removals** — the CVR diff produces `dels`.
- **Don't make the cookie a timestamp** — opaque monotonic per client group only.
- **Don't touch realtime co-editing** (the make-private *kick* is orthogonal; spec 16 adds the list-level
  `dels` removal, a separate mechanism). Don't read the env var outside `flag.ts`.
