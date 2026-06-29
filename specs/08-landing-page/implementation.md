# 08 · Landing Page Implementation

## Status: done

## Completed
- [x] Vitest + Testing Library + jsdom harness for `@yapper/web` (`vitest.config.ts`,
      `vitest.setup.ts`, `test` script wired into Turbo's `test` pipeline).
- [x] Goal-state test `app/_landing/LandingPage.test.tsx` (5 cases: hero headline, both OAuth
      CTAs ×2 sections, all section landmarks + footer, Google CTA → `signIn.social` with
      `/dashboard` callback, GitHub CTA → `signIn.social`).
- [x] `app/_landing/LandingPage.tsx` — full design translated to JSX with `signIn.social` CTAs and a
      reduced-motion-guarded `IntersectionObserver` scroll reveal.
- [x] `app/page.tsx` replaced with the metadata-setting server wrapper rendering `<LandingPage />`.
- [x] **Refactored to Tailwind v4** (ADR-003/004): added `tailwindcss` + `@tailwindcss/postcss`,
      `postcss.config.mjs`, `app/globals.css` (theme tokens + keyframes + decorative/reveal classes,
      imported in `app/layout.tsx` **without preflight**); converted `LandingPage.tsx` to utility
      classes and removed `app/_landing/landing.css`. Enabled `css.parser.tailwindDirectives` in
      `biome.json`. Footer Privacy/Terms now point at `/privacy` and `/terms`.

## In Progress

## Blocked

## Next Steps
- (Optional) Add real `/privacy` and `/terms` routes — footer links are placeholders.

## Session Notes

### 2026-06-28
- Imported `Yapper Landing Page.dc.html` from the Claude Design project via the `claude_design` MCP.
- Wrote `design.md`, `CLAUDE.md`, `decisions.md`; added slice 08 row to `ROADMAP.md`.
- Built the harness + TDD goal-state test (RED → GREEN), then the landing page.
- Verified: `bun run test` 5/5 green; `bun run check-types` clean; `biome check .` exit 0;
  `next build` prerenders `/` (static, 8.58 kB); built server returns HTTP 200 with the correct
  `<title>`.
- Visual screenshot via Chrome was blocked (extension lacks `localhost:3000` host permission) —
  manual visual parity check left to the user at `http://localhost:3000/`.
- Refactored styling to Tailwind v4 (per request). Re-verified: `test` 5/5 green (behavior test
  unchanged), `check-types` clean, `biome check` exit 0, `next build` exit 0. Built CSS is 24 KB with
  all theme tokens/utilities/keyframes/decorative classes; runtime server returns 200 for the landing
  CSS and for `/`, `/login`, `/dashboard` (no preflight regression on the other pages).
