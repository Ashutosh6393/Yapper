# 08 · Landing Page — Design

## Goal State (acceptance)
1. Visiting `/` (logged-out) renders the Yapper marketing landing page — not the old skeleton placeholder.
2. The page contains all sections from the imported design `Yapper Landing Page.dc.html`:
   nav, hero (headline + animated doc mockup), features grid, live-presence spotlight,
   comparison ("Typical tools" vs "Yapper"), make-private spotlight, final CTA, footer.
3. The hero and CTA each expose **Continue with Google** and **Continue with GitHub** actions that
   trigger the existing Better Auth OAuth flow (`signIn.social`), landing the user on `/dashboard`.
4. Nav links (`Features`, `Why Yapper`) smooth-scroll to their sections.
5. Scroll-reveal and cursor/float animations run, but are disabled under
   `prefers-reduced-motion: reduce`.
6. A goal-state test renders the page and asserts: hero headline present, both OAuth CTAs present
   (×2 sections), section landmarks present, and clicking a CTA invokes `signIn.social` with the
   right provider + `/dashboard` callback.

## Scope
**In:** `apps/web` route `/` replaced with the landing page; a client component carrying the markup,
auth handlers, and scroll animation; landing-scoped CSS (keyframes, hover, reveal); a Vitest +
Testing Library + jsdom harness for `@yapper/web` plus the goal-state test.
**Out:** no backend/API/socket changes; no new auth logic (reuses slice-02 `signIn.social`);
no CMS/content management; copy is taken verbatim from the imported design.

## Design
- **Import source:** Claude Design project `69bba18f-…`, file `Yapper Landing Page.dc.html`
  (dark theme, `oklch` palette, SF system font stack). Imported via the `claude_design` MCP.
- **Structure:**
  - `app/page.tsx` — server component: sets page `metadata`, renders `<LandingPage />`.
  - `app/_landing/LandingPage.tsx` — `"use client"`: full markup, `signIn.social` CTA handlers,
    `IntersectionObserver` scroll-reveal (guarded by `prefers-reduced-motion`).
  - `app/_landing/landing.css` — global-imported CSS: `@keyframes` (caret-blink, cursor drift,
    float, ping, fade-up), `:hover`/`:active` button + card states, `.reveal` scroll classes.
- **Styling approach:** layout via inline style objects (mirrors the design's inline styles and the
  existing `apps/web` convention); interactive states (`:hover`, `:active`), keyframes, and reveal
  transitions live in `landing.css` because pseudo-selectors/keyframes can't be inline. See ADR-001.
- **Auth wiring:** CTA buttons call `signIn.social({ provider, callbackURL: ${origin}/dashboard })`,
  identical to `app/login/page.tsx`. No new endpoints.
- **Testing harness:** add `vitest`, `@testing-library/react`, `@testing-library/jest-dom`,
  `jsdom` as devDeps to `@yapper/web`; `vitest.config.ts` with `jsdom` env; `test` script so
  `turbo run test --filter=@yapper/web` runs it. Mock `lib/auth-client` in the test.

## Implementation tasks
1. Add the Vitest/Testing Library/jsdom harness to `@yapper/web` (config + `test` script).
2. Write the goal-state test (RED): hero headline, OAuth CTAs, sections, CTA → `signIn.social`.
3. Build `landing.css` (keyframes, hover, reveal) + `LandingPage.tsx` markup translated from the
   `.dc.html`, with `signIn.social` handlers and reduced-motion-guarded `IntersectionObserver`.
4. Replace `app/page.tsx` with the metadata-setting server wrapper rendering `<LandingPage />`.
5. Make the test green; `check-types` + `biome check` clean.

## Test plan
- Unit (Vitest + jsdom): render `<LandingPage />`; assert headline text, both provider CTAs in hero
  and final CTA, each section landmark, footer; fire a click on a Google CTA → `signIn.social`
  called with `provider: "google"` and a `/dashboard` callback URL.
- Manual: run `bun run dev`, open `/`, confirm visual parity with the design, anchor scrolling,
  hover states, and reduced-motion behavior; click a CTA → redirected into the OAuth flow.

## Risks / notes
- `oklch()` colors + `backdrop-filter` need a modern browser; acceptable for this app's targets.
- Keep copy verbatim from the design so the page matches the approved mockup.
- The landing page is logged-out-facing and unauthenticated; it must not call any gated API.
- No global CSS exists today — `landing.css` is imported only by `LandingPage` and class-prefixed
  to avoid leaking into `/dashboard`, `/login`, etc.
