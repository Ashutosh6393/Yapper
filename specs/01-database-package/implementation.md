# 01 · Database Package — Implementation

## Status: done

## Completed
- `packages/db/package.json` (`@yapper/db`): deps `drizzle-orm`, `pg`; dev `drizzle-kit`,
  `@types/pg`, `@types/bun`. Scripts: `db:generate`, `db:migrate`, `db:push`, `db:studio`,
  `test`, `check-types`. `exports` map for `.`, `./schema`, `./client`.
- `packages/db/tsconfig.json` extends `@yapper/typescript-config/node.json`, adds `types: ["bun"]`.
- `src/schema.ts`: enums `note_access`, `collab_status`; tables `note`, `note_doc`,
  `note_collaborator`; custom `bytea` type for the Yjs blob; indexes + unique constraints per design.
  Inferred row/insert types exported.
- `src/client.ts`: `pg.Pool` + `drizzle(...)` from `DATABASE_URL` (throws if unset). Exports `db`, `pool`, `Database`.
- `src/index.ts`: re-exports `db`/`pool`/`Database`, all tables/enums/types, and namespaced `schema`.
- `drizzle.config.ts`: `postgresql` dialect, `schema=./src/schema.ts`, `out=./drizzle`,
  url from `DATABASE_URL` (falls back to compose default for the dev-only generate step).
- `drizzle/0000_absurd_the_twelve.sql` generated and committed (2 enums, 3 tables, 2 FKs, 2 indexes,
  share_token + (note_id,user_id) unique). `gen_random_uuid()` default confirmed (PG16 built-in).
- `src/schema.test.ts`: insert note → assert defaults → select by id → cleanup; `pool.end()` in `afterAll`.
- Wired `@yapper/db` as a `workspace:*` dependency of `apps/api` and `apps/socket`; verified both
  type-check with `import { db, schema } from "@yapper/db"` (temporary probe files, since removed).

## Verification done
- `bunx drizzle-kit generate` → emits the migration SQL. ✅
- `bun run check-types` (turbo, all 5 packages) → green. ✅
- `bunx biome check packages/db` → clean. ✅
- `bunx drizzle-kit migrate` → applied to the Neon Postgres (`migrations applied successfully!`). ✅
- `bun test` (`packages/db`) → insert/select round-trip passes (1 pass, 0 fail). ✅

All five design acceptance items met.

## Session Notes
- Driver: chose `node-postgres` (`pg`) over Bun SQL per design's maturity recommendation.
- `bytea` has no native Drizzle helper → defined via `customType` (`Buffer` both sides).
- FK from `owner_id`/`user_id` to `user.id` intentionally deferred to slice 02 (ADR-003).
- DB is a connected **Neon** serverless Postgres (not local Compose). `DATABASE_URL` lives in
  `packages/db/.env` (gitignored). The smoke test uses a 30s timeout to absorb Neon cold-starts.
- Harmless deprecation warning from `pg-connection-string`: `sslmode=require` is currently treated
  as `verify-full`. Fine for Neon (valid certs); revisit if pg v9 changes the default.
