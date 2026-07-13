<h1 align="center">Yapper</h1>

<p align="center">
  <b>Shared notes you write together, in real time — and can take back with one click.</b>
</p>

Yapper is a collaborative rich-text note app. Several people edit the same note at once and see each other's live cursors. The owner shares a note with a secret link, decides whether people can **view** or **edit**, and can flip it back to **private** at any moment — everyone else is disconnected instantly.

## What you get

- **Write together, live.** Multiple cursors, real names, no "who has the file open?"
- **Share with a link.** Anyone opening it still has to log in with Google or GitHub — no anonymous guests.
- **One switch for access.** `private → view → edit`, set by the owner, applies to everyone on the note.
- **Take it back instantly.** Going private rotates the link, revokes collaborators, and kicks every other editor with "note made private by owner." The owner stays put.
- **Fast, even offline.** Notes are stored on-device and render instantly; edits keep working with no connection and sync when you're back.

## Why not just use a normal note app?

Sharing usually means picking between a public link anyone can forward, or a permission system that's a chore to manage. Yapper keeps it simple: a link to share, a real identity behind every cursor, and one switch to pull the note back to private with nothing left lingering.

## Tech stack

- **Monorepo:** Turborepo + Bun workspaces — three apps (`web`, `api`, `socket`) plus shared `packages` (`db`, `auth`, `editor`, `permissions`, `schemas`, `typescript-config`)
- **Web:** Next.js, TypeScript (strict), Tailwind CSS + shadcn/ui (Radix), TanStack Query (server state), Zustand (UI state), Motion (animation), TipTap editor, Yjs + `@hocuspocus/provider`
- **Local-first:** Dexie (IndexedDB) working set, client-minted note ids, push/pull sync engine over REST + SSE (Redis poke), service worker for the offline app shell
- **API:** Bun + Express, Better Auth handler, notes & sharing REST, sync push/pull endpoints, note metadata + collaborator records
- **Socket:** Bun + Hocuspocus (Yjs WebSocket backend), Redis extensions for cross-instance fanout and persistence
- **Data & realtime:** PostgreSQL + Drizzle ORM, Redis (Yjs fanout, revoke broadcast, permissions cache), Yjs CRDT
- **Auth:** Better Auth (Google + GitHub OAuth, JWT/JWKS — socket verifies the handshake statelessly)
- **Validation:** Zod schemas shared across web/api/socket via `@yapper/schemas` — one contract per boundary
- **Tooling:** Biome (lint + format), Vitest (unit tests)

## Getting started

```sh
bun install
bun run dev      # boots web, api, and socket via Turborepo
```

Each app reads its config from a local `.env` (see each app's `.env.example`) — you'll need a Postgres URL and a Redis URL (hosted or local) plus Google/GitHub OAuth credentials.

Quality gates: `bun run check` (Biome), `bun run check-types`, `bun run test`. Per-app tests: `bun run test:web`, `test:api`, `test:socket`, `test:db`.
