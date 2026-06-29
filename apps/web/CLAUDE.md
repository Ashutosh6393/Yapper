# apps/web

The Next.js frontend for Yapper, the collaborative real-time note app. It is the only app users see in the browser: a logged-out marketing landing page, OAuth login, a dashboard listing owned and shared notes, the capability-link join flow, and the note editor itself. The editor connects over WebSocket to the `socket` app (Hocuspocus/Yjs) for real-time CRDT collaboration with live cursors and presence, and talks to the `api` app for auth, note metadata, and sharing. This app holds no business data of its own — it is a thin, mostly client-rendered shell over those two services.

## Tech Stack

- **Next.js `^15.5`** (App Router) + **React `^19`** / React DOM `^19`. Pages are client components (`"use client"`); there is no server-side data layer here.
- **TypeScript `5.9.2`** (strict, via `@yapper/typescript-config/nextjs.json`).
- **TipTap `^3`** (`@tiptap/core`, `@tiptap/react`, `@tiptap/extension-collaboration-caret`) for the rich-text editor.
- **Yjs `^13.6`** + **`@hocuspocus/provider` `^2`** for CRDT sync and awareness (cursors/presence) over WebSocket.
- **`@yapper/editor`** (workspace package) — shared TipTap schema/extensions via `buildExtensions(ydoc)`.
- **Better Auth `^1.3` React client** (`better-auth/react`) for Google/GitHub OAuth and session.
- **Tailwind CSS `^4`** via `@tailwindcss/postcss` (PostCSS), with **shadcn/ui** (Radix + Tailwind) as the component layer.
- **TanStack Query** — owns all server state (note lists, metadata, mutations); the canonical data layer for talking to the `api` app.
- **Zustand** — owns cross-component client/UI state (editor/collab UI, dialog/toast toggles). Not for server data.
- **Motion** (`motion/react`) — opt-in animation (dialogs, transitions, landing reveals); not applied blanket.
- **Zod** via **`@yapper/schemas`** (workspace package) — validates form input and parses API responses; shared contract types come from here.
- **Biome** for lint/format (config at repo root `biome.json`: 2-space indent, double quotes, 100 line width).
- **Vitest `^2.1` + Testing Library** (`@testing-library/react`, `user-event`, `jest-dom`) in a `jsdom` environment for unit tests.

> **Migration status (`specs/09-frontend-stack`).** Done: 09a foundation, 09b Zod contracts/validation, **09c data layer** — TanStack Query hooks (`lib/queries/`) replaced `lib/api.ts` (deleted), and the Zustand stores (`lib/stores/`) are live. **Still pending: 09d styling** — `app/_landing/` uses Tailwind (preflight OFF) while `/login`, `/dashboard`, `/notes` still use inline `style` objects; 09d flips preflight ON and migrates those pages to shadcn. Check `specs/09-frontend-stack/implementation.md` before assuming a page's styling is migrated, and match the convention of the area you touch.

## File Structure

```
apps/web/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout; imports globals.css, sets metadata
│   ├── page.tsx                  # "/" route — renders the landing page
│   ├── globals.css               # Tailwind v4 import (no preflight) + theme tokens, keyframes, landing-only reset/overlays
│   ├── _landing/
│   │   ├── LandingPage.tsx       # Logged-out marketing page (slice 08); Tailwind-styled, OAuth CTAs, scroll-reveal
│   │   └── LandingPage.test.tsx  # Vitest unit test for the landing page goal state
│   ├── login/page.tsx            # OAuth sign-in (Google/GitHub); honors ?returnTo= (same-origin only)
│   ├── dashboard/page.tsx        # "My Notes" + "Shared with me"; create note, sign out; auth-gated
│   ├── notes/[id]/
│   │   ├── page.tsx              # Note shell: loads metadata, owner controls (Share/Delete), renders Editor
│   │   ├── Editor.tsx            # Hocuspocus/Yjs + TipTap editor; connection status, presence, permission, "made private" kick
│   │   └── ShareDialog.tsx       # Owner-only sharing panel: set view/edit access, copy link, make private
│   └── share/[token]/page.tsx    # Capability-link landing; logged out → /login?returnTo, logged in → join → /notes/:id
├── components/
│   └── ui/                       # [09d] shadcn/ui generated primitives (button, dialog, …) — owned, editable
├── lib/
│   ├── http.ts                   # apiFetch() low-level fetch (credentials, ApiError) — returns unknown; callers parse
│   ├── auth-token.ts             # getAuthToken() for the socket handshake (kept apart from Query — provider drives it)
│   ├── queries/                  # TanStack Query hooks: notes.ts (list/get + mutations), share.ts (join). Parse w/ @yapper/schemas
│   ├── stores/                   # Zustand: editor.ts (useEditorStore), ui.ts (useUiStore)
│   ├── query-client.ts           # [09a] TanStack QueryClient + provider mounted in layout.tsx
│   ├── queries/                  # [09c] useQuery/useMutation hooks (notes, share) — the data layer
│   ├── stores/                   # [09c] Zustand stores: editor/collab UI state, dialog/UI toggles
│   └── auth-client.ts            # Better Auth React client (signIn/signOut/useSession); baseURL = api origin
├── next.config.ts                # Empty config
├── postcss.config.mjs            # Loads @tailwindcss/postcss
├── vitest.config.ts              # jsdom env, globals, React plugin, ./vitest.setup.ts
├── vitest.setup.ts               # Imports @testing-library/jest-dom/vitest
├── tsconfig.json                 # Extends @yapper/typescript-config/nextjs.json
└── package.json
```

