# AGENTS.md — Auth Entry-Surface Redirect

## Project Context

Redirect logged-in users away from the entry surfaces (`/` and `/login`) to `/dashboard`,
client-side. Companion to [ADR-0001](../../docs/adr/0001-client-side-auth-redirect-on-entry-surfaces.md).

## Before Starting Work

1. Read `specs/10-auth-entry-redirect/design.md`.
2. Check `specs/10-auth-entry-redirect/implementation.md` for current progress.
3. Look at existing patterns in `apps/web/app/dashboard/page.tsx` (the reference client-side gate),
   `apps/web/app/_landing/LandingPage.tsx`, and `apps/web/app/login/page.tsx`.

## Code Patterns

- Gate on `useSession()` from `apps/web/lib/auth-client.ts`.
- `useEffect(() => { if (!isPending && session) router.replace(dest); }, [...])`.
- Use `router.replace`, never `push`, on entry surfaces.
- Honor `?returnTo=` on `/login` only for same-origin paths (`returnTo?.startsWith("/")`).
- Tests mock `../../lib/auth-client` (`useSession`, `signIn`) and `next/navigation`
  (`useRouter`, `useSearchParams`) — see `LandingPage.test.tsx` for the mock style.

## Don't

- Don't add features not in design.md.
- Don't skip tests.
- Don't touch `/notes/[id]` or `/share/[token]`.
- Don't introduce server-side middleware (see ADR-0001).
