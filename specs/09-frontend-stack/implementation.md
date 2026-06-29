# 09 · Frontend Stack Adoption — Implementation

## Status: 09a–09d done (frontend stack migration complete; branch kept local, not pushed)

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

- [x] **09c · web data layer + state** (`feat/web-query-zustand`, stacked on 09b):
  - [x] Authored note/share **response** schemas in `@yapper/schemas` (`note.ts`:
        `noteSummary`/`sharedNoteSummary`/`noteMetadata`/`createNoteResponse`; `share.ts`:
        `shareInfo`/`shareSummary`/`joinResponse`; `common.ts`: `noteAccess`, `authTokenResponse`).
        Note: create-response is its **own** schema (api returns id/title/access/updatedAt only).
  - [x] `lib/http.ts` (`apiFetch` + `ApiError`) and `lib/auth-token.ts` (`getAuthToken`, kept for the
        socket provider); `Editor.tsx` imports the latter.
  - [x] `lib/queries/notes.ts` (useNotes/useSharedNotes/useNote + create/delete/share/makePrivate
        mutations with key-based invalidation) and `lib/queries/share.ts` (useJoinNote). All parse
        responses with `@yapper/schemas`. **Deleted `lib/api.ts`.**
  - [x] `lib/stores/editor.ts` (`useEditorStore`: status/identity/permission/privateKicked) +
        `lib/stores/ui.ts` (`useUiStore`: share dialog). Rewired Editor (store + schema-parsed
        stateless messages), dashboard, note page, ShareDialog, share page to hooks/stores.
  - [x] Added `@yapper/schemas` dep to `apps/web`; Vitest alias for the workspace `.ts` package.
  - [x] Tests (RED→GREEN): `lib/stores/editor.test.ts` (3) + `lib/queries/notes.test.tsx` (2,
        mocked fetch → parsed result + schema-failure → query error). Web suite 10/10; repo
        check-types 8/8; schemas 17/17.

- [x] **09d · web UI migration to shadcn (brand-harmonized)** (`feat/web-shadcn-ui`, stacked on 09c):
  - [x] Theme infra: preflight ON, brand `card`→`surface` / `muted`→`subtle` rename (landing updated),
        shadcn light/dark semantic vars mapped to brand tokens, `@theme inline`, base layer,
        `@custom-variant dark`; `.lp-root` reset removed.
  - [x] `shadcn add` button/card/input/select/popover/badge/skeleton (+ radix-ui/cva/lucide-react);
        `ThemeToggle` (next-themes), `ThemeProvider` in `providers.tsx`, `suppressHydrationWarning`.
  - [x] Migrated `/login` (Card + Buttons), `/dashboard` (Cards/Skeleton/Badge/empty states +
        ThemeToggle + Motion staggered list), `/notes/[id]` (header + ThemeToggle, destructive
        Delete), `Editor` (status/presence Tailwind, editor paper frame, `.note-prose`), `ShareDialog`
        (shadcn Popover + Select + Input/Button).
  - [x] Verified: web `check-types` clean, web tests 10/10, production build green (6/6 routes),
        Biome clean. **Manual visual pass still pending** (couldn't run against a live backend here).

## In Progress
- (none)

## Blocked
- (none)

## Next Steps
- [ ] **Manual visual pass / QA** of all four pages in light + dark against a running api/socket
      (the one verification not possible in this environment), then merge the branch.

#### 09d archive — original checklist

### 09d · web UI migration to shadcn (brand-harmonized)  `feat/web-shadcn-ui`
Direction: ADR-007 (brand theme), ADR-008 (restyle + light polish), ADR-009 (share Popover),
ADR-010 (light Motion, no toasts), ADR-011 (dark mode via next-themes). See `design.md` §09d.
**Keep the whole branch local — do not push until 09d is visually complete (user request).**
1. [ ] Theme infra: preflight ON in `globals.css`, remove `.lp-root` reset, add shadcn CSS vars
       (`:root` light + `.dark` dark) mapped to brand `@theme` tokens + `@theme inline` + base layer +
       `@custom-variant dark`. Verify landing survives.
2. [ ] `shadcn add` button/card/input/select/popover/badge/skeleton (pulls cva/lucide/tw-animate-css).
3. [ ] Dark mode: add `next-themes`, wrap `ThemeProvider` in `app/providers.tsx`
       (`attribute="class"`, `defaultTheme="system"`, `enableSystem`), `suppressHydrationWarning` on
       `<html>`, build a `ThemeToggle` (sun/moon).
4. [ ] Migrate `/login` → `/dashboard` (cards/skeleton/empty states + ThemeToggle) → `/notes/[id]`
       (header + ThemeToggle, badges, editor paper frame + prose styles) → `ShareDialog`
       (Popover + Select + Input/Button).
5. [ ] Motion: share Popover fade/scale + dashboard list staggered fade-in (reduced-motion guarded).
6. [ ] Verify per page: existing tests green, `check-types` + `build` + `biome check` clean; manual
       visual pass (follow-up).

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
