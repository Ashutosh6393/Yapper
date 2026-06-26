# 01 · Database Package — Future Work

## Enhancements
- Named document snapshots table for version history (pairs with slice 04 persistence).
- A `migrate` Compose service / `predev` hook to auto-apply migrations.

## Technical Debt
- FK constraints to `user` are added in slice 02, not here.
- No connection pooling tuning yet (defaults fine for local dev).

## Nice to Have
- Drizzle Studio script (`db:studio`) for inspecting data.
- Seed script for demo notes.
