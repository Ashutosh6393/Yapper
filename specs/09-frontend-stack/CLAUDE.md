# CLAUDE.md — 09 · Frontend Stack Adoption

## Project Context
Adopt a consistent modern frontend stack in `apps/web` and add Zod validation across the boundary:
**shadcn/ui + Tailwind** (preflight ON) for UI, **TanStack Query** for server state, **Zustand** for
client/UI state, **Motion** (`motion/react`) for opt-in animation, and a new **`@yapper/schemas`**
package (Zod) that `web`, `api`, and `socket` all import. Delivered as four dependency-ordered
slices (09a foundation → 09b contracts/backend validation → 09c web data+state → 09d UI migration).
See `design.md` for the goal state and per-slice scope.

## Before Starting Work
1. Read `design.md` (goal state + slice breakdown) and `decisions.md` (why each library/placement).
2. Check `implementation.md` for which slice is in progress and what's done.
3. Look at existing patterns before changing them:
   - `apps/web/lib/api.ts` (current fetch layer being replaced) + `app/notes/[id]/Editor.tsx`
     (uses `getAuthToken()` — must keep working).
   - `apps/web/app/_landing/LandingPage.tsx` + `app/globals.css` (the existing Tailwind setup).
   - `apps/api/src/notes/router.ts` & `src/share/router.ts` (request shapes to mirror in schemas).
   - `apps/socket/src/auth.ts` & `src/identity.ts` (handshake/message shapes to mirror).
4. Create a `feat/{slice}` branch per slice (repo rule) and write the goal-state test first (`/tdd`).

## Code Patterns
- **One slice = one branch = one PR.** Don't bleed 09d UI work into 09b. Keep diffs reviewable.
- **Schemas are authoritative.** A request/response/message shape is defined once in
  `@yapper/schemas`; apps import `z.infer` types, never redefine. Mirror the *current* api/socket
  shapes exactly — read the live code, don't invent fields.
- **Query owns server state; Zustand owns UI state.** Never store fetched data in Zustand, never put
  dialog toggles in Query. Local-only state stays `useState`.
- **`getAuthToken()` must survive** the `lib/api.ts` deletion (socket provider depends on it) — move
  it to `lib/auth-token.ts` first (09c).
- **Preflight flips ON only in 09d**, and all four inline-styled pages migrate together in that slice
  so nothing renders broken in between.
- **Motion is opt-in** and respects `prefers-reduced-motion` (follow the landing page's pattern).

## Don't
- Don't add features not in `design.md` (no new endpoints, no DB/schema migrations, no auth changes).
- Don't flip Tailwind preflight before 09d, or migrate pages piecemeal across slices.
- Don't put server data in Zustand or UI toggles in TanStack Query.
- Don't duplicate a contract shape that belongs in `@yapper/schemas`.
- Don't use `as any` (repo rule); derive types from Zod schemas instead.
- Don't skip the goal-state test for a slice.
