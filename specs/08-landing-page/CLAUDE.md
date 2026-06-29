# CLAUDE.md — 08 · Landing Page

## Project Context
The logged-out marketing landing page at `/`, translated from the imported Claude Design file
`Yapper Landing Page.dc.html`. Dark theme, `oklch` palette. Pure `apps/web` UI — no backend changes.
OAuth CTAs reuse the slice-02 Better Auth `signIn.social` flow.

## Before Starting Work
1. Read `design.md`.
2. Look at `apps/web/app/login/page.tsx` for the `signIn.social` pattern and
   `apps/web/app/dashboard/page.tsx` for the inline-style convention.
3. Check `implementation.md`.

## Code Patterns
- `app/page.tsx` is a thin server component (metadata) rendering the `"use client"` `LandingPage`.
- **Tailwind v4** for styling (ADR-003). Theme tokens (`--color-ink`, `--color-brand`,
  `--color-cream`, …), `@keyframes`, and `--animate-*` live in `app/globals.css`. Use semantic theme
  utilities for repeated colors and arbitrary values (`text-[clamp(...)]`, `bg-[oklch(...)]`) for
  one-offs. Decorative gradient overlays + the scroll-reveal classes are plain CSS in `globals.css`.
- Tailwind is imported **without preflight** (ADR-004) so it doesn't reset the other pages; the
  landing page has a `.lp-root`-scoped reset.
- CTA buttons call `signIn.social({ provider, callbackURL: `${window.location.origin}/dashboard` })`.
- Scroll animation uses `IntersectionObserver`, guarded by
  `matchMedia('(prefers-reduced-motion: reduce)')`; always-on animations use `motion-reduce:animate-none`.
- Tests: Vitest + Testing Library + jsdom; mock `lib/auth-client`. The test asserts behavior, so it
  is styling-agnostic.

## Don't
- Don't change `api`/`socket` or auth logic — this slice is web-only.
- Don't call gated/authenticated APIs from this page (it's logged-out-facing).
- Don't rewrite the marketing copy — keep it verbatim from the imported design.
- Don't leak `landing.css` into other routes — keep classes prefixed and import only in `LandingPage`.
