# 09 · Frontend Stack Adoption — Implementation

## Status: 09a done — 09b done (web response schemas → 09c)

Four dependency-ordered slices; each is its own `feat/` branch + PR and must be merged in order
(09a → 09b → 09c → 09d). Write the goal-state test first per slice (repo TDD rule).

## Completed
- [x] Design + decisions captured (`design.md`, `decisions.md`).
- [x] CLAUDE.md docs updated to reflect the target stack (root, `apps/web`, `apps/api`,
      `apps/socket`, new `packages/schemas/CLAUDE.md`).
- [x] **09a · Foundation** (`feat/frontend-stack-foundation`):
  - [x] Scaffolded `packages/schemas` (`@yapper/schemas`, dep `zod@^4.4.3` to match the workspace
        version; `tsconfig` extends `node.json`; `src/common.ts` `permissionSchema` + `Permission`;
        `src/index.ts` barrel). TDD: `src/common.test.ts` (RED → GREEN, 2 tests pass).
  - [x] `web` deps added: `@tanstack/react-query@5.101.2`, `zustand@5.0.14`, `motion@12.42.0`,
        `clsx@2.1.1`, `tailwind-merge@3.6.0`.
  - [x] shadcn foundation: `components.json` (new-york, Tailwind v4, cssVariables, `@/` aliases) +
        `lib/utils.ts` (`cn`). Per-component deps (cva, lucide, tw-animate-css) deferred to
        `shadcn add` in 09d. **Did not** touch `globals.css`/preflight (stays OFF until 09d).
  - [x] `lib/query-client.ts` (`getQueryClient`, server-per-request / browser-singleton) +
        `app/providers.tsx` (`"use client"` `QueryClientProvider`) mounted in `app/layout.tsx`.
  - [x] Added `@/*` path alias to `apps/web/tsconfig.json` (shadcn imports).
  - [x] Verified: `turbo check-types` green (8/8 workspaces), `web` production build green (6/6
        routes), existing web tests pass (5/5), Biome clean. No visual change.

- [x] **09b · Contracts + backend validation** (`feat/schemas-zod-validation`, stacked on 09a):
  - [x] `@yapper/schemas`: `share.ts` (`shareNoteBodySchema`/`ShareNoteBody`), `socket.ts`
        (`socketHandshakeSchema`, `awarenessUserSchema`, `socketIdentityMessageSchema`,
        `socketKickMessageSchema`, `socketServerMessageSchema` + types), barrel updated. TDD
        RED→GREEN; 10 tests across 3 files, check-types clean.
  - [x] `api`: `POST /:id/share` now parses `req.body` with `shareNoteBodySchema` → 400 on failure
        (replaces the manual `level` check). `sharing.test.ts` 8/8 (incl. invalid-level → 400).
  - [x] `socket`: `authorizeConnection` parses the handshake with `socketHandshakeSchema` and rejects
        empty token/documentName before JWT verify. `index.ts`/`revoke.ts` type their outgoing
        stateless payloads as `SocketServerMessage`. `auth.test.ts` 10/10 (2 new handshake cases,
        RED→GREEN).
  - [x] Added `@yapper/schemas` dep to `apps/api` + `apps/socket`. Repo `check-types` 8/8, Biome clean.
  - [~] **Known flake (not 09b):** socket `realtime.test.ts` fails on Neon connectivity (pg-pool
        connect errors / its 5s DB-derive poll). Independent of these changes — the test uses a
        non-empty `"stub"` token + `noteId`, and the 09b edits are handshake validation + type-only
        payloads. 23/24 socket tests passed in the full run.
  - Per ADR-006: note/share **response** schemas are intentionally deferred to 09c (authored with the
    web Query hooks that consume them).

## In Progress
- (none)

## Blocked
- (none)

## Next Steps

### 09c · web data layer + state  `feat/web-query-zustand`
1. [ ] Extract `getAuthToken()` → `lib/auth-token.ts`; update `Editor.tsx`.
2. [ ] Build `lib/queries/` hooks (notes/share) parsing with `@yapper/schemas`; wire invalidation.
3. [ ] Delete `lib/api.ts`.
4. [ ] Add `lib/stores/` (`useEditorStore`, `useUiStore`); move state out of Editor/ShareDialog.
5. [ ] Tests (RED→GREEN): a query hook (mocked fetch → parsed) + a store transition.

### 09d · web UI migration to shadcn  `feat/web-shadcn-ui`
1. [ ] Tailwind preflight ON globally; remove `.lp-root` reset.
2. [ ] Migrate `/login` → `/dashboard` → `/notes/[id]` → `ShareDialog` to Tailwind + shadcn.
3. [ ] Add Motion to the share dialog + one list/page transition (reduced-motion guarded).
4. [ ] Verify: existing page tests green; `biome check` clean; manual visual pass.

## Session Notes

### 2026-06-29
- Spec created. Decisions locked via grilling session (see `decisions.md` ADR-001..005).
- CLAUDE.md docs updated across root + 3 apps + new `packages/schemas`.
- **09a implemented** on `feat/frontend-stack-foundation` (TDD for the schemas package; web tooling
  verified via check-types/build/test). No deps left installed-but-unused except the intended
  foundation set. Not committed yet — awaiting review.
- Next: 09b — author the real `@yapper/schemas` contracts by mirroring current `api`/`socket` shapes,
  then enforce Zod validation at those boundaries (test-first).
- **09a committed** as `8705c57` on `feat/frontend-stack-foundation`; `feat/schemas-zod-validation`
  branched off it for 09b.
- **09b implemented** (TDD). See the 09b checklist above for verification. ADR-006 records the scope
  call (enforce only consumed contracts; defer response schemas to 09c). Not committed yet — awaiting
  review. Heads-up: `realtime.test.ts` is currently red due to Neon connectivity in this environment,
  not the 09b changes.
- Next: 09c — extract `getAuthToken()` to `lib/auth-token.ts`, build `lib/queries/` hooks (authoring
  the note/share response schemas in `@yapper/schemas` as their consumer), add Zustand stores, delete
  `lib/api.ts`.
