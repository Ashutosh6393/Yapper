# 1. Client-side auth redirect on entry surfaces

Date: 2026-07-03

## Status

Accepted

## Context

Logged-in users who return to an **entry surface** — the marketing landing page (`/`) or the sign-in page (`/login`) — should not see marketing or a sign-in form they no longer need. They should be sent straight to `/dashboard`.

The instinctive way to implement an auth-based redirect in Next.js is **middleware** (edge, runs before the page renders, no content flash). That option is effectively unavailable here:

- Yapper's session cookie is set by the **`api` app** and lives on the **`api` origin** (e.g. `localhost:4000`), not the Next.js **web origin** (e.g. `localhost:3000`). This is the existing cross-origin auth model — `useSession()` and every data call use `credentials: "include"` to send that cookie to `api`.
- Because the cookie is not on the web origin, Next.js middleware running on the web origin **cannot see whether the user is logged in**. It would have to make its own server-to-server authenticated call to `api` (forwarding cookies) on every request to `/`, duplicating auth logic and adding latency to the highest-traffic route.

The codebase is already committed to a **client-first, no-server-data-layer** convention: every interactive page is a client component that gates on `useSession()` (e.g. `/dashboard` redirects logged-out users to `/login`).

## Decision

Redirect **client-side**, mirroring the existing `/dashboard` gating pattern. Applies to both entry surfaces:

- **`/`** — logged-in → `router.replace("/dashboard")`.
- **`/login`** — logged-in → `router.replace(returnTo ?? "/dashboard")`, honoring an existing same-origin `?returnTo=` first so the share-link flow still resumes.

To avoid penalizing logged-out marketing visitors with a blank flash while `useSession()` resolves, the landing page renders its **static above-the-fold shell immediately** and only gates the **session-dependent bits** (OAuth CTAs and the redirect itself) until the session resolves.

We use `router.replace` (not `push`) so entry surfaces do not linger in browser history.

## Consequences

- **No new infrastructure.** No `middleware.ts`, no server-to-server auth call, consistent with the client-first convention.
- **A brief render window exists** on entry surfaces before `useSession()` resolves. Mitigated on `/` by rendering the static shell first; logged-in users may see the shell for a beat before the redirect fires.
- **Redirects are not enforced server-side.** These redirects are UX conveniences, not security boundaries — actual authorization is enforced by `api`/`socket`. A logged-in user hitting `/` is never an authorization concern.
- **No redirect loop:** `/dashboard` sends logged-*out* → `/login`; `/` and `/login` send logged-*in* → `/dashboard`. The conditions are mutually exclusive.
- If the auth model ever moves the session cookie onto the web origin (same-origin auth), middleware-based gating becomes viable and this decision should be revisited.
