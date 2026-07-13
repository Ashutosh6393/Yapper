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

## In Progress

## Blocked

## Next Steps

1. **24b — service worker + manifest** (`public/sw.js`, `public/manifest.webmanifest`, `providers.tsx`,
   `layout.tsx`)
   - [ ] `sw.js`: cache-first `/_next/static/**`; network-first navigations with a pathname-keyed
         fallback, else the cached `/dashboard`; everything else passthrough.
   - [ ] Register in `providers.tsx` on `NODE_ENV === "production"` only.
   - [ ] `manifest.webmanifest` + `manifest` in layout metadata.
   - verify: `bun run build && bun run start`, visit `/dashboard` once, DevTools → Application →
     Offline, reload → shell boots, notes render from Dexie, note bodies from `y-indexeddb`.
3. **24c — offline indicator** (`lib/use-online.ts`, `components/dashboard/offline-badge.tsx`,
   `dashboard/page.tsx`)
   - [ ] Test first: badge renders when `navigator.onLine` is false, hides on the `online` event.
   - [ ] Hook + badge + mount in the dashboard header.
   - verify: unit test green; toggling DevTools offline shows/hides the badge live.
4. **End-to-end goal state** (design.md acceptance 1–5)
   - [ ] Offline: reload stays signed in; create + edit a note; reload again — the changes are still
         there. Reconnect → queue pushes, pull runs, server converges. No page reload needed.

## Session Notes
