# 18 · Client-minted note IDs & idempotent create — Design

Today the note id is **server-generated**: `POST /api/notes` runs
`db.insert(note).values({ ownerId }).returning(...)` (`apps/api/src/notes/router.ts:58`) and the client
learns the id only after the network answers. That makes true offline create impossible — the content
body in `y-indexeddb`, the CVR key, and every dependent queued mutation (rename, label, lifecycle) all
need the note's identity **before** any round-trip. This spec moves the id's *source* from the server
to the client: the browser mints `crypto.randomUUID()` at create time, and the server accepts it via an
**idempotent** create (`INSERT … ON CONFLICT (id) DO NOTHING`) that validates the id is a well-formed
UUID and rejects a create whose id already belongs to **another** user.

This is a narrow, foundational slice. It owns two things and nothing more: (1) the **`createNote` argument
shape** (`createNoteArgsSchema` in `@yapper/schemas`), which the mutation queue/pusher in **spec 19**
consumes, and (2) the **server create semantics** — a reusable `createNoteRecord()` helper that both the
existing `POST /api/notes` handler (flag-off back-compat) and spec 19's `/api/sync/push` `createNote`
server mutator call. It does **not** build the mutation framework, the queue, the pusher, Dexie, the CVR,
or the content lane — those are specs 19 / 15 / 16 / 20. Everything stays behind
`NEXT_PUBLIC_SYNC_ENGINE`; the flag-off path keeps working because the client id is added as an
**optional** field, not a hard swap.

## Goal State (acceptance)

1. **Client mints the id.** A `crypto.randomUUID()` v4 id is minted at create time and is the note's
   single identity across every lane: it keys `db.base`/`db.notes` (spec 15), the CVR (spec 16),
   `note_doc.note_id`, and the `y-indexeddb` doc name (spec 20). No temp-id → real-id remap pass exists
   anywhere in the codebase.
2. **`createNote` arg shape is contract-owned.** `createNoteArgsSchema` (`{ id: uuid }`) lives in
   `@yapper/schemas` and is the `args` payload for the `createNote` variant of spec 19's
   `mutationSchema` discriminated union. Web mints the id and enqueues `createNote({ id })`; the server
   validates against the same schema. Neither side redefines the shape.
3. **Create is idempotent by id.** The server create is
   `INSERT INTO note (id, owner_id, …) VALUES (:id, :owner, …) ON CONFLICT (id) DO NOTHING`. Sending the
   **same** `createNote({ id })` twice (retry, duplicate push, replay after a dropped ack) yields exactly
   **one** row and a second **`applied`** verdict — never a duplicate, never a 500. Idempotency holds on
   two independent axes: the primary-key `ON CONFLICT` and spec 19's `lastMutationID` de-dup.
4. **Malformed id is a permanent reject.** A create whose `id` is not a well-formed UUID fails Zod
   validation → **422** (legacy route) / permanent `rejected` verdict with reason `invalid_args`
   (push route); the server never coerces or generates a substitute for a supplied-but-invalid id.
5. **Cross-user id conflict is a permanent reject, not a silent swallow.** When the supplied `id` already
   exists but is owned by a **different** user, the handler detects the conflict (owner check on the
   `ON CONFLICT` miss) and rejects **permanently** — **409** (legacy) / `rejected` with reason
   `id_conflict` (push, → ADR-0009 drop + toast). It does **not** overwrite the existing row and does
   **not** report success.
6. **Full offline create-then-reconnect, no remap.** With the network offline: create a note, then
   rename it, label it, and archive it — all against the **same minted id**, all queued (spec 19). On
   reconnect the queue pushes in `seq` order; `createNote` lands first (idempotent), the dependent
   mutations apply to the now-existing row, and the note reconciles into `db.base` under the identical id.
   No id changes at any point.
7. **Server create logic is reusable and wired both ways.** A single `createNoteRecord(userId, args)`
   helper in `apps/api/src/notes/create.ts` encapsulates the validate → idempotent-insert → owner-on-
   conflict decision and returns a typed result. The existing `POST /api/notes` handler calls it; spec 19's
   push `createNote` server mutator calls the **same** helper. No duplicated create SQL.