Generated/ignored: `.next/`, `next-env.d.ts`, `tsconfig.tsbuildinfo` — do not edit.

## Commands

Bun monorepo. Run app scripts from this directory (`apps/web`) so env (`.env`) and config resolve correctly:

- `bun run dev` — Next dev server on port 3000.
- `bun run build` — production build (`next build`).
- `bun run start` — serve the production build on port 3000.
- `bun run test` — run Vitest unit tests once (`vitest run`). Run from this dir.
- `bun run check-types` — `tsc --noEmit` type check.

Lint/format is Biome from the repo root (no per-app script here).

Env vars (read at runtime, with localhost fallbacks): `NEXT_PUBLIC_API_URL` (default `http://localhost:4000`), `NEXT_PUBLIC_SOCKET_URL` (default `ws://localhost:1234`).

## Conventions / Notes

- **Strict TypeScript; never use `as any`.** Existing code uses narrow casts (`as { user?: AwarenessUser }`) and `Exclude<>` types instead.
- **Client-first.** Every interactive page is a client component and gates on `useSession()` from `lib/auth-client.ts`, redirecting to `/login` when logged out. There is no Next data fetching on the server.
- **Cross-origin auth.** The Better Auth session cookie lives on the `api` origin. All requests use `credentials: "include"` so the cookie rides along — see `lib/api.ts` (`api()` helper) and `auth-client.ts` (`baseURL`).
- **Data layer = TanStack Query.** Server state goes through `useQuery`/`useMutation` hooks in `lib/queries/`, which call `apiFetch` (`lib/http.ts`) and parse responses with `@yapper/schemas`. Mutations invalidate via the `noteKeys` factory. Do **not** put server data in Zustand or component state. Add new backend calls as hooks here (not raw `fetch`). The socket JWT comes from `getAuthToken()` in `lib/auth-token.ts` (the Hocuspocus provider drives socket auth, not Query).
- **Client/UI state = Zustand.** Cross-component non-server state lives in `lib/stores/`: the editor/collab store (connection status, presence list, current permission, "made private" banner) and a UI store (dialog/toast toggles). Keep purely-local state in `useState`; reach for a store only when state must cross components.
- **Validation = Zod via `@yapper/schemas`.** Validate form input and parse API responses with shared schemas; import contract types from `@yapper/schemas` rather than redefining shapes. Never trust an unparsed response.
- **Animation = Motion, sparingly.** Use `import { motion } from "motion/react"` for dialogs, list/page transitions, and landing reveals where it adds clarity. Respect `prefers-reduced-motion`. Don't animate everything.
- **Realtime editor (`Editor.tsx`).** A `HocuspocusProvider` connects to `NEXT_PUBLIC_SOCKET_URL` with `name: noteId` and a fresh JWT per (re)connect via `token: () => getAuthToken()`. Extensions come from `buildExtensions(provider.document)` plus `CollaborationCaret`. The socket pushes stateless messages: `identity` (sets the awareness user), `permission` (`none|view|edit` → toggles `editor.setEditable`), and a `kick` with reason `note_made_private` → shows the "Note made private by owner" banner and disconnects. Presence is derived from Yjs awareness states, deduped by user id.
- **Permissions are server-driven.** The editor starts `editable: false` and only becomes editable when the socket sends `permission: "edit"`. Do not infer edit rights client-side.
- **Styling — migrating to Tailwind + shadcn (preflight ON).** Target: preflight ON globally, every page styled with Tailwind utilities + shadcn/ui components (`components/ui/`). *Current state during 09:* preflight is still OFF (a reset scoped to `.lp-root`) and `/login`, `/dashboard`, `/notes` use inline `style` objects; the landing page already uses Tailwind. Slice 09d flips preflight ON and rewrites the inline-styled pages (login → dashboard → notes → ShareDialog), at which point the `.lp-root`-scoped reset is removed. Match whichever convention the page you're editing currently uses, and follow the spec's migration order.
- **Tests** live next to source as `*.test.tsx` and mock `lib/auth-client` to assert OAuth flows. Per project rules, write a goal-state test before implementing a spec (see `app/_landing/LandingPage.test.tsx`).
