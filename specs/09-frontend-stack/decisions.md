# 09 · Frontend Stack Adoption — Decisions

## ADR-001: Full migration to Tailwind + shadcn/ui (preflight ON)

### Context
`web` currently runs Tailwind with **preflight OFF** (a reset scoped to `.lp-root`) so the landing
page can use Tailwind without resetting the other pages, which style themselves with inline `style`
objects. shadcn/ui requires preflight ON and utility-class styling throughout. The two approaches
can't both be the convention.

### Options Considered
1. **Migrate everything to Tailwind + shadcn** — one consistent system; touches working pages, risks
   visual regressions; preflight flip is global.
2. **New work in shadcn, leave old pages** — lower risk, but two styling systems coexist indefinitely.
3. **Incremental page-by-page migration** — adopt shadcn now, convert pages over time.

### Decision
**Option 1** — full migration. Preflight goes ON globally and `/login`, `/dashboard`, `/notes`, and
`ShareDialog` are rewritten to Tailwind + shadcn. To contain the global preflight flip, all four
inline-styled pages migrate together in the **last** slice (09d).

### Consequences
- The `.lp-root`-scoped reset is removed once preflight is global.
- 09d is the riskiest slice; behavior-based page tests guard against regressions, plus a manual
  visual pass.
- End state: a single styling system, no inline `style` objects.

---

## ADR-002: Zod schemas live in a shared `@yapper/schemas` package

### Context
Zod validation is wanted in `api` (request bodies), `socket` (handshake/messages), and `web` (forms +
response parsing). The same shapes cross between client and server, so where the schemas live
determines whether client and server can drift.

### Options Considered
1. **New shared package `@yapper/schemas`** — single source of truth; one more package to maintain.
2. **Per-app schemas** — simplest start; client/server contracts drift, types duplicated.
3. **Shared contracts + local-only forms** — cross-boundary shapes shared, web-only form fields local.

### Decision
**Option 1** — one `@yapper/schemas` package owns every cross-boundary shape; all three apps import
it. (Purely-local web form fields with no server counterpart may still be validated with an in-app
schema, but anything serialized to api/socket comes from `@yapper/schemas`.)

### Consequences
- New package + `CLAUDE.md`; wired into `bun`/`turbo`/tsconfig references.
- Must stay dependency-light (no DB/React/Node-only imports) so browser + server both import it.
- Contract changes happen in one place; `z.infer` types replace hand-written request/response types.

---

## ADR-003: TanStack Query replaces `lib/api.ts` (Query-native hooks)

### Context
`lib/api.ts` is a typed fetch wrapper (`notesApi`/`shareApi`, throws `ApiError`). TanStack Query adds
caching/refetch/loading but still needs a fetch underneath. Query could wrap the existing layer or
replace it.

### Options Considered
1. **Query wraps `lib/api.ts`** — minimal rewrite; keeps two layers.
2. **Replace `api.ts` with Query-native hooks** — fold fetch into hooks, retire `notesApi`/`shareApi`;
   fewer layers, bigger rewrite.

### Decision
**Option 2** — replace. Fetch logic lives directly in `lib/queries/` hooks (parsing responses with
`@yapper/schemas`); `notesApi`/`shareApi` are removed.

### Consequences
- `getAuthToken()` (used by the socket provider, not just REST) is extracted to `lib/auth-token.ts`
  so it survives the `api.ts` deletion.
- All server reads/writes go through query/mutation hooks; mutations invalidate query keys.

---

## ADR-004: Zustand owns editor/collab UI state + UI toggles only

### Context
With Query owning server state, Zustand needs a concrete, non-server responsibility to avoid being a
speculative empty store.

### Options Considered
1. **Editor/collab UI state** — connection status, presence, permission, "made private" banner
   (currently local to `Editor.tsx`).
2. **Share dialog / UI toggles** — dialog/modal/toast open state spanning components.
3. **Defer Zustand** until a concrete cross-component need appears.

### Decision
**Options 1 + 2** — an editor/collab store and a UI-toggle store. Purely-local state stays
`useState`; a store is introduced only when state must cross components.

### Consequences
- Editor sub-components read shared collab state from the store instead of prop-drilling.
- Clear rule documented: server data → Query, cross-component UI state → Zustand, local → `useState`.

---

## ADR-007: 09d app theme harmonizes with the landing brand (light)

### Context
`globals.css` already defines a brand `@theme` (brand brown, cream, paper/card light surfaces, SF
Pro) built for the landing page. shadcn ships a neutral-gray default. The app pages need a direction.

### Options Considered
1. **Harmonize with the landing brand (light)** — map shadcn tokens to the existing brand palette;
   light paper surfaces, brand-brown primary, cream accent. Cohesive; reuses tokens; readable editor.
