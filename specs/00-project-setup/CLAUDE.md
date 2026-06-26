# CLAUDE.md — 00 · Project Setup

## Project Context
Bootstrap the Turborepo monorepo so all three apps boot and the local infra (Postgres + Redis)
runs via Docker Compose. Infra + skeletons only — **no** feature logic.

## Before Starting Work
1. Read `specs/00-project-setup/design.md` (goal state + task list).
2. Check `specs/00-project-setup/implementation.md` for progress.
3. Confirm root `package.json`, `turbo.json` current state before editing.

## Code Patterns
- Each app/package has its own `package.json` named `@yapper/<name>` and its own `tsconfig.json`
  that `extends` `@yapper/typescript-config/*`.
- Dev scripts per app must be Turbo-friendly: long-running = `dev` (persistent, `cache:false`).
- Keep skeleton source minimal: `api` = one `/health` route; `socket` = `Server.configure().listen()`;
  `web` = one placeholder page. No DB/auth imports yet.
- Env: never hardcode connection strings; read from `process.env`, ship `.env.example`.

## Don't
- Don't add Drizzle, Better Auth, Yjs, or any feature deps — those belong to later slices.
- Don't keep Prettier — Biome replaces it (remove the devDep and `format` script).
- Don't commit `.env` (only `.env.example`).
- Don't add abstractions/config "for later"; minimum that boots and passes checks.
