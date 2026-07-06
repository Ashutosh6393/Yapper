# CLAUDE.md — 18 · Client-minted note IDs & idempotent create

## Project Context

Move the note id's *source* from the server to the client (ADR-0006). The browser mints
`crypto.randomUUID()` at create time so a note has a stable identity **offline** — that same id keys
`db.base`/`db.notes` (spec 15), the CVR (spec 16), `note_doc.note_id`, and the `y-indexeddb` doc name
(spec 20). The server accepts the client id via an **idempotent** create
(`INSERT … ON CONFLICT (id) DO NOTHING`), validates it is a well-formed UUID, and **rejects** a create
whose id already belongs to another user. This spec owns exactly two things: the **`createNote` arg shape**
(`createNoteArgsSchema` in `@yapper/schemas`) and the **server create semantics** (`createNoteRecord`).
The queue/pusher/`/api/sync/push` that consume them are **spec 19**. Everything stays behind
`NEXT_PUBLIC_SYNC_ENGINE`; the flag-off create path must keep working.

## Before Starting Work

1. Read `specs/18-client-minted-ids/design.md` (goal state + the create contract + TDD tests).
2. Read `decisions.md` and the governing ADR `docs/adr/0006-client-minted-note-ids-idempotent-create.md`.
3. Check `implementation.md` for current progress.
4. Look at existing patterns in:
   - `apps/api/src/notes/router.ts` (`POST /` create handler, `authed()` wrapper, `requireOwnedNote`)
   - `apps/api/src/notes/router.test.ts` (supertest + `x-test-user-id` fake resolver — copy the harness)
   - `packages/db/src/schema.ts:116` (`note` table — `id` is `uuid().primaryKey().defaultRandom()`)
   - `packages/schemas/src/note.ts` (`createNoteResponseSchema`, `noteAccessSchema`; add args schema here)
   - `apps/web/lib/queries/notes.ts` (`useCreateNote`) + `apps/web/app/dashboard/page.tsx` (`createAndOpen`)

## Code Patterns

- **One create schema, imported everywhere.** Add `createNoteArgsSchema = z.object({ id: z.string().uuid() })`
  + `CreateNoteArgs` to `packages/schemas/src/note.ts`; barrel-export it. Web mints the id, spec 19's
  `mutationSchema` uses it as the `createNote` `args`, the server validates against it. Never redefine.
- **Idempotent create in one reusable helper.** Put `createNoteRecord(userId, id)` in
  `apps/api/src/notes/create.ts`: `db.insert(note).values({ id, ownerId }).onConflictDoNothing({ target: note.id }).returning(...)`;
  on an empty return, `select` the owner — same owner → `exists` (idempotent), different owner → `conflict`
  (permanent). Return a **discriminated union** (`created | exists | conflict`), not a cast. Both the legacy
  `POST /api/notes` and spec 19's push mutator call this one function.
- **Additive, back-compatible route change.** Make `id` **optional** on `POST /api/notes`. Absent → keep
  today's server-generated path unchanged. Present-but-malformed → **422** (never coerce). Present-valid →
  `createNoteRecord`; `created`/`exists` → 201 + row, `conflict` → 409. Keep returning the row
  (`createNoteResponseSchema`) for the flag-off client.
- **Owner-on-conflict = permanent reject.** A cross-user id collision returns 409 (legacy) /
  `rejected { reason: "id_conflict" }` (push, → ADR-0009). Never overwrite, never report success.
- **Server-authoritative.** Set `owner_id = session user`; never trust client-supplied ownership or
  timestamps beyond the id (ADR-0006).
- **TDD:** write the failing api tests first (idempotent-by-id, malformed→422, cross-user→409, flag-off
  back-compat) + the schema parse test. Done only when green (`bun test` in `apps/api`), `tsc --noEmit`
  clean (`apps/api` + `packages/schemas`), Biome clean. **Run api tests from `apps/api`** (Bun loads `.env`
  from cwd; the repo root fails with "DATABASE_URL is not set"); tests hit real Neon Postgres.

## Don't

- Don't build the mutation queue, pusher, `seq` ordering, `/api/sync/push`, `mutationSchema`, or the
  `createNote` **client mutator** — that's **spec 19**. Provide the arg shape + `createNoteRecord`; stop there.
- Don't touch Dexie (spec 15), the CVR (spec 16), or the content lane / `y-indexeddb` / `note_doc` (spec 20).
- Don't make `id` required or drop the response id echo — that swap belongs to spec 19's flag flip. Keep the
  flag-off path working.
- Don't coerce or server-generate a substitute for a supplied-but-invalid id — 422 it.
- Don't overwrite an existing row on conflict, and don't silently swallow a cross-user id collision.
- Don't change the `note` table / add a migration — `id` stays `uuid().primaryKey().defaultRandom()`; only
  its source moves.
- Don't put a second copy of the create args or the create SQL in any app — one schema, one helper.
- Don't use `as any` or skip tests.
