# 00 · Project Setup — Decisions

## ADR-001: Biome replaces Prettier
### Context
Root `package.json` shipped with Prettier; project standard (root `AGENTS.md`/`CLAUDE.md`) is Biome.
### Options Considered
1. Keep Prettier for format + add ESLint — two tools, more config, slower.
2. Biome for both format + lint — single fast tool, one config.
### Decision
Biome, single root `biome.json`. Remove `prettier` devDep and `format` script.
### Consequences
- Turbo `check` task runs `biome check`. Contributors drop Prettier editor integration for Biome.

## ADR-002: Keep Express on Bun (don't switch api to Bun.serve)
### Context
`api` runs on Bun but the stack decision is Express.
### Options Considered
1. `Bun.serve` native router — fastest on Bun, but diverges from the agreed stack and Better Auth/
   middleware examples assume Express.
2. Express on Bun's Node-compat http — standard, matches stack, Better Auth mounts cleanly later.
### Decision
Express on Bun. Validate it boots in this slice so any incompatibility surfaces before auth.
### Consequences
- Slightly less raw throughput than `Bun.serve`; acceptable. Auth slice mounts Better Auth on Express.

## ADR-003: Dev ports — web 3000 / api 4000 / socket 1234
### Context
Three long-running dev servers must not collide; the web↔api CORS + socket URL config depend on stable ports.
### Decision
`web`=3000, `api`=4000, `socket`=1234 (Hocuspocus default). Encoded in `.env.example`.
### Consequences
- Later slices hardcode these defaults in `.env.example` (CORS origin, `NEXT_PUBLIC_*` URLs).
