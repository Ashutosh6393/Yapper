<h1 align="center">Yapper</h1>

<p align="center">
  Yapper is a collaborative, real-time rich-text note-taking app where multiple people write in the same document at once and see each other's live cursors and selections. Every note starts private to its owner, who shares it through an unguessable capability link and controls a single access level — <b>private → view → edit</b> — for everyone who joins. Logging in with Google or GitHub is mandatory, so every collaborator is a tracked identity rather than an anonymous guest. At any moment the owner can flip a note back to private, instantly disconnecting every other editor with a clear "note made private by owner."
</p>

## The problem it solves

Sharing notes usually forces a bad trade-off: public links that anyone can pass around with no accountability, or heavyweight permission systems that are clumsy to manage. Yapper gives note owners precise, instant, owner-controlled access — link-based sharing with real identities behind every cursor, and a single switch to revoke live collaboration and pull a note back to private without leftover access lingering.

## How it's different

- **vs. traditional note apps** (single-user, manual export/share): Yapper is multiplayer by design. Edits merge conflict-free via CRDTs (Yjs), and you see *what is being edited* in real time — live cursors and selections, not just a saved file.
- **vs. typical real-time collab apps**: most lean on broad "anyone with the link can edit" sharing. Yapper enforces **mandatory login**, **tracked collaborators**, a **single owner-controlled access level**, and **instant revocation** — toggling private rotates the share token, marks collaborators revoked, and disconnects everyone but the owner the moment it happens.

## Tech stack

- **Monorepo:** Turborepo + Bun workspaces — three apps (`web`, `api`, `socket`) plus shared `packages`
- **Web:** Next.js, TypeScript (strict), Tailwind CSS, TipTap editor, Yjs + `@hocuspocus/provider`
- **API:** Bun + Express, Better Auth handler, notes & sharing REST, note metadata + collaborator records
- **Socket:** Bun + Hocuspocus (Yjs WebSocket backend), Redis extensions for cross-instance fanout and persistence
- **Data & realtime:** PostgreSQL + Drizzle ORM, Redis (Yjs fanout, revoke broadcast, permissions cache), Yjs CRDT
- **Auth:** Better Auth (Google + GitHub OAuth, JWT/JWKS — socket verifies the handshake statelessly)
- **Tooling:** Biome (lint + format), Vitest (unit tests), Docker Compose for local Postgres + Redis

## Getting started

```sh
bun install
bun run dev      # boots web, api, and socket via Turborepo
```

Each app reads its config from a local `.env` (see each app's `.env.example`). Run quality gates with `bun run check`, `bun run check-types`, and `bun run test`.
