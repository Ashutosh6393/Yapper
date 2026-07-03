# Auth Entry-Surface Redirect — Design

Redirect logged-in users off the **entry surfaces** (`/` and `/login`) to `/dashboard`,
client-side. See [ADR-0001](../../docs/adr/0001-client-side-auth-redirect-on-entry-surfaces.md)
for the "why client-side" rationale (cross-origin session cookie → web-origin middleware is blind).

## Behavior

### `/` (landing page)

- **Logged in** → `router.replace("/dashboard")`. Marketing OAuth CTAs are not shown.
- **Logged out** (session resolved) → full marketing page renders, including OAuth CTAs. No redirect.
- **Session pending** → the static marketing shell renders immediately (no blank flash), but the
  OAuth CTAs and the redirect are suppressed until the session resolves (approach **A1**).

### `/login`

- **Logged in, no `returnTo`** → `router.replace("/dashboard")`.
- **Logged in, `?returnTo=/share/abc`** → `router.replace("/share/abc")` (same-origin `returnTo`
  wins over the `/dashboard` default; open-redirect guard keeps only paths starting with `/`).
- **Logged out** → sign-in buttons render, no redirect.

## Non-goals / out of scope

- `/notes/[id]` and `/share/[token]` are **not** touched — they are legitimate destinations for a
  logged-in user, not entry surfaces.
- No server-side enforcement. These redirects are UX conveniences; `api`/`socket` remain the
  authorization boundary.

## Approach

- Client-side only, mirroring the existing `/dashboard` gate
  (`useEffect(() => { if (!isPending && !session) router.replace("/login") })`).
- `useSession()` from `lib/auth-client.ts` drives the decision.
- `router.replace` (not `push`) so entry surfaces don't linger in history.

## Goal-state tests (six)

1. Logged-in on `/` → `replace("/dashboard")`, no CTAs.
2. Logged-out on `/` → marketing shell + CTAs render, no redirect.
3. Pending on `/` → shell shows, no redirect fired.
4. Logged-in on `/login` (no `returnTo`) → `replace("/dashboard")`.
5. Logged-in on `/login?returnTo=/share/abc` → `replace("/share/abc")`.
6. Logged-out on `/login` → buttons render, no redirect.
