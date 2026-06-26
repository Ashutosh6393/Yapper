# 00 · Project Setup — Future Work

## Enhancements
- CI workflow running `bun install && bun run check && bun run check-types` on PRs.
- Pre-commit hook (lefthook) running Biome on staged files.
- `docker compose` profile for a one-shot `migrate` service once `@yapper/db` exists (slice 01).

## Technical Debt
- No automated smoke test for `/health` yet (added with supertest in slice 03).
- Skeleton apps have placeholder UIs only.

## Nice to Have
- Devcontainer / `.tool-versions` pinning Bun version.
- Shared Biome config as a package if rules grow.
