# 24 · Offline — Implementation

## Status: not-started

Branch: `feat/offline`

## Completed

## In Progress

## Blocked

## Next Steps

1. **24a — session: offline ≠ signed-out** (`lib/session.ts`)
   - [ ] Test first: offline session fetch (`error` set, `data` null) keeps the persisted session and
         does **not** clear the mirror; a confirmed sign-out (`data` null, no `error`) still clears it.
   - [ ] Fix: `else if (!live.isPending && !live.error)`.
   - verify: `bunx vitest run --maxWorkers=1 lib/session.test.ts` green; DevTools offline → reload
     `/dashboard` → still signed in, no `/login` bounce.
2. **24b — service worker + manifest** (`public/sw.js`, `public/manifest.webmanifest`, `providers.tsx`,
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
