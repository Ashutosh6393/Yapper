# 00 · Project Setup — Design

## Goal State (acceptance)
A contributor can clone the repo and, with Bun + Docker installed:
1. `cp` the example envs, `docker compose up -d` → Postgres + Redis healthy.
2. `bun install` → all workspaces resolve.
3. `bun run dev` (Turbo) → `web` (Next.js), `api` (Express), `socket` (Hocuspocus) all boot.
4. `curl localhost:4000/health` → `200 {"status":"ok"}` (api); `web` renders a placeholder page; `socket` accepts a WS upgrade on its port.
5. `bun run check-types` and `bun run check` (Biome) both pass with zero errors.

This slice ships **infrastructure and skeletons only** — no auth, DB schema, notes, or realtime logic. Skeletons must compile and run, nothing more.

## Scope
**In:**
- Root tooling: Turbo pipeline, Bun workspaces, Biome (replacing Prettier), shared `tsconfig`.
- `packages/typescript-config` — shared tsconfig bases (`base.json`, `nextjs.json`, `node.json`).
- `apps/web` — minimal Next.js (App Router) app that renders a placeholder.
- `apps/api` — minimal Bun + Express server exposing `GET /health`.
- `apps/socket` — minimal Hocuspocus server that listens (no hooks yet).
- `docker-compose.yml` — Postgres 16 + Redis 7 with healthchecks + named volumes.
- `.env.example` at root and per app; `.gitignore` covers `.env`.

**Out:** Drizzle/schema (01), Better Auth (02), any feature code, deployment manifests.

## Tech / decisions applied
- Package manager: **Bun** (workspaces already in root `package.json`).
- Monorepo: **Turborepo** (`turbo.json` exists; extend tasks).
- Lint/format: **Biome** — remove `prettier` devDep + `format` script; add root `biome.json`.
- Ports (dev): `web` 3000, `api` 4000, `socket` 1234 (Hocuspocus default).
- Workspace naming: `@yapper/web`, `@yapper/api`, `@yapper/socket`, `@yapper/typescript-config`.

## Deliverables
```
biome.json                 # root, format+lint, replaces prettier
docker-compose.yml         # postgres + redis
.env.example               # shared defaults (DATABASE_URL, REDIS_URL, ports)
turbo.json                 # add: check-types, check (biome); dev for all apps
package.json               # remove prettier; add biome; scripts: dev/build/check/check-types
packages/typescript-config # base.json, nextjs.json, node.json, package.json
apps/web                   # next.js skeleton (app/page.tsx, layout, next.config, tsconfig, package.json)
apps/api                   # express skeleton (src/index.ts -> /health, tsconfig, package.json, .env.example)
apps/socket                # hocuspocus skeleton (src/index.ts -> Server listen, tsconfig, package.json, .env.example)
```

## Implementation tasks
1. Add `packages/typescript-config` bases → verify other packages can `extends` it.
2. Add root `biome.json`; remove Prettier from root `package.json`; update scripts → `bun run check` runs Biome.
3. Update `turbo.json` tasks (`dev`, `build`, `check`, `check-types`) → `bun run check-types` fans out.
4. Scaffold `apps/api` (Express + `/health`) → `curl :4000/health` → 200.
5. Scaffold `apps/socket` (Hocuspocus listen) → logs "listening" on :1234; WS upgrade accepted.
6. Scaffold `apps/web` (Next.js placeholder) → `:3000` renders.
7. Add `docker-compose.yml` (PG + Redis healthchecks) → `docker compose up -d` both healthy.
8. Add `.env.example` files + `.gitignore` entries → no `.env` tracked by git.

## Test plan
- **Manual smoke:** the 5 acceptance steps above.
- **Quality gate:** `bun run check-types && bun run check` clean.
- No unit tests this slice (no logic yet); a `/health` supertest lands in 03.

## Risks / notes
- Bun + Express interop: Express runs on Bun via Node http compat; surface issues now. Fallback `Bun.serve` only if Express won't boot — but stack decision is Express.
- Hocuspocus on Bun: confirm `@hocuspocus/server` boots under Bun (core reason to scaffold it early).
- Next.js dev under Turbo `persistent` task: ensure `cache:false` on `dev`.
