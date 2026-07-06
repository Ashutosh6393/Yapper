# Client-minted note IDs & idempotent create Implementation

## Status: not-started

## Completed

## In Progress

## Blocked

- Depends on **spec 14** (`NEXT_PUBLIC_SYNC_ENGINE` flag + `@yapper/schemas` scaffolding) and **spec 15**
  (Dexie `db.base`/`db.notes` keyed by the minted id) landing first.
- Coordinates with **spec 19**, which consumes `createNoteArgsSchema` (the `createNote` `args`) and
  `createNoteRecord` (server create semantics). This spec provides both; spec 19 wires them into the queue /
  pusher / `/api/sync/push`.

## Next Steps

1. Write the failing tests first (TDD): `apps/api/src/notes/create.test.ts` — idempotent-by-id,
   malformed-id → 422, cross-user conflict → 409, flag-off (no-id) back-compat; and a
   `packages/schemas/src/note.test.ts` case for `createNoteArgsSchema` (parses valid uuid, rejects non-uuid /
   missing).
2. Add `createNoteArgsSchema` + `CreateNoteArgs` to `packages/schemas/src/note.ts`; barrel-export it.
3. Add `apps/api/src/notes/create.ts` — `createNoteRecord(userId, id)` with idempotent
   `onConflictDoNothing({ target: note.id })` + owner-on-conflict select, returning `created | exists | conflict`.
4. Rewire `POST /api/notes` in `apps/api/src/notes/router.ts` to accept an optional client `id` and call
   `createNoteRecord`; keep the no-id server-generated path + row response for flag-off back-compat.
5. Mint `crypto.randomUUID()` at the create site in `apps/web` and pass it as the `createNote` arg (full
   queue wiring is spec 19).
6. Verify: `bun test` green in `apps/api`; `tsc --noEmit` clean in `apps/api` + `packages/schemas`; Biome clean.

## Session Notes
