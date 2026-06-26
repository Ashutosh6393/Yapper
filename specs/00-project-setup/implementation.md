# 00 · Project Setup — Implementation

## Status: done

## Completed
- [x] `packages/typescript-config` bases (`base.json`, `node.json`, `nextjs.json`) + package.json.
- [x] Root `biome.json` (format + lint); removed Prettier devDep + `format` script; root scripts now
      `check` (biome check) + `format` (biome format).
- [x] `turbo.json` tasks: `build`, `check-types`, `dev` (removed stale `lint`).
- [x] `apps/api` — Express on Bun, `GET /health`, CORS for web origin, `.env.example`.
- [x] `apps/socket` — Hocuspocus server boot, `.env.example`.
- [x] `apps/web` — Next.js 15 App Router placeholder (`layout.tsx`, `page.tsx`), `next.config.ts`, `.env.example`.
- [x] `docker-compose.yml` — Postgres 16 + Redis 7 with healthchecks + named volumes.
- [x] Root `.env.example`; `.gitignore` already covers `.env`.
- [x] `bun install` resolves all workspaces (Biome 2.5.1; deps in Bun `.bun` store).

## Verification results
- `bun run check-types` → **3/3 packages pass** (web, api, socket).
- `bun run check` (Biome) → **passes** (2 warnings = CSS specificity inside `architecture.html`, non-blocking).
- `apps/api` boots on Bun; `curl :4000/health` → **200 `{"status":"ok"}`**.
- `apps/socket` boots on Bun → **"Hocuspocus v2.15.3 running"** on :1234 (WS upgrade accepted).
- Dep resolution confirmed from each app dir (next@15.5, express@4.22, @hocuspocus/server@2.15.3).

## Not verified here (environment)
- `docker compose up -d` — Docker CLI not available in this shell; Compose file authored, not run.
  **Action for contributor:** run it and confirm both services healthy.
- Full `next dev` boot of `web` — type-check + dep resolution pass; full dev-server boot not run here.

## Blocked

## Next Steps
→ Proceed to slice 01 (database-package).

## Session Notes
### 2026-06-26
- Implemented all 8 tasks. Verified api + socket boot on Bun and both quality gates pass.
- Open follow-ups: validate Docker Compose + `next dev` in a Docker-enabled shell.
