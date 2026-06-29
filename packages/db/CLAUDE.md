# packages/db

`@yapper/db` is the single source of truth for Yapper's relational data. It defines the Drizzle ORM schema (Better Auth tables + note/sharing tables), a shared PostgreSQL connection pool, and the typed Drizzle `db` client. Apps and packages import from here instead of opening their own connections or redefining tables. The database is **PostgreSQL on Neon** (Drizzle, **not** Prisma); the connection string is read from `DATABASE_URL`, loaded from this package's `.env` during local scripts/tests.

## Tech Stack

- **Drizzle ORM** `^0.44.2` — schema definition + typed query builder (`drizzle-orm/pg-core`, `drizzle-orm/node-postgres`).
- **drizzle-kit** `^0.31.4` — migration generate/migrate/push + studio (dev dependency).
- **pg** `^8.13.1` (`@types/pg`) — node-postgres driver; a `Pool` backs the client.
- **PostgreSQL on Neon** — runtime DB. `DATABASE_URL` is required by `client.ts`; `drizzle.config.ts` falls back to a localhost default for codegen only.
- **TypeScript** `5.9.2` (strict, via `@yapper/typescript-config`), Bun test runner.

## File Structure

- `src/schema.ts` — all table/enum/type definitions (the only file `drizzle.config.ts` reads for codegen).
- `src/client.ts` — creates the `pg` `Pool` and the Drizzle `db` client; exports `Database` type. Throws if `DATABASE_URL` is unset.
- `src/index.ts` — package entry; re-exports the client (`db`, `pool`, `Database`), all named schema exports, and a namespaced `schema` object.
- `src/schema.test.ts` — Bun tests for the schema.
- `drizzle.config.ts` — drizzle-kit config (dialect `postgresql`, schema `./src/schema.ts`, output `./drizzle`).
- `drizzle/` — generated SQL migrations (`0000_absurd_the_twelve.sql`, `0001_mixed_starfox.sql`) + `meta/` snapshots and `_journal.json`. Generated; do not edit by hand.
- `package.json` / `tsconfig.json` — package manifest and TS config.

## Exports

Import paths: `.` → `@yapper/db`, `./schema` → `@yapper/db/schema`, `./client` → `@yapper/db/client`. Everything below is also re-exported from the root `@yapper/db`.

**Client (`@yapper/db` / `@yapper/db/client`)**
- `db` — typed Drizzle client (`db.query.<table>` + query builder, schema-aware).
- `pool` — shared `pg` connection `Pool`; call `pool.end()` to drain in scripts/tests.
- `Database` — type alias `typeof db`.
- `schema` — namespaced object (`schema.note`, `schema.user`, …) from the root entry.

**Tables (`@yapper/db/schema`)**
- `user`, `session`, `account`, `verification`, `jwks` — Better Auth tables (uuid `id` with `gen_random_uuid()` DB default; Better Auth set to not generate ids).
- `note` — note metadata owned by `api` (owner, title, preview, `access`, nullable unique `shareToken`). Never holds the CRDT blob.
- `noteDoc` — 1:1 CRDT state blob (`bytea` → `Buffer`), written by `socket`; split from `note` so list queries stay light.
- `noteCollaborator` — non-owner membership on a note (`status`, unique on `(noteId, userId)`); no role column by design.

**Enums (`@yapper/db/schema`)**
- `noteAccess` — `pgEnum` `note_access`: `private | view | edit`.
- `collabStatus` — `pgEnum` `collab_status`: `active | revoked`.

**Inferred row types (`@yapper/db/schema`)**
- `Note` / `NewNote`, `NoteDoc` / `NewNoteDoc`, `NoteCollaborator` / `NewNoteCollaborator`, `User` / `NewUser`, `Session` — `$inferSelect` / `$inferInsert` types for select/insert rows.

## Commands

Run from this package directory (`packages/db`) so `.env` (`DATABASE_URL`, Neon) is loaded:

- `bun run db:generate` — `drizzle-kit generate`: emit a new SQL migration into `drizzle/` from `src/schema.ts` changes.
- `bun run db:migrate` — `drizzle-kit migrate`: apply pending migrations to the database.
- `bun run db:push` — `drizzle-kit push`: push schema directly to the DB (dev convenience, no migration file).
- `bun run db:studio` — `drizzle-kit studio`: open Drizzle Studio.
- `bun test` — run schema tests.
- `bun run check-types` — `tsc --noEmit` type check.

Note: `db:generate` works without a live DB (config falls back to a localhost URL), but `migrate`/`push`/`studio` and `client.ts` require a real `DATABASE_URL`.

## When to Use

Import from `@yapper/db` whenever an app or package needs to read/write Postgres or reference schema types — `api` for note/collaborator/auth queries, `socket` for persisting `noteDoc` state, and any package needing inferred row types. Use the shared `db`/`pool`; do not create a second connection or redeclare tables.

```ts
import { db, note, type Note } from "@yapper/db";

const rows: Note[] = await db.select().from(note);
```
