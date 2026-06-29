# 08 · Landing Page Decisions

> **Note:** ADR-001 is **superseded by ADR-003** — the page now styles with Tailwind v4, not inline
> styles. ADR-001 is kept for history.

## ADR-001: Inline styles for layout, a global-imported CSS file for interactive states (SUPERSEDED)

### Context
The imported `Yapper Landing Page.dc.html` is built almost entirely from inline `style` attributes,
plus design-compiler-only `style-hover`/`style-active` attributes, `@keyframes`, and an
`IntersectionObserver` scroll reveal. React inline styles can't express `:hover`/`:active` or
`@keyframes`. The existing `apps/web` pages use inline style objects and the app has no global CSS
or Tailwind set up (despite Tailwind being mentioned in the root guide).

### Options Considered
1. **All inline + JS hover state** — replicate hover with `onMouseEnter/Leave` state. Pros: no CSS
   file. Cons: verbose, re-renders, can't do keyframes, poor parity with the design.
2. **Tailwind** — add Tailwind to `apps/web`. Pros: idiomatic. Cons: not currently set up; large
   infra change outside this slice's scope; design is `oklch`/inline-driven, not utility-driven.
3. **Inline layout + one landing-scoped CSS file** — keep the design's inline layout values, move
   `:hover`/`:active`, `@keyframes`, and `.reveal` into `landing.css`. Pros: matches existing
   convention, minimal new infra, exact parity. Cons: two style mechanisms in one component.

### Decision
Option 3. Inline style objects carry the layout (mirroring the source and the existing pages);
`landing.css` (imported only by `LandingPage`, class-prefixed) carries interactive states, keyframes,
and reveal transitions.

### Consequences
- One small CSS file enters `apps/web`; it's global but scoped by prefixed class names and only
  imported in the landing component.
- If the app later adopts Tailwind, this page can be migrated independently.

## ADR-002: Add a Vitest + Testing Library + jsdom harness to @yapper/web

### Context
The project CLAUDE.md mandates a goal-state test before implementing a spec, but `@yapper/web` had
no `test` script and no testing dependencies, so `turbo run test --filter=@yapper/web` was a no-op.

### Options Considered
1. **Skip the test** — treat the visual design as the only acceptance bar. Cons: violates the TDD
   "always do" rule; no regression guard.
2. **Add the harness** — Vitest + `@testing-library/react` + `jsdom`, a `vitest.config.ts`, and a
   `test` script, then write the goal-state test. Cons: new devDeps + config. Pros: satisfies TDD,
   gives `@yapper/web` a reusable test setup for future slices.

### Decision
Option 2, per the user's explicit choice. The first web test doubles as the harness bootstrap.

### Consequences
- `@yapper/web` gains a `test` script picked up by Turbo's `test` pipeline.
- Future web slices have a ready React test setup.

## ADR-003: Style the landing page with Tailwind v4 (supersedes ADR-001)

### Context
After the first implementation (inline styles + a scoped CSS file, ADR-001), the styling approach was
changed to Tailwind on request. `@yapper/web` had no Tailwind set up.

### Options Considered
1. **Keep inline styles** (ADR-001) — already working, but not the requested approach.
2. **Tailwind v4** — utility classes + a theme; idiomatic, the documented project styling tool.

### Decision
Tailwind v4. `app/globals.css` imports Tailwind and defines an `@theme` with the design's surface/brand
palette (`--color-ink`, `--color-brand`, `--color-cream`, …), the `@keyframes`, and `--animate-*`
tokens. The component uses utility classes (semantic theme tokens for repeated colors; arbitrary values
like `text-[clamp(...)]` / `bg-[oklch(...)]` for one-offs). The TDD goal-state test asserts behavior
(roles/text/click), so it carried across the restyle unchanged and stayed green.

### Consequences
- New devDeps: `tailwindcss` + `@tailwindcss/postcss`; `postcss.config.mjs` added.
- A few decorative gradient overlays and the JS-toggled scroll-reveal stay as plain CSS classes in
  `globals.css` (too unwieldy as Tailwind arbitrary values); runtime-dynamic colors/sizes on the small
  mockup helpers stay as inline styles.
- `biome.json` enables `css.parser.tailwindDirectives` so Biome can parse `@theme`/`@import`.
- Footer Privacy/Terms now point at `/privacy` and `/terms` (valid hrefs; routes still TODO).

## ADR-004: Import Tailwind without global preflight

### Context
`/login`, `/dashboard`, and `/notes` style raw `<h1>`/`<button>` elements via inline styles and rely on
browser-default element rendering. Tailwind's preflight is a global reset; importing the full
`tailwindcss` in the root layout would reset those elements and visually regress those pages.

### Options Considered
1. **Full `@import "tailwindcss"`** — simplest, but applies preflight globally → regresses other pages.
2. **Utilities + theme layers only, no preflight** — `@import "tailwindcss/theme.css"` +
   `tailwindcss/utilities.css`; add a small reset scoped to `.lp-root` for the landing page.

### Decision
Option 2. Preflight is intentionally off; the landing page gets a `.lp-root`-scoped `box-sizing` +
heading/paragraph margin reset. Verified `/login` and `/dashboard` still render (HTTP 200, unchanged).

### Consequences
- Other routes are untouched by the new global stylesheet.
- If the app later adopts Tailwind app-wide, enable preflight and restyle those pages deliberately.