2. **shadcn default neutral** — fast/conventional, but visually disconnected from the landing.
3. **Dark app (match landing's dark marketing theme)** — striking but poor for long-form writing.

### Decision
**Option 1.** Map shadcn's semantic CSS variables onto the brand `@theme` tokens. **Support light +
dark via a user toggle** (see ADR-011): light = paper/card surfaces; dark = the brand ink/panel
surfaces. The marketing landing page stays always-dark (it uses the explicit brand tokens directly,
not the semantic light/dark vars, so the toggle does not affect it).

### Consequences
- Two var blocks in `globals.css`: `:root` (light) and `.dark` (dark), both → brand tokens; one
  `@theme inline` mapping + shadcn base layer.
- The landing must be re-verified under preflight ON (it already uses these tokens — low risk).

---

## ADR-008: 09d scope is "restyle + light polish", not a UX redesign

### Context
Migrating to shadcn could be a 1:1 restyle, a restyle with modest polish, or a fuller UX redesign.

### Decision
**Restyle + light polish**: brand-themed shadcn components plus modest layout/spacing/hierarchy
improvements (dashboard cards, cleaner editor header, real empty states). Routes, flows, and page
structure stay the same. A fuller UX redesign (sidebar nav, richer toolbar) is explicitly out of
scope — a future slice if wanted.

### Consequences
- Existing behavior tests remain valid parity guards.
- Bounded, reviewable diffs per page.

---

## ADR-009: ShareDialog becomes a shadcn Popover (not a modal Dialog)

### Context
The share control is currently an absolute-positioned panel anchored under the Share button.
shadcn offers `Popover` (anchored, non-blocking) or `Dialog` (centered modal, blocking).

### Decision
**Popover**, anchored to the Share button — preserves today's contextual, non-blocking feel with the
least behavior change. Keeps the `useUiStore` open state; adds Motion fade/scale on open.

### Consequences
- `useUiStore.shareDialogOpen` continues to drive open/close (now via Popover `open`/`onOpenChange`).
- Despite the "dialog" name, the component is a popover — the store/name are kept for continuity.

---

## ADR-011: Dark mode via `next-themes` (class strategy) with a toggle

### Context
ADR-007 maps shadcn vars to brand tokens for both light and dark. We need a way to switch themes
without a flash-of-wrong-theme on load, in a Next.js App Router app whose pages are client components.

### Options Considered
1. **`next-themes`** — idiomatic for Next.js; `attribute="class"` toggles `.dark` on `<html>`, injects
   a pre-paint script (no FOUC), persists choice, supports `system`. Small, well-worn dependency.
2. **Hand-rolled Zustand + localStorage** — reuses our store, but we must solve SSR FOUC ourselves
   (inline script) and re-implement system-preference handling. More code, easy to get subtly wrong.

### Decision
**Option 1 — `next-themes`.** Wrap the app in `ThemeProvider` (inside `app/providers.tsx`, alongside
the Query provider) with `attribute="class"`, `defaultTheme="system"`, `enableSystem`. Add a small
`ThemeToggle` (lucide sun/moon, `useTheme`) in the dashboard + note-page headers.

### Consequences
- Adds `next-themes`; `globals.css` needs the `.dark` variant (`@custom-variant dark`) + dark var block.
- `suppressHydrationWarning` on `<html>` in the root layout (next-themes mutates the class pre-paint).
- The landing page is unaffected (explicit tokens, not semantic vars) and remains dark.

---

## ADR-010: Light Motion only; no toast system

### Context
Motion is opt-in (ADR-005). The UI store mentioned toasts, but the app currently surfaces errors
inline with no toast UI.

### Decision
Add Motion to just the share popover (fade/scale) and a subtle staggered dashboard list fade-in, both
`prefers-reduced-motion`-gated. **No toast/Sonner** in 09d — error states stay inline (YAGNI).

### Consequences
- Minimal animation surface; reviewers can reject gratuitous motion.
- If toasts are wanted later, they get their own slice + `useUiStore` extension.

---

## ADR-006: 09b scope — enforce only contracts with a real consumer; defer response schemas

### Context
Slice 09b authors `@yapper/schemas` and enforces validation. The temptation is to author every
request/response/message shape up front. But TDD/simplicity says don't write schemas for shapes that
have no consumer yet — they drift and can't be verified.

### Decision
09b authors and **enforces** only the shapes with a real producer/consumer today:
- `shareNoteBodySchema` — parsed by the api `POST /:id/share` route (replaces the manual `level` check).
- `socketHandshakeSchema` — parsed at the top of `authorizeConnection` (rejects empty token/
  documentName before JWT verification). This is the socket's inbound trust boundary; Yjs/awareness
  traffic is handled by the Hocuspocus protocol, not custom JSON, so there are no other client→server
  messages to validate.
- `socketServerMessageSchema` (identity + kick union) — the socket now **types** its outgoing
  stateless payloads with this (compile-time guarantee); the web client adopts it for parsing in 09c.

Note **response** schemas (note metadata, list rows, share/join responses) are deferred to **09c**,
authored next to the TanStack Query hooks that consume them — mirroring the live api selects at the
point of use rather than speculatively.

### Consequences
- 09b stays tightly scoped and every schema is exercised by a test or a typed call site.
- 09c authors response schemas + web parsing together (no orphan contracts).
- Param validation (`:id`, `:token`) is left as the existing presence checks — always-string path
  params with no meaningful shape to add.

---

## ADR-005: Motion (`motion/react`), opt-in

### Context
Animation is wanted "if needed." The library has two names: legacy `framer-motion` and current
`motion`.

### Decision
Use the **`motion`** package (`import { motion } from "motion/react"`), applied **opt-in** where an
interaction benefits (dialogs, list/page transitions, landing reveals) — not mandated everywhere.
Animations respect `prefers-reduced-motion`.

### Consequences
- One animation dependency; `motion/*` is the forward-looking import path.
- No blanket animation requirement; reviewers can push back on gratuitous motion.
