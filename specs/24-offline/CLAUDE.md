# CLAUDE.md — 24 · Offline

## Project Context

Make Yapper work with no network. The offline **data layer already exists** (specs 14–21, ADR-0002):
durable Dexie store + mutation queue, client-minted ids, `y-indexeddb` content, online-aware backoff.
This spec only closes the three gaps that keep it from being reachable: a session bug that logs you out
when offline (24a), a missing service worker so the shell can't load offline (24b), and no offline
indicator (24c).

## Before Starting Work

1. Read `specs/24-offline/design.md` — especially "The three gaps, root-caused".
2. Check `implementation.md` for current progress.
3. Read `apps/web/CLAUDE.md`, then the code the spec touches: `lib/session.ts`, `lib/sync/backoff.ts`
   (the `online`/`offline` handling that already works), `app/dashboard/page.tsx`, `app/providers.tsx`.

## Code Patterns

- **Test-first** (repo rule). Each slice has a goal-state test before the implementation:
  24a → `lib/session.test.ts`; 24c → the badge's render test. 24b (the SW) is verified in the browser —
  DevTools → Application → offline, reload — not with a unit test; jsdom has no service workers.
- Tests live next to source as `*.test.ts(x)`, jsdom + Testing Library, mocking `lib/auth-client`.
  Run from `apps/web` with `bunx vitest run --maxWorkers=1` (the full suite OOMs on a parallel run).
- Reuse `navigator.onLine` + the `online`/`offline` events — `lib/sync/backoff.ts:58,72` already does
  exactly this. Don't invent a second connectivity abstraction; `useOnline()` is a thin hook over the
  same two events.
- Strict TS, no `as any`. Biome from the repo root.

## Don't

- **Don't cache API responses in the service worker.** Dexie is the local source of truth; a cached
  `/api/**` response would be a second, staler authority. The SW touches static assets and the
  `/dashboard` document, nothing else.
- **Don't add `next-pwa` / `serwist`** or any other dependency. `apps/web/public/sw.js` is hand-written
  and ~35 lines; see design.md for why.
- Don't register the SW in dev (it fights HMR) — production only.
- Don't try to make login/OAuth or `/share/:token` joins work offline; they are explicitly out of scope.
- Don't touch `apps/api`, `apps/socket`, or any package. This spec is `apps/web` only.
- Don't add features not in design.md.
