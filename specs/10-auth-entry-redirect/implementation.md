# Auth Entry-Surface Redirect — Implementation

## Status: complete

## Completed

- [x] All six goal-state tests (3 in `LandingPage.test.tsx`, 3 in `login/page.test.tsx`).
- [x] `/` (LandingPage): `useSession()` gate → `router.replace("/dashboard")` when logged in;
      CTAs render only when `!isPending && !session` (A1 static shell).
- [x] `/login`: `useSession()` gate → `router.replace(destination)` when logged in, honoring a
      same-origin `returnTo` over the `/dashboard` default; shows a loading shell while pending.
- [x] Vitest config: added `@/*` → app-root alias (needed to import shadcn/ui from the login test).

## Blocked

## Next Steps

- None. Goal state reached; full web suite (16 tests) + `check-types` + Biome all green.

## Session Notes

### 2026-07-03

- Created spec + ADR-0001. Branch `feat/auth-entry-redirect`.
- Goal state = the six tests in design.md.
- TDD: red → green per surface (`/` first, then `/login`). No `/notes` or `/share` changes.
- Files touched: `app/_landing/LandingPage.tsx`, `app/login/page.tsx`, their tests,
  `vitest.config.ts`.
