# Auth Entry-Surface Redirect — Decisions

The primary architectural decision lives in
[ADR-0001](../../docs/adr/0001-client-side-auth-redirect-on-entry-surfaces.md)
(client-side redirect; web-origin middleware can't see the api-origin session cookie).

## ADR-002: Render the static shell during `isPending` on `/` (approach A1)

### Context

`useSession()` is pending on every load, including first-time logged-out marketing visitors.
Gating the whole landing render behind session resolution would penalize those visitors with a
blank flash and turn a near-instant page into a client-gated one.

### Options Considered

1. **A1 — static shell now, gate only session-dependent bits.** Hero/marketing content paints
   immediately; OAuth CTAs + the redirect wait for session resolution. Best first-paint, slightly
   more conditional rendering.
2. A2 — blank/spinner while pending. Simplest, but penalizes every logged-out visitor.
3. Optimistic hint cookie/localStorage. Faster guess, but a second source of truth that can go
   stale after logout elsewhere. Over-engineered for this slice.

### Decision

A1. Render the shell always; render the OAuth CTAs only when `!isPending && !session`; fire the
redirect only when `!isPending && session`.

### Consequences

- Logged-out visitors see the hero instantly; CTAs appear a beat later when session resolves.
- Logged-in visitors may see the shell briefly before the redirect fires (accepted).
- Minor CTA layout-in on resolve; acceptable for this slice.

## ADR-003: `returnTo` precedence on `/login`

### Context

`/login` already reads `?returnTo=` (same-origin only) for the post-OAuth `callbackURL`. An
already-logged-in user hitting a share link resolves to `/login?returnTo=/share/:token`.

### Decision

When redirecting an already-logged-in user off `/login`, honor a valid same-origin `returnTo`
first, falling back to `/dashboard`. This reuses the existing `destination` guard
(`returnTo?.startsWith("/") ? returnTo : "/dashboard"`).

### Consequences

- The share-link resume flow keeps working for users who are already logged in.
- Open-redirect guard unchanged (only paths starting with `/` are honored).
