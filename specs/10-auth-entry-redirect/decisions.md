# Auth Entry-Surface Redirect — Decisions

The primary architectural decision lives in
[ADR-0001](../../docs/adr/0001-client-side-auth-redirect-on-entry-surfaces.md)
(client-side redirect; web-origin middleware can't see the api-origin session cookie).

## ADR-002: Neutral loader during `isPending` on `/` (approach A2)

> **Superseded the initial A1 decision.** A1 (static marketing shell during pending) was shipped
> first, but in practice a returning logged-in visitor saw the full dark marketing page render for
> the ~100–300ms session round-trip and then hard-cut to the light dashboard — a jarring jump.
> The web origin can't know the user is logged in before that round-trip (the session cookie is on
> the api origin), so during pending we must pick one view. We switched to A2.

### Context

`useSession()` is pending on every load, including first-time logged-out marketing visitors.
During that window the web origin cannot tell logged-in from logged-out.

### Options Considered

1. A1 — static marketing shell now, gate only CTAs/redirect. Best logged-out first-paint, but
   logged-in visitors see the marketing page flash before redirecting (the observed jump).
2. **A2 — neutral loader while pending; marketing renders only once resolved logged-out.** Smooth
   for logged-in visitors (loader → dashboard, no marketing flash). Cost: first-time logged-out
   visitors wait a beat on the loader before the marketing page.
3. Optimistic hint cookie/localStorage. Best of both, but a second source of truth that can go
   stale after logout elsewhere, plus SSR nuance. Rejected as over-engineered for this slice.

### Decision

A2. `if (isPending) return <Loader/>; if (session) return null; // redirecting` — the marketing
page (with its CTAs) renders only in the resolved-logged-out branch.

### Consequences

- Returning logged-in visitors never see the marketing page — loader → `/dashboard`. Jump fixed.
- First-time logged-out visitors see a brief neutral loader before the marketing page.
- SSR renders the loader too, so the first paint is the loader for everyone until the client
  resolves the session; no hydration mismatch.

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
