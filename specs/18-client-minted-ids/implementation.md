# Client-minted note IDs & idempotent create Implementation

## Status: complete

## Completed

TDD throughout (failing tests first, then green + `tsc --noEmit` + Biome). The client-id path is
additive/optional; the flag-off create is byte-for-byte today's behavior.

1. **Shared contract** — `packages/schemas/src/note.ts`: `createNoteArgsSchema = z.object({ id: z.uuid() })`
   + `CreateNoteArgs`, barrel-exported. `note.test.ts`: parses a valid uuid, rejects a non-uuid and a
   missing id. (Goal #2)
2. **Server create semantics** — `apps/api/src/notes/create.ts`: `createNoteRecord(userId, id)` — idempotent
   `insert … onConflictDoNothing({ target: note.id }).returning()`, and on the conflict miss an owner
   `select` → discriminated result `created | exists | conflict` (no cast). Reused by the legacy route and
   spec 19's push mutator. (Goal #3, #5, #7)
3. **Route rewiring** — `apps/api/src/notes/router.ts` `POST /`: parse body with
   `createNoteArgsSchema.partial()` — present-but-malformed id → **422** (never coerced); absent id → keep
   today's server-generated path (+ row response); present-valid id → `createNoteRecord`,
   `created`/`exists` → 201 + row, `conflict` → 409. (Goal #4, #8)
4. **Web mint site** — `apps/web/lib/queries/notes.ts` `useCreateNote`: when `isSyncEngineEnabled()`, mint
   `crypto.randomUUID()` and POST `{ id }`; flag off sends no id (unchanged). Full queue wiring is spec 19.
   (Goal #1)

`create.test.ts` (supertest → Neon): idempotent-by-id (one row, both 201), malformed → 422 (no row),
cross-user → 409 (no overwrite, owner unchanged), no-id back-compat → 201 with a server id. All green.

## Session Notes

### 2026-07-07
- Branch `feat/client-minted-ids` (stacked on spec 15). Schema `bun test` (note.test.ts) 18 pass;
  `create.test.ts` 4/4 pass against Neon; `router.test.ts` 5/5 in isolation. `tsc --noEmit` clean in
  `apps/api` + `apps/web`; Biome clean; no `as any`.
- **DB schema unchanged** — `note.id` stays `uuid().primaryKey().defaultRandom()` (covers the no-id path);
  only the id's *source* moves to the client. No migration.
- **Full-suite Neon flakiness (pre-existing, not this change):** running the *entire* `apps/api` `bun test`
  together intermittently times out (~5000ms) on unrelated label/shared/note-count tests (multi-round-trip
  queries under full-suite Neon load); those files pass in isolation and the failing set varies run to run.
  Related to [[bun-test-pg-gotchas]]. My new create tests pass; the create-route change doesn't touch those
  paths.
- **Deviations vs. design:** none of substance. Web mint is flag-gated (mint only when the engine is on) so
  the flag-off POST stays byte-for-byte (matches ADR-18-02's "absent id keeps current behavior"). The
  `access` field on the create result is typed via `NoteAccess` from `@yapper/schemas` rather than a
  re-declared literal union.