8. **Flag-off back-compat preserved.** When `NEXT_PUBLIC_SYNC_ENGINE` is off, `apps/web`'s existing
   `useCreateNote()` path still works: it may omit `id`, in which case `POST /api/notes` server-generates
   (today's `defaultRandom()` behavior) and still returns the row (`{ id, title, access, updatedAt }`).
   The response id echo is retained until spec 19 flips the flag and retires the legacy create call.
9. Slice is done only when the new api tests are green (`bun test` in `apps/api`), `tsc --noEmit` is clean
   in `apps/api` + `packages/schemas`, and Biome is clean.

## Scope

**In:**
- `packages/schemas`: add `createNoteArgsSchema` + `CreateNoteArgs` (`{ id: uuid }`) in `src/note.ts`,
  re-exported from the barrel.
- `apps/api`: new `src/notes/create.ts` — `createNoteRecord(userId, args)` (UUID-validated, idempotent
  `ON CONFLICT (id) DO NOTHING`, owner-on-conflict check) returning a discriminated result; rewire the
  existing `POST /api/notes` handler (`src/notes/router.ts`) to call it with an **optional** client id.
- `apps/web`: mint `crypto.randomUUID()` at create time and pass it as the `createNote` arg. The **wiring**
  of that into the queue/pusher and the removal of the old `useCreateNote()` blocking POST land in spec 19;
  this spec provides the arg shape + the mint site and keeps the flag-off path intact.
- The failing api tests (idempotent-by-id, malformed-id, cross-user-conflict, flag-off back-compat),
  written first.

**Out (see `future-work.md`, and owned by the cited sibling spec):**
- The mutation framework, queue, `seq` ordering, pusher, `/api/sync/push` router, and the `createNote`
  **client mutator** — **spec 19** (this spec only defines the arg shape + server record semantics it
  consumes).
- Dexie `db.base`/`db.notes`/`db.mutations` and `rebuild()` — **spec 15**.
- CVR delta pull and cookie/`meta_version` machinery — **spec 16**.
- Content lane (`y-indexeddb` doc-name keying, `note_doc` upsert, `PUT /api/notes/:id/content`) — **spec 20**.
- Rollback UX (transient vs. permanent classification, toast copy) — **spec 21**; this spec only names the
  permanent reason codes (`id_conflict`, `invalid_args`) that spec 21/19 surface.
- Any change to lifecycle/label/share handlers — untouched here.

---

## The create contract

### Shared schema (`packages/schemas/src/note.ts`)

```ts
/** Args for the `createNote` named mutation (spec 19's mutationSchema) and the client-supplied id on
 * POST /api/notes. The client mints the id (crypto.randomUUID) so it is stable offline (ADR-0006). */
export const createNoteArgsSchema = z.object({
  id: z.string().uuid(),
});
export type CreateNoteArgs = z.infer<typeof createNoteArgsSchema>;
```

The note is created with the **server defaults** it has today — `title: "Untitled"`, `preview: ""`,
`access: "private"`. Title/access are **not** part of the create args; they are changed afterward by the
`renameNote` / `setShareLevel` mutations and by content-lane title derivation (spec 20). Keeping the create
payload to `{ id }` matches the current "create an owned note with defaults" behavior and keeps the offline
create trivially replayable.

`createNoteArgsSchema` becomes the `args` of the `createNote` member of spec 19's `mutationSchema`
discriminated union — spec 19 imports it rather than redefining the shape.

### Idempotent SQL + owner-on-conflict check (`apps/api/src/notes/create.ts`)

```ts
import { db, note } from "@yapper/db";
import { and, eq, sql } from "drizzle-orm";

export type CreateNoteResult =
  | { status: "created" | "exists"; row: { id: string; title: string; access: "private" | "view" | "edit"; updatedAt: Date } }
  | { status: "conflict"; reason: "id_conflict" };

/**
 * Idempotently create an owned note at a client-supplied id (ADR-0006). Reused by POST /api/notes
 * (flag-off) and spec 19's /api/sync/push createNote server mutator (flag-on). The caller validates
 * `id` against createNoteArgsSchema first (well-formed UUID). Never trusts client ownership/timestamps.
 */
export async function createNoteRecord(userId: string, id: string): Promise<CreateNoteResult> {
  // INSERT … ON CONFLICT (id) DO NOTHING RETURNING → row present ⇒ we inserted; empty ⇒ id already exists.
  const [inserted] = await db
    .insert(note)
    .values({ id, ownerId: userId })
    .onConflictDoNothing({ target: note.id })
    .returning({ id: note.id, title: note.title, access: note.access, updatedAt: note.updatedAt });
  if (inserted) return { status: "created", row: inserted };

  // Conflict path: the id exists. Idempotent iff the same owner; a different owner is a permanent reject.
  const [existing] = await db
    .select({ ownerId: note.ownerId, id: note.id, title: note.title, access: note.access, updatedAt: note.updatedAt })
    .from(note)
    .where(eq(note.id, id))
    .limit(1);
  if (!existing || existing.ownerId !== userId) return { status: "conflict", reason: "id_conflict" };
  const { ownerId: _o, ...row } = existing;
  return { status: "exists", row };
}
```

- **`created`** → first write; return **201** (legacy) / `applied` (push).
- **`exists`** → same-owner replay; the `ON CONFLICT DO NOTHING` was a no-op → return **201/200 with the
  existing row** (legacy, idempotent) / `applied` (push). No overwrite; timestamps untouched.
- **`conflict`** → id owned by someone else → **409** (legacy) / `rejected { reason: "id_conflict" }`
  (push). Never overwrite, never report success (ADR-0006 fail-safe).

### Route rewiring (`apps/api/src/notes/router.ts`, `POST /`)

`id` becomes an **optional** body field (additive, so the flag-off client that sends no body is unaffected):

- Parse the body with a permissive `z.object({ id: z.string().uuid() }).partial()` (or `createNoteArgsSchema.partial()`).
  A **present-but-malformed** id → **422** (never coerced). Absent id → keep today's server-generated path
  (`db.insert(note).values({ ownerId }).returning(...)`), returning the row exactly as now.
- Present valid id → `createNoteRecord(userId, id)`; map `created`/`exists` → return the row (201), `conflict`
  → 409.

The response continues to carry the row (`createNoteResponseSchema`) for flag-off back-compat. In the
sync-engine (flag-on) path the pusher already **has** the id, so spec 19's server mutator returns only a
verdict — the id echo is not needed there and the legacy route is retired when spec 19 flips the flag.

---

## Flow: offline create → reconnect (goal #6)

1. User clicks **New note** offline. Web mints `id = crypto.randomUUID()`, enqueues `createNote({ id })`
   (spec 19), and opens the editor keyed by `id` (content lane, spec 20). The note appears instantly via
   `rebuild()` (spec 15) — no network.
2. User renames, labels, and archives the note. Each is a named mutation enqueued with a monotonic `seq`
   **after** the create, all referencing the **same** `id`.
3. Network returns. The pusher sends the batch in `seq` order to `/api/sync/push` (spec 19). The server
   applies `createNote` first via `createNoteRecord` (`created`), then `renameNote`/`applyLabel`/
   `archiveNote` against the existing row. Every server mutator bumps `meta_version` (spec 14/16).
4. The CVR puller (spec 16) returns the reconciled row under the **identical** `id`; `db.base` updates in
   place. No id remap, ever.
5. If step 3's push is retried (dropped ack), `createNote` hits `ON CONFLICT DO NOTHING` → `exists` →
   `applied`; the dependent mutations are de-duped by `lastMutationID`. Duplicate push is a no-op.

---

## Cross-cutting rules

- **Contract in `@yapper/schemas`.** `createNoteArgsSchema` is the single source of truth for the create
  args; web + api + spec 19 import it. Derive types with `z.infer`. Never duplicate the shape.
- **Permissions stay server-authoritative.** The create sets `owner_id = session user`; the server never
  trusts client-supplied ownership or timestamps beyond the id itself (ADR-0006). A minted id confers no
  authority — cross-user reuse is rejected.
- **No `as any`.** Strict TS; `createNoteRecord`'s result is a discriminated union, not a cast. Match Biome
  style (2-space, double quotes, 100 cols).
- **Behind the flag.** The client-id path is additive and gated by `NEXT_PUBLIC_SYNC_ENGINE`; the flag-off
  create path is byte-for-byte the current behavior.
- **DB schema unchanged.** `note.id` stays `uuid(...).primaryKey().defaultRandom()`
  (`packages/db/src/schema.ts:119`) — only its *source* moves to the client. `defaultRandom()` still covers
  the flag-off (no-id) path. FKs (`note_doc.note_id`, `note_label.note_id`) are unaffected. **No migration.**

## TDD — failing tests to write first

**`apps/api/src/notes/create.test.ts`** (supertest against `POST /api/notes`, fake `x-test-user-id`
resolver as in the existing `router.test.ts`; run from `apps/api` via `bun test`):

1. **Idempotent by id** — POST `{ id: U }` as user A twice → both **201**, response id `=== U`; a direct
   `db.select` shows exactly **one** `note` row with id `U`. The second call did not create a duplicate and
   did not error.
2. **Malformed id rejected** — POST `{ id: "not-a-uuid" }` → **422**; no row created. (Present-but-invalid
   is never coerced or server-generated.)
3. **Cross-user conflict rejected** — user A POSTs `{ id: U }` (201); user B POSTs `{ id: U }` → **409**;
   the row's `owner_id` is still A (no overwrite), and B sees no success.
4. **Flag-off back-compat** — POST with **no** `id` (empty body) → **201** with a server-generated
   `id` present in the response (today's behavior preserved).

**`packages/schemas/src/note.test.ts`** (extend existing; `bun test`):

5. `createNoteArgsSchema` **parses** `{ id: <valid uuid> }` and **rejects** a non-uuid id and a missing id.

(The web-side "mint a uuid and enqueue `createNote({ id })`" behavior is exercised by spec 19's queue
tests, which consume `createNoteArgsSchema`; this spec's web change is the mint site + arg wiring only.)

## Dependencies (build order)

Per ADR / build-order map (`specs/_templates` brief): this is **spec 18 (ADR-0006)**, built **after 14 and
15**, and **before 19**.

- **Spec 14 (sync-foundations, ADR-0002)** — the `NEXT_PUBLIC_SYNC_ENGINE` flag + `isSyncEngineEnabled()`
  and the `@yapper/schemas` scaffolding this spec adds to. Prerequisite.
- **Spec 15 (dexie-local-store, ADR-0003)** — `db.base`/`db.notes` keyed by the minted id; the id this spec
  mints is what spec 15 stores. Prerequisite.
- **Spec 19 (named-mutators, ADR-0007) — the coordination boundary.** Spec 19 **owns** the mutation queue,
  monotonic `seq`, the pusher/rollback classifier, the `/api/sync/push` router, `mutationSchema`, and the
  `createNote` **client mutator** + the **server-mutator wiring** that calls `createNoteRecord`. **Spec 18
  owns**: (a) `createNoteArgsSchema` (the `createNote` `args` shape spec 19's union references), and (b)
  `createNoteRecord` (the idempotent + owner-on-conflict server create semantics). Spec 19 **consumes**
  both. The permanent reason codes this spec names (`id_conflict`, `invalid_args`) are included in spec 19's
  `pushResponseSchema` reason enum and surfaced by spec 21.
- **Spec 16 (cvr-delta-pull)** and **spec 20 (content-lane)** consume the same id downstream (CVR key,
  `note_doc.note_id`, `y-indexeddb` doc name) but are not blockers for *this* slice.

## Risks / notes

- **UUID collision.** `crypto.randomUUID()` is v4 (122 random bits) — collision probability is negligible.
  `ON CONFLICT (id) DO NOTHING` is the fail-safe: an accidental collision **never overwrites** existing
  data. A cross-*user* collision is caught by the owner check → permanent `id_conflict` reject. The only
  un-flagged case is the astronomically-unlikely *same-user self-collision*, which resolves to `exists`
  (idempotent no-op) — harmless, since it's the same owner; documented, not guarded.
- **Idempotency has two guards, both required.** The PK `ON CONFLICT` protects against duplicate *rows*;
  spec 19's `lastMutationID` protects against re-*applying* dependent mutations. A create replayed **before**
  `lastMutationID` advances hits `ON CONFLICT DO NOTHING`; one replayed **after** is dropped client-side.
  Both are safe — but this spec must not assume `lastMutationID` alone (spec 18 can land before spec 19's
  de-dup is wired), so the PK idempotency stands on its own.
- **Ordering (create before dependents).** If a `renameNote`/`applyLabel` for id `U` reached the server
  before its `createNote`, the dependent mutator would 404. Strict `seq`-ordered application in the push
  handler (spec 19) prevents this — call it out as a spec-19 invariant this spec depends on. Within one
  queue the create always has the lower `seq`.
- **Back-compat fragility.** The `id`-optional additive change is what keeps the flag-off path working;
  do **not** make `id` required or drop the response id echo in this spec — that swap belongs to spec 19's
  flag flip. A present-but-**malformed** id must 422 (not fall through to server-generate), or a buggy
  client could silently get a different id than it keyed content by.
- **Hostile client.** A client could POST an id it doesn't own or a malformed id; both are covered
  (owner-on-conflict 409, Zod-uuid 422). The server never trusts client ownership/timestamps beyond the id.
