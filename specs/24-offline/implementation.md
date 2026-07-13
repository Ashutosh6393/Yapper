# 24 · Offline — Implementation

## Status: in-progress

Branch: `feat/offline`

## Completed

- [x] **24a — session: offline ≠ signed-out** (`lib/session.ts`, `lib/session.test.ts`)
      Test first (`lib/session.test.ts`): the offline case (`data: null`, `isPending: false`, `error`
      set) failed red on the "keeps the persisted session" assertion while the sign-out and mirror cases
      passed — confirming the bug was exactly the missing `error` discriminator. Fix:
      `else if (!live.isPending && !live.error)` (+ `live.error` in the effect deps).
      Verified: 3/3 green; full `apps/web` suite 34 files / 152 tests green; `tsc --noEmit` clean (which
      also confirms `error` really is on Better Auth's `useSession` return type).
      Still to check in a browser once 24b lands: DevTools offline → reload `/dashboard` → no `/login`
      bounce. (Can't be observed today — with no service worker the offline reload never loads at all.)

- [x] **24b — service worker + precache + manifest** (`public/sw.js`, `public/manifest.webmanifest`,
      `public/icon.svg`, `scripts/precache-manifest.mjs`, `lib/precache.ts` + test, `app/providers.tsx`,
      `app/layout.tsx`, `package.json` build script, root `.gitignore`)

      **A design bug was caught in browser verification and fixed — see ADR-004.** The SW alone was not
      enough: with the server killed, `/dashboard?note=<id>` threw a client-side exception. The network
      log showed the document + 14 assets served 200 from cache and **7 code-split editor chunks
      failing** — never requested during the online visit, so cache-on-demand never stored them
      (`ChunkLoadError`). Cache-on-demand only holds what an online session happened to request, so
      offline coverage was luck-dependent. Fix: `scripts/precache-manifest.mjs` walks `.next/static`
      post-build → `public/precache.json` (gitignored); `warmPrecache()` pulls the missing assets into
      the SW cache on load. ADR-001's "no precache manifest" claim was wrong and is amended; its "no
      next-pwa/serwist dependency" claim survived.

      **Verified in a real browser against a killed server** (a true network failure, not the DevTools
      toggle):
      - Cache + SW wiped → **one** plain `/dashboard` visit, no note ever opened → 42/42 manifest assets
        cached, 0 missing.
      - Server killed → `/dashboard?note=<id>` boots with **no crash**: shell served by the SW,
        `serverReachable: false`, note list rendering from Dexie ("MY NOTES · 4 notes").
      - This also confirms **24a end-to-end**: the session survived with the API unreachable — no
        `/login` bounce. Goal-state items 1 and 2 met.
      - Suite: 155 tests green; `tsc --noEmit` clean; `bun run build` clean (42 assets → precache.json).

## In Progress

## Blocked

## Next Steps

1. **24c — offline indicator** (`lib/use-online.ts`, `components/dashboard/offline-badge.tsx`,
   `dashboard/page.tsx`)
   - [ ] Test first: badge renders when `navigator.onLine` is false, hides on the `online` event.
   - [ ] Hook + badge + mount in the dashboard header.
   - verify: unit test green; toggling DevTools offline shows/hides the badge live.
4. **End-to-end goal state** (design.md acceptance 1–5)
   - [ ] Offline: reload stays signed in; create + edit a note; reload again — the changes are still
         there. Reconnect → queue pushes, pull runs, server converges. No page reload needed.

## Session Notes
