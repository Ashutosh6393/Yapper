# 09 · Frontend Stack Adoption — Design

## Goal State (acceptance)

The `web` app is migrated to a consistent modern stack, and cross-boundary data is validated with
Zod everywhere. Concretely, when this spec is **done**:

1. **shadcn/ui + Tailwind** is the component/styling system for `web`. Tailwind preflight is **ON
   globally**; `/login`, `/dashboard`, `/notes/[id]` and `ShareDialog` are rendered with Tailwind
   utilities + shadcn components (no inline `style` objects, no `.lp-root`-scoped reset).
2. **TanStack Query** owns all server state. `lib/api.ts` (`notesApi`/`shareApi`) is gone; every
   backend call goes through a `useQuery`/`useMutation` hook in `lib/queries/`. `getAuthToken()`
   survives in `lib/auth-token.ts` (the socket provider needs it).
3. **Zustand** owns cross-component client/UI state: an editor/collab store (connection status,
   presence, permission, "made private" banner) and a UI store (dialog/toast toggles).
4. **Motion** (`motion/react`) is available and used for at least the share dialog and one
   list/page transition, guarded by `prefers-reduced-motion`.
5. **`@yapper/schemas`** exists and is the single source of truth for cross-boundary shapes. `api`
   parses request bodies/params against it (400 on failure), `socket` validates the handshake +
   client messages against it, and `web` parses API responses against it. No app redefines a
   contract shape that lives in `@yapper/schemas`.
6. All existing tests still pass; new behavior has goal-state tests (TDD per repo rules). `turbo
   check-types` and `biome check` are clean across the affected packages.

## Scope

**In:** `apps/web` (UI, data layer, state, animation), `apps/api` (request validation), `apps/socket`
(handshake/message validation), new `packages/schemas`. Root tooling needed to support the above
(Tailwind preflight config, shadcn init, Query provider in `layout.tsx`, new workspace package wired
into `turbo`/`bun` and tsconfig references).

**Out:** No backend feature changes (no new endpoints, no schema/DB migrations, no auth-flow changes).
No redesign of the landing page (already Tailwind). No change to the CRDT/Yjs protocol itself — only
Zod validation *around* the socket handshake/messages. No server-side rendering/data-fetching added.

## Slices (dependency-ordered — each is its own `feat/` branch + PR)

### 09a · Foundation (infra, no behavior change)
Stand up the tooling so later slices have something to build on.
- Create `packages/schemas` skeleton: `package.json` (`@yapper/schemas`, dep `zod`), `tsconfig.json`
  (extends `node.json`), `src/index.ts` (empty barrel + `common.ts` with the `permission` enum).
  Wire into root `bun`/`turbo` and consumers' `tsconfig` references.
- `web`: add `@tanstack/react-query`, `zustand`, `motion`, and shadcn/ui deps; run shadcn `init`
  (creates `components.json`, `lib/utils.ts`, `components/ui/`); mount `QueryClientProvider` in
  `app/layout.tsx` via `lib/query-client.ts`.
- **Do not** flip preflight or migrate pages yet (keep `web` visually identical).
- Verify: `bun run build` + `check-types` green in `web`; new package type-checks.

### 09b · Contracts + backend validation
Populate `@yapper/schemas` and enforce it on the server side.
- Author `note.ts`, `share.ts`, `socket.ts`, `common.ts` schemas + inferred types from the existing
  `api` routes and `socket` handshake/messages (read current code; mirror exactly, don't invent
  fields).
- `api`: parse `req.body`/`req.params` per route; return `400 { issues }` on failure. Replace local
  body/param types with `z.infer` imports.
- `socket`: validate the handshake context + client→server messages in `onAuthenticate`/handlers;
  reject on failure. Reuse server→client message schemas for the identity/permission/kick payloads.
- Verify (TDD): tests for a rejected malformed body (api) and a rejected malformed handshake
  (socket); existing route/socket tests still pass.

### 09c · web data layer + state
Replace the fetch layer and introduce stores.
- Extract `getAuthToken()` into `lib/auth-token.ts`; update `Editor.tsx` import.
- Build `lib/queries/` hooks (`useNotes`, `useSharedNotes`, `useNote`, `useCreateNote`,
  `useShareNote`, `useMakePrivate`, `useDeleteNote`, share/join) that fetch + parse with
  `@yapper/schemas`; wire mutation→query invalidation. Delete `lib/api.ts`.
- Add `lib/stores/`: `useEditorStore` (connectionStatus, presence, permission, privateKicked) and
  `useUiStore` (dialog/toast toggles). Move that state out of `Editor.tsx`/`ShareDialog.tsx` local
  state.
- Verify (TDD): a query hook test (mocked fetch → parsed result) and a store test; pages still work.

### 09d · web UI migration to shadcn
Flip styling and migrate pages, smallest→largest, one per commit.
- Turn Tailwind **preflight ON** globally; remove the `.lp-root` reset.
- Migrate `/login` → `/dashboard` → `/notes/[id]` → `ShareDialog` to Tailwind utilities + shadcn
  components (Button, Dialog, Input, etc.). Add Motion to the share dialog + one list transition.
- Verify: each migrated page's existing test stays green (tests are behavior-based / styling
  agnostic); manual visual check; `biome check` clean.

## Test plan

- **TDD per slice** (repo rule): write the goal-state test first.
  - 09b: api route rejects malformed body with 400 (supertest); socket rejects malformed handshake.
  - 09c: a `lib/queries` hook returns parsed data from a mocked fetch; a Zustand store transition.
  - 09d: existing page tests (`LandingPage.test.tsx` style) continue to pass after migration.
- **Type safety**: `turbo run check-types` green across `web`, `api`, `socket`, `schemas`.
- **Manual**: `turbo dev`; exercise login → dashboard → open note → share → make-private and confirm
  no visual/behavioral regressions.

## Risks / notes

- **Preflight ON is a global visual change** — every currently-inline-styled page must be migrated in
  the same slice (09d) or it'll look broken. That's why 09d migrates all four together and is the
  last slice.
- **Contract drift while authoring schemas (09b):** schemas must mirror the *current* api/socket
  shapes exactly; deriving them by reading the live code (not guessing) is required, else validation
  rejects valid traffic.
- **`getAuthToken()` coupling:** it's used by the socket provider, so it must outlive `lib/api.ts`.
  Pulling it into `lib/auth-token.ts` in 09c before deleting `api.ts` avoids breaking the editor.
- **`@yapper/schemas` must stay dependency-light** (no DB/React/Node-only imports) so the browser
  bundle and the socket/api both import it cleanly.
