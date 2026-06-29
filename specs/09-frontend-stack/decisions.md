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
